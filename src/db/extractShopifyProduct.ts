import axios from 'axios';
import * as cheerio from 'cheerio';
import { writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Extracts product data from a Shopify product URL
 * 
 * This script extracts all fields from the Product schema (prisma/schema.prisma):
 * - title: Extracted from HTML/JSON-LD (required - slug will be generated from this)
 * - description: Extracted from HTML/JSON-LD (optional)
 * - images: Array of image URLs (String[])
 * - videos: Array of video URLs (String[])
 * 
 * Note: The following fields are NOT extracted and will be assigned automatically:
 * - slug: Generated from product title during import
 * - categories: Assigned automatically from DB based on title/description matching
 * - tags: Assigned automatically from DB based on title/description matching
 * - priceBandId: Assigned automatically based on title/description mapping (mapping to be provided)
 */
interface ExtractedProduct {
  // Required fields (matching Product schema)
  title: string;
  description?: string;
  images: string[]; // Array of image URLs (matching String[] in schema)
  videos: string[]; // Array of video URLs (matching String[] in schema)
  
  // Optional fields that might be useful but not in schema
  canonicalUrl?: string;
  
  // Pricing info (for reference, but priceBandId is set separately)
  price?: number;
  originalPrice?: number;
  currency?: string;
  
  // Variants (for reference, pricing comes from PriceBand)
  variants?: Array<{
    id: string;
    title: string;
    price: number;
    compareAtPrice?: number;
    available: boolean;
    sku?: string;
    options?: Record<string, string>;
  }>;

  // SEO (for reference, not in schema but useful)
  metaTitle?: string;
  metaDescription?: string;

  // Additional Info (for reference)
  vendor?: string;
  productType?: string;
  stockStatus?: string;
  availability?: string;

  // Structured Data (for reference)
  structuredData?: any;
}

/**
 * Slug extraction is no longer needed - slug will be generated from product title
 * during import process
 */

/**
 * Extracts JSON-LD structured data from HTML
 */
function extractJsonLd($: cheerio.Root): any[] {
  const jsonLdData: any[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const content = $(element).html();
      if (content) {
        const data = JSON.parse(content);
        jsonLdData.push(data);
      }
    } catch (error) {
      console.warn('Failed to parse JSON-LD:', error);
    }
  });

  return jsonLdData;
}

/**
 * Extracts product data from JSON-LD
 */
function extractFromJsonLd(jsonLdData: any[]): Partial<ExtractedProduct> {
  const product: Partial<ExtractedProduct> = {};

  for (const data of jsonLdData) {
    if (data['@type'] === 'Product' || data['@graph']?.some((item: any) => item['@type'] === 'Product')) {
      const productData = data['@type'] === 'Product' ? data : data['@graph']?.find((item: any) => item['@type'] === 'Product');

      if (productData) {
        product.title = productData.name || product.title;
        product.description = productData.description || product.description;
        product.metaTitle = productData.name || product.metaTitle;
        product.metaDescription = productData.description || product.metaDescription;

        // Extract offers/price
        if (productData.offers) {
          const offers = Array.isArray(productData.offers) ? productData.offers : [productData.offers];
          const mainOffer = offers[0];
          if (mainOffer) {
            // JSON-LD prices are usually in correct format (pounds/dollars), but normalize just in case
            product.price = normalizePrice(parseFloat(mainOffer.price)) || product.price;
            product.currency = mainOffer.priceCurrency || product.currency || 'USD';
            // Check for old price in offer (some schemas include priceSpecification or listPrice)
            if (mainOffer.priceSpecification?.value) {
              product.originalPrice = normalizePrice(parseFloat(mainOffer.priceSpecification.value));
            }
            if (mainOffer.listPrice) {
              product.originalPrice = normalizePrice(parseFloat(mainOffer.listPrice));
            }
            if (mainOffer.availability) {
              product.availability = mainOffer.availability;
              product.stockStatus = mainOffer.availability.includes('InStock') ? 'IN_STOCK' : 'OUT_OF_STOCK';
            }
          }
        }

        // Extract images (handled separately in extractImages function)
        // This is kept for backward compatibility but images are extracted more comprehensively elsewhere

        // Extract brand/vendor
        if (productData.brand) {
          product.vendor = typeof productData.brand === 'string' ? productData.brand : productData.brand.name;
        }

        // Categories are now managed separately from navigation
        // No longer extracting from JSON-LD
      }
    }
  }

  return product;
}

/**
 * Extracts product data from Shopify's window object (if available in script tags)
 */
function extractFromShopifyWindow($: cheerio.Root): Partial<ExtractedProduct> {
  const product: Partial<ExtractedProduct> = {};

  // Try to find Shopify product data in script tags
  $('script').each((_, element) => {
    const scriptContent = $(element).html() || '';

    // Look for window.Shopify or ShopifyAnalytics
    if (scriptContent.includes('Shopify') || scriptContent.includes('product')) {
      try {
        // Try to extract product JSON
        const productMatch = scriptContent.match(/product[:\s]*({[^}]+})/i);
        if (productMatch) {
          const productData = JSON.parse(productMatch[1]);
          // Extract relevant data
          if (productData.title) product.title = productData.title;
          if (productData.description) product.description = productData.description;
          if (productData.vendor) product.vendor = productData.vendor;
          if (productData.type) product.productType = productData.type;
          // Tags are now managed separately from filters
          // No longer extracting from Shopify window object
        }

        // Try to extract variants
        const variantsMatch = scriptContent.match(/variants[:\s]*(\[[^\]]+\])/i);
        if (variantsMatch) {
          const variants = JSON.parse(variantsMatch[1]);
          product.variants = variants.map((v: any, index: number) => ({
            id: v.id?.toString() || index.toString(),
            title: v.title || v.name || 'Default',
            price: normalizePrice(parseFloat(v.price)) || 0,
            compareAtPrice: v.compare_at_price ? normalizePrice(parseFloat(v.compare_at_price)) : undefined,
            available: v.available !== false,
            sku: v.sku,
          }));

          // Extract original price from first variant's compare_at_price if available
          if (variants.length > 0 && variants[0].compare_at_price) {
            product.originalPrice = normalizePrice(parseFloat(variants[0].compare_at_price));
          }
        }

        // Try to extract product price data directly
        const priceMatch = scriptContent.match(/["']price["']\s*:\s*["']?(\d+\.?\d*)["']?/i);
        const comparePriceMatch = scriptContent.match(/["']compare_at_price["']\s*:\s*["']?(\d+\.?\d*)["']?/i);
        if (priceMatch && !product.price) {
          product.price = normalizePrice(parseFloat(priceMatch[1]));
        }
        if (comparePriceMatch && !product.originalPrice) {
          product.originalPrice = normalizePrice(parseFloat(comparePriceMatch[1]));
        }
      } catch (error) {
        // Silently fail - not all scripts will have parseable data
      }
    }
  });

  return product;
}

/**
 * Extracts data from HTML meta tags
 */
function extractFromMetaTags($: cheerio.Root): Partial<ExtractedProduct> {
  const product: Partial<ExtractedProduct> = {};

  // Meta title
  product.metaTitle = $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    $('title').text() ||
    undefined;

  // Meta description
  product.metaDescription = $('meta[property="og:description"]').attr('content') ||
    $('meta[name="twitter:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    undefined;

  // Canonical URL
  const canonicalUrl = $('link[rel="canonical"]').attr('href') ||
    $('meta[property="og:url"]').attr('content');
  if (canonicalUrl) {
    product.canonicalUrl = canonicalUrl.startsWith('http') ? canonicalUrl : new URL(canonicalUrl, 'https://example.com').href;
  }

  // Price from meta tags
  const priceMeta = $('meta[property="product:price:amount"]').attr('content');
  if (priceMeta) {
    product.price = parseFloat(priceMeta);
    product.currency = $('meta[property="product:price:currency"]').attr('content') || 'USD';
  }

  return product;
}

/**
 * Extracts images from JSON-LD structured data
 */
function extractImagesFromJsonLd(jsonLdData: any[]): Array<{ url: string; alt?: string; position: number }> {
  const images: Array<{ url: string; alt?: string; position: number }> = [];
  let position = 0;

  for (const data of jsonLdData) {
    if (data['@type'] === 'Product' || data['@graph']?.some((item: any) => item['@type'] === 'Product')) {
      const productData = data['@type'] === 'Product' ? data : data['@graph']?.find((item: any) => item['@type'] === 'Product');

      if (productData?.image) {
        const imageArray = Array.isArray(productData.image) ? productData.image : [productData.image];
        imageArray.forEach((img: string | { url?: string; contentUrl?: string }) => {
          let imageUrl = '';
          if (typeof img === 'string') {
            imageUrl = img;
          } else if (img.url) {
            imageUrl = img.url;
          } else if (img.contentUrl) {
            imageUrl = img.contentUrl;
          }

          if (imageUrl && !images.some(i => i.url === imageUrl)) {
            images.push({
              url: imageUrl,
              position: position++,
            });
          }
        });
      }
    }
  }

  return images;
}

/**
 * Extracts images from Shopify product data in script tags
 * More aggressive extraction to find all product images
 */
function extractImagesFromShopifyData($: cheerio.Root, baseUrl: string): Array<{ url: string; alt?: string; position: number }> {
  const images: Array<{ url: string; alt?: string; position: number }> = [];
  const seenUrls = new Set<string>();
  let position = 0;

  // Look for Shopify product JSON in script tags
  $('script').each((_, element) => {
    const scriptContent = $(element).html() || '';

    // Look for various Shopify product data patterns
    if (scriptContent.includes('"media"') || scriptContent.includes('"images"') || scriptContent.includes('product')) {
      try {
        // Pattern 1: window.ShopifyAnalytics.meta.product
        const shopifyMetaMatch = scriptContent.match(/window\.ShopifyAnalytics\.meta\.product\s*=\s*(\{[\s\S]*?\});/i);
        if (shopifyMetaMatch) {
          try {
            const productData = JSON.parse(shopifyMetaMatch[1]);
            if (productData.media && Array.isArray(productData.media)) {
              productData.media.forEach((media: any) => {
                let imageUrl = media.src || media.url || media.preview?.image?.url || (media.media_type === 'image' ? media.src : null);
                if (imageUrl) {
                  // Ensure absolute URL
                  imageUrl = ensureAbsoluteUrl(imageUrl, baseUrl);
                  if (!seenUrls.has(imageUrl)) {
                    seenUrls.add(imageUrl);
                    images.push({
                      url: imageUrl,
                      alt: media.alt || media.alt_text || '',
                      position: position++,
                    });
                  }
                }
              });
            }
          } catch (e) {
            // Continue
          }
        }

        // Pattern 2: Product JSON with media array
        const mediaArrayMatch = scriptContent.match(/"media"\s*:\s*(\[[\s\S]*?\])/i);
        if (mediaArrayMatch) {
          try {
            const mediaArray = JSON.parse(mediaArrayMatch[1]);
            if (Array.isArray(mediaArray)) {
              mediaArray.forEach((media: any) => {
                if (media && (media.src || media.url || media.preview?.image?.url)) {
                  let imageUrl = media.src || media.url || media.preview?.image?.url;
                  // Ensure absolute URL
                  imageUrl = ensureAbsoluteUrl(imageUrl, baseUrl);
                  if (imageUrl && !seenUrls.has(imageUrl)) {
                    seenUrls.add(imageUrl);
                    images.push({
                      url: imageUrl,
                      alt: media.alt || media.alt_text || '',
                      position: position++,
                    });
                  }
                }
              });
            }
          } catch (e) {
            // Continue
          }
        }

        // Pattern 3: Product JSON with images array
        const imagesArrayMatch = scriptContent.match(/"images?"\s*:\s*(\[[\s\S]*?\])/i);
        if (imagesArrayMatch) {
          try {
            const imagesArray = JSON.parse(imagesArrayMatch[1]);
            if (Array.isArray(imagesArray)) {
              imagesArray.forEach((img: any) => {
                let imageUrl = typeof img === 'string' ? img : (img.src || img.url);
                if (imageUrl) {
                  // Ensure absolute URL
                  imageUrl = ensureAbsoluteUrl(imageUrl, baseUrl);
                  if (!seenUrls.has(imageUrl)) {
                    seenUrls.add(imageUrl);
                    images.push({
                      url: imageUrl,
                      position: position++,
                    });
                  }
                }
              });
            }
          } catch (e) {
            // Continue
          }
        }

        // Pattern 4: Look for product JSON object more broadly (with price data)
        const productObjectMatch = scriptContent.match(/\{[\s\S]*?"id"[\s\S]*?(?:"media"|"price"|"compare_at_price")[\s\S]*?\}/i);
        if (productObjectMatch) {
          try {
            const productData = JSON.parse(productObjectMatch[0]);
            if (productData.media && Array.isArray(productData.media)) {
              productData.media.forEach((media: any) => {
                let imageUrl = media.src || media.url || media.preview?.image?.url;
                if (imageUrl) {
                  // Ensure absolute URL
                  imageUrl = ensureAbsoluteUrl(imageUrl, baseUrl);
                  if (!seenUrls.has(imageUrl)) {
                    seenUrls.add(imageUrl);
                    images.push({
                      url: imageUrl,
                      alt: media.alt || media.alt_text || '',
                      position: position++,
                    });
                  }
                }
              });
            }
            if (productData.images && Array.isArray(productData.images)) {
              productData.images.forEach((img: string) => {
                if (img) {
                  // Ensure absolute URL
                  let imageUrl = ensureAbsoluteUrl(img, baseUrl);
                  if (!seenUrls.has(imageUrl)) {
                    seenUrls.add(imageUrl);
                    images.push({
                      url: imageUrl,
                      position: position++,
                    });
                  }
                }
              });
            }
          } catch (e) {
            // Continue
          }
        }

        // Pattern 5: Look for compare_at_price specifically
        const comparePriceMatch = scriptContent.match(/"compare_at_price"[\s\S]*?(\d+\.?\d*)/i);
        if (comparePriceMatch) {
          try {
            const comparePrice = parseFloat(comparePriceMatch[1]);
            if (comparePrice && !isNaN(comparePrice)) {
              // Store in a way that can be retrieved later
              // We'll extract this in extractFromShopifyWindow
            }
          } catch (e) {
            // Continue
          }
        }
      } catch (error) {
        // Silently continue
      }
    }
  });

  return images;
  return images;
}

/**
 * Extracts videos from HTML (iframe or video tags)
 */
function extractVideosFromHtml($: cheerio.Root, baseUrl: string): Array<{ url: string; thumbnail?: string; type: 'video' | 'external_video'; position: number }> {
  const videos: Array<{ url: string; thumbnail?: string; type: 'video' | 'external_video'; position: number }> = [];
  const seenUrls = new Set<string>();
  let position = 2000; // Start higher than script videos

  // Selectors for product media containers
  const mediaSelectors = [
    '.product__media',
    '.product-single__media',
    '.product-media',
    '.product__media-list',
    '[data-product-media-type="video"]',
    '[data-product-media-type="external_video"]',
    '.product-gallery'
  ];

  mediaSelectors.forEach(selector => {
    $(selector).each((_, container) => {
      // Check for HTML5 Video
      $(container).find('video source').each((_, source) => {
        let src = $(source).attr('src');
        if (src) {
          src = ensureAbsoluteUrl(src, baseUrl);
        }
        if (src && !seenUrls.has(src)) {
          seenUrls.add(src);
          // Try to find a poster/thumbnail on the parent video tag
          let poster = $(source).parent('video').attr('poster');
          if (poster) poster = ensureAbsoluteUrl(poster, baseUrl);

          videos.push({
            url: src,
            thumbnail: poster,
            type: 'video',
            position: position++
          });
        }
      });

      // Check for YouTube/Vimeo iframes
      $(container).find('iframe').each((_, iframe) => {
        let src = $(iframe).attr('src');
        if (src) {
          src = ensureAbsoluteUrl(src, baseUrl);
          let type: 'external_video' | null = null;
          if (src.includes('youtube') || src.includes('youtu.be')) {
            type = 'external_video';
          } else if (src.includes('vimeo')) {
            type = 'external_video';
          }

          if (type && !seenUrls.has(src)) {
            seenUrls.add(src);
            videos.push({
              url: src,
              type: type,
              position: position++
            });
          }
        }
      });

      // Check for data-attributes that might hold video info (lazy loaded)
      const videoData = $(container).attr('data-video-id');
      if (videoData) {
        // console.log(`[DEBUG] Found data-video-id: ${videoData}`);
      }
    });
  });

  return videos;
}

/**
 * Helper to find valid JSON objects within a string
 */
function findJsonObjects(text: string): any[] {
  const results: any[] = [];
  let startIndex = 0;

  while (true) {
    // Find next possible start of JSON object
    startIndex = text.indexOf('{', startIndex);
    if (startIndex === -1) break;

    // Attempt to parse from this start index
    // We'll use a simple brace balancer to find potential end
    let braceCount = 0;
    let inString = false;
    let escaped = false;
    let endIndex = -1;

    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            endIndex = i;
            break;
          }
        }
      }
    }

    if (endIndex !== -1) {
      const potentialJson = text.substring(startIndex, endIndex + 1);
      try {
        const parsed = JSON.parse(potentialJson);
        // Basic heuristic to filter out trivial objects
        if (parsed && typeof parsed === 'object' && (parsed.media || parsed.videos || parsed.product)) {
          results.push(parsed);
        }
      } catch (e) {
        // Not valid JSON, continue
      }
      startIndex = startIndex + 1; // Move past just the opening brace to find nested or next objects
    } else {
      break; // No matching brace found
    }
  }

  return results;
}

/**
 * Extracts videos from Shopify product data in script tags
 */
function extractVideosFromShopifyData($: cheerio.Root, baseUrl: string): Array<{ url: string; thumbnail?: string; type: 'video' | 'external_video'; position: number }> {
  const videos: Array<{ url: string; thumbnail?: string; type: 'video' | 'external_video'; position: number }> = [];
  const seenUrls = new Set<string>();
  let position = 1000;

  $('script').each((_, element) => {
    const scriptContent = $(element).html() || '';

    // Skip if too short
    if (scriptContent.length < 50) return;

    // Use robust JSON extraction
    const jsonObjects = findJsonObjects(scriptContent);

    for (const data of jsonObjects) {
      // Direct media array
      if (data.media && Array.isArray(data.media)) {
        data.media.forEach((media: any) => {
          if (media.media_type === 'video' || media.media_type === 'external_video') {
            const videoObj = extractVideoFromMediaObject(media, position++, baseUrl);
            if (videoObj && !seenUrls.has(videoObj.url)) {
              seenUrls.add(videoObj.url);
              videos.push(videoObj);
            }
          }
        });
      }

      // Product object wrapper
      if (data.product && data.product.media && Array.isArray(data.product.media)) {
        data.product.media.forEach((media: any) => {
          if (media.media_type === 'video' || media.media_type === 'external_video') {
            const videoObj = extractVideoFromMediaObject(media, position++, baseUrl);
            if (videoObj && !seenUrls.has(videoObj.url)) {
              seenUrls.add(videoObj.url);
              videos.push(videoObj);
            }
          }
        });
      }
    }

    // Fallback: Check for "ReelUp" or other specific video commerce patterns in raw text if JSON failed
    if (scriptContent.includes('ReelUp') && scriptContent.includes('.mp4')) {
      // Try simple regex for mp4 urls in ReelUp scripts
      const mp4Matches = scriptContent.matchAll(/["'](https:\/\/[^"']+\.mp4[^"']*)["']/g);
      for (const match of mp4Matches) {
        let src = match[1];
        if (src) {
          src = ensureAbsoluteUrl(src, baseUrl);
          if (!seenUrls.has(src)) {
            seenUrls.add(src);
            videos.push({
              url: src,
              type: 'video',
              position: position++
            });
          }
        }
      }
    }
  });

  return videos;
}

function extractVideoFromMediaObject(media: any, position: number, baseUrl: string): { url: string; thumbnail?: string; type: 'video' | 'external_video'; position: number } | null {
  if (media.media_type === 'video') {
    // Find best source (mp4)
    const sources = media.sources || [];
    const mp4Source = sources.find((s: any) => s.format === 'mp4') || sources[0];
    if (mp4Source && mp4Source.url) {
      let url = ensureAbsoluteUrl(mp4Source.url, baseUrl);

      // Clean up URL parameters mostly
      try {
        const urlObj = new URL(url);
        // Keep search params for Shopify videos as they might be needed (tokens etc), 
        // but maybe strip some if known to be garbage.
        // For now, keep as is.
        url = urlObj.toString();
      } catch (e) { }

      let thumbnail = media.preview_image?.src || media.src;
      if (thumbnail) thumbnail = ensureAbsoluteUrl(thumbnail, baseUrl);

      return {
        url: url,
        thumbnail: thumbnail,
        type: 'video',
        position: media.position || position
      };
    }
  } else if (media.media_type === 'external_video') {
    if (media.external_id) {
      // Construct embed URL based on host
      let url = '';
      if (media.host === 'youtube') {
        url = `https://www.youtube.com/embed/${media.external_id}`;
      } else if (media.host === 'vimeo') {
        url = `https://player.vimeo.com/video/${media.external_id}`;
      }

      if (url) {
        let thumbnail = media.preview_image?.src;
        if (thumbnail) thumbnail = ensureAbsoluteUrl(thumbnail, baseUrl);

        return {
          url,
          thumbnail: thumbnail,
          type: 'external_video',
          position: media.position || position
        };
      }
    }
  }
  return null;
}

/**
 * Normalizes Shopify CDN URLs to get the best quality version
 */
function normalizeShopifyImageUrl(url: string): string {
  if (!url) return url;

  // Remove size parameters to get original or use a high-quality size
  // Shopify CDN URLs typically have ?v=timestamp&width=size
  // We can request larger sizes or remove width to get original
  try {
    const urlObj = new URL(url);

    // If it's a Shopify CDN URL, optimize it
    if (urlObj.hostname.includes('shopify') || urlObj.hostname.includes('cdn.shopify') || urlObj.pathname.includes('/cdn/shop/')) {
      // Remove width parameter or set to a high value for better quality
      urlObj.searchParams.delete('width');
      urlObj.searchParams.delete('height');
      // Keep the version parameter (v=) as it's important for cache busting
      return urlObj.toString();
    }

    return url;
  } catch {
    return url;
  }
}

/**
 * Converts URL to absolute URL with https:// protocol
 */
function ensureAbsoluteUrl(url: string, baseUrl: string): string {
  if (!url) return url;

  // If already absolute with protocol, return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // If starts with //, add https:
  if (url.startsWith('//')) {
    return 'https:' + url;
  }

  // If starts with /, make absolute from base URL
  if (url.startsWith('/')) {
    try {
      const urlObj = new URL(baseUrl);
      return `${urlObj.protocol}//${urlObj.host}${url}`;
    } catch {
      return 'https://' + url.replace(/^\/+/, '');
    }
  }

  // Relative URL - make absolute
  try {
    return new URL(url, baseUrl).href;
  } catch {
    // Fallback: assume https
    return 'https://' + url.replace(/^\/+/, '');
  }
}

/**
 * Gets a normalized URL key for duplicate detection (removes query params except version)
 */
function getImageUrlKey(url: string): string {
  if (!url) return url;

  // Normalize protocol first
  let normalized = url;
  if (normalized.startsWith('//')) {
    normalized = 'https:' + normalized;
  }

  try {
    const urlObj = new URL(normalized);
    // Keep only the pathname and version param for duplicate detection
    const version = urlObj.searchParams.get('v');
    // Use pathname without protocol/host for comparison
    return `${urlObj.pathname}${version ? `?v=${version}` : ''}`;
  } catch {
    // If URL parsing fails, return pathname part
    const pathMatch = normalized.match(/\/[^?#]+/);
    return pathMatch ? pathMatch[0] : normalized.split('?')[0];
  }
}

/**
 * Checks if an image URL is a product image (not navigation, icon, etc.)
 */
function isProductImageUrl(url: string, alt?: string): boolean {
  if (!url) return false;

  const urlLower = url.toLowerCase();
  const altLower = (alt || '').toLowerCase();

  // Exclude patterns - if URL or alt contains these, it's not a product image
  const excludePatterns = [
    /icon/i,
    /logo/i,
    /banner/i,
    /badge/i,
    /button/i,
    /nav/i,
    /navigation/i,
    /header/i,
    /footer/i,
    /social/i,
    /cart/i,
    /search/i,
    /menu/i,
    /placeholder/i,
    /loading/i,
    /spinner/i,
    /arrow/i,
    /chevron/i,
    /close/i,
    /checkmark/i,
    /star/i,
    /rating/i,
  ];

  // Check alt text
  if (altLower && excludePatterns.some(pattern => pattern.test(altLower))) {
    return false;
  }

  // Check URL path
  if (excludePatterns.some(pattern => pattern.test(urlLower))) {
    return false;
  }

  // Must be a Shopify CDN URL with product-related paths
  // Only accept URLs that contain product-specific paths
  const hasProductPath =
    urlLower.includes('/products/') ||
    (urlLower.includes('/files/') && !urlLower.includes('icon') && !urlLower.includes('logo'));

  // Check if it's a Shopify CDN URL (can be cdn.shopify.com or the store's CDN)
  const isShopifyCdn =
    urlLower.includes('cdn.shopify') ||
    urlLower.includes('cdn.shopifycdn') ||
    urlLower.includes('/cdn/shop/'); // Shopify stores often use /cdn/shop/ path

  // Must be both Shopify CDN AND have product path
  // OR if it's from a product container and looks like a product image file
  const hasImageExtension = !!urlLower.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i);
  const isNotIconLogo = !urlLower.match(/icon|logo|banner|badge/i);
  const looksLikeProductImage = hasImageExtension && isNotIconLogo;

  return (hasProductPath && isShopifyCdn) || (isShopifyCdn && looksLikeProductImage);
}

/**
 * Extracts images from HTML - ONLY product images from trusted sources
 */
function extractImages($: cheerio.Root, baseUrl: string, jsonLdData: any[] = []): Array<{ url: string; alt?: string; position: number }> {
  const images: Array<{ url: string; alt?: string; position: number }> = [];
  const seenUrls = new Set<string>();
  const seenUrlKeys = new Set<string>(); // For better duplicate detection

  // 1. Extract from JSON-LD structured data (MOST RELIABLE - only source we fully trust)
  const jsonLdImages = extractImagesFromJsonLd(jsonLdData);
  jsonLdImages.forEach(img => {
    // Ensure absolute URL first
    let absoluteUrl = ensureAbsoluteUrl(img.url, baseUrl);
    const normalizedUrl = normalizeShopifyImageUrl(absoluteUrl);
    const urlKey = getImageUrlKey(normalizedUrl);
    // Only add if it's a valid product image URL and not a duplicate
    if (normalizedUrl && isProductImageUrl(normalizedUrl, img.alt) && !seenUrlKeys.has(urlKey)) {
      seenUrls.add(normalizedUrl);
      seenUrlKeys.add(urlKey);
      images.push({ ...img, url: normalizedUrl });
    }
  });

  // 2. Extract from Shopify product script tags (more aggressive)
  const shopifyImages = extractImagesFromShopifyData($, baseUrl);
  shopifyImages.forEach(img => {
    // Ensure absolute URL first
    let absoluteUrl = ensureAbsoluteUrl(img.url, baseUrl);
    const normalizedUrl = normalizeShopifyImageUrl(absoluteUrl);
    const urlKey = getImageUrlKey(normalizedUrl);
    // Less strict check for script-extracted images - trust them more
    // Only filter out obvious non-product images
    if (normalizedUrl && !seenUrlKeys.has(urlKey)) {
      const urlLower = normalizedUrl.toLowerCase();
      const altLower = (img.alt || '').toLowerCase();

      // Only exclude if it's clearly not a product image
      const isExcluded =
        urlLower.includes('icon') ||
        urlLower.includes('logo') ||
        urlLower.includes('banner') ||
        altLower.includes('icon') ||
        altLower.includes('logo');

      // Must be Shopify CDN or product-related
      const isShopifyImage =
        urlLower.includes('cdn.shopify') ||
        urlLower.includes('/cdn/shop/') ||
        urlLower.includes('/files/') ||
        urlLower.includes('/products/');

      if (!isExcluded && isShopifyImage) {
        seenUrls.add(normalizedUrl);
        seenUrlKeys.add(urlKey);
        images.push({ ...img, url: normalizedUrl });
      }
    }
  });

  // 3. Extract from HTML - Find all product images in product galleries
  // First, find product image containers, then extract all images from them
  const productImageContainers = [
    '.product__media',
    '.product__media-wrapper',
    '.product-single__media',
    '.product-single__photos',
    '.product-photos',
    '.product-images',
    '.product-gallery',
    '.product-media',
    '[data-product-image]',
    '[data-product-media]',
    '[data-product-id]',
    '[data-product-handle]',
  ];

  let position = images.length;

  // Extract from product image containers
  for (const containerSelector of productImageContainers) {
    $(containerSelector).each((_, container) => {
      // Find all images within this product container
      $(container).find('img').each((_, element) => {
        // Try multiple attributes for image source
        const src = $(element).attr('src') ||
          $(element).attr('data-src') ||
          $(element).attr('data-lazy-src') ||
          $(element).attr('data-original') ||
          $(element).attr('data-image') ||
          $(element).attr('data-zoom-src') ||
          $(element).attr('data-product-image');

        const srcset = $(element).attr('srcset');
        const alt = $(element).attr('alt') || $(element).attr('data-alt') || '';

        if (src) {
          // Use srcset if available (usually higher quality)
          let imageUrl = src;
          if (srcset) {
            const srcsetUrls = srcset.split(',').map(s => s.trim().split(/\s+/)[0]);
            // Get the largest image from srcset
            imageUrl = srcsetUrls[srcsetUrls.length - 1] || imageUrl;
          }

          // Ensure absolute URL with https://
          imageUrl = ensureAbsoluteUrl(imageUrl, baseUrl);

          // Normalize Shopify CDN URLs
          imageUrl = normalizeShopifyImageUrl(imageUrl);
          const urlKey = getImageUrlKey(imageUrl);

          // Check: Must be a product image (not icon/logo) and from Shopify CDN
          // More lenient check for images in product containers
          if (imageUrl && !seenUrlKeys.has(urlKey)) {
            const urlLower = imageUrl.toLowerCase();
            const altLower = alt.toLowerCase();

            // Exclude obvious non-product images
            const isExcluded =
              urlLower.includes('icon') ||
              urlLower.includes('logo') ||
              urlLower.includes('banner') ||
              altLower.includes('icon') ||
              altLower.includes('logo');

            // Must be Shopify CDN or product-related
            const isShopifyImage =
              urlLower.includes('cdn.shopify') ||
              urlLower.includes('/cdn/shop/') ||
              urlLower.includes('/files/') ||
              urlLower.includes('/products/');

            if (!isExcluded && isShopifyImage) {
              seenUrls.add(imageUrl);
              seenUrlKeys.add(urlKey);
              images.push({
                url: imageUrl,
                alt: alt,
                position: position++,
              });
            }
          }
        }
      });

      // Also check for images in data attributes on the container itself
      const containerImage = $(container).attr('data-image') ||
        $(container).attr('data-image-src') ||
        $(container).attr('data-product-image');
      if (containerImage) {
        // Ensure absolute URL with https://
        let imageUrl = ensureAbsoluteUrl(containerImage, baseUrl);
        imageUrl = normalizeShopifyImageUrl(imageUrl);
        const urlKey = getImageUrlKey(imageUrl);
        if (imageUrl && isProductImageUrl(imageUrl) && !seenUrlKeys.has(urlKey)) {
          seenUrls.add(imageUrl);
          seenUrlKeys.add(urlKey);
          images.push({
            url: imageUrl,
            position: position++,
          });
        }
      }
    });
  }

  // Also look for images with product-specific data attributes
  $('img[data-product-image], img[data-product-media], img[data-media-id]').each((_, element) => {
    const src = $(element).attr('src') ||
      $(element).attr('data-src') ||
      $(element).attr('data-lazy-src') ||
      $(element).attr('data-product-image');
    const alt = $(element).attr('alt') || '';

    if (src) {
      // Ensure absolute URL with https://
      let imageUrl = ensureAbsoluteUrl(src, baseUrl);
      imageUrl = normalizeShopifyImageUrl(imageUrl);
      const urlKey = getImageUrlKey(imageUrl);
      if (imageUrl && isProductImageUrl(imageUrl, alt) && !seenUrlKeys.has(urlKey)) {
        seenUrls.add(imageUrl);
        seenUrlKeys.add(urlKey);
        images.push({
          url: imageUrl,
          alt: alt,
          position: position++,
        });
      }
    }
  });

  // 4. Check og:image ONLY if it's a product image
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage) {
    // Ensure absolute URL with https://
    let imageUrl = ensureAbsoluteUrl(ogImage, baseUrl);
    imageUrl = normalizeShopifyImageUrl(imageUrl);
    const urlKey = getImageUrlKey(imageUrl);
    if (imageUrl && isProductImageUrl(imageUrl) && !seenUrlKeys.has(urlKey)) {
      seenUrls.add(imageUrl);
      seenUrlKeys.add(urlKey);
      images.unshift({
        url: imageUrl,
        position: 0,
      });
    }
  }

  // Sort by position and remove duplicates
  const uniqueImages = Array.from(
    new Map(images.map(img => [img.url, img])).values()
  ).sort((a, b) => a.position - b.position);

  // Reassign positions to be sequential
  return uniqueImages.map((img, index) => ({ ...img, position: index }));
}

/**
 * Normalizes price - converts cents/pence to dollars/pounds if needed
 * Shopify often stores prices in cents in JSON but displays in dollars/pounds in HTML
 */
function normalizePrice(price: number | string | undefined): number | undefined {
  if (price === undefined || price === null) return undefined;
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(numPrice)) return undefined;

  // If price is > 100 and has no decimal part, it's likely in cents/pence
  // But we need to be careful - some prices might legitimately be > 100
  // So we check if it's a whole number and > 100
  if (numPrice > 100 && numPrice % 1 === 0) {
    // Could be cents, but let's be conservative - only convert if it's unreasonably high
    // For GBP, if it's > 1000 and whole number, likely cents
    if (numPrice > 1000) {
      return numPrice / 100;
    }
  }
  return numPrice;
}

/**
 * Extracts price from HTML
 */
function extractPrice($: cheerio.Root): { price?: number; originalPrice?: number; currency?: string } {
  const result: { price?: number; originalPrice?: number; currency?: string } = {};

  // Common price selectors
  const priceSelectors = [
    '.product__price .price',
    '.product-single__price .price',
    '.product-price',
    '[data-product-price]',
    '.price--current',
    '.price-current',
  ];

  const originalPriceSelectors = [
    '.product__price .price--compare',
    '.product-single__price .price--compare',
    '.price--compare',
    '.price-compare',
    '[data-compare-price]',
    '[data-compare-at-price]',
    's.price',
    '.price--was',
    '.price--original',
    '.was-price',
    '.original-price',
    '.compare-at-price',
    'del.price',
    'span.price--on-sale',
    '.sale-price',
    '.regular-price',
  ];

  // Extract current price
  for (const selector of priceSelectors) {
    const priceText = $(selector).first().text().trim();
    if (priceText) {
      // Improved regex to capture decimal prices: £17.71 or 17.71
      const priceMatch = priceText.match(/[£$€¥]?\s*([\d,]+\.?\d*)/);
      if (priceMatch) {
        const priceStr = priceMatch[1].replace(/,/g, '');
        const parsedPrice = parseFloat(priceStr);
        result.price = normalizePrice(parsedPrice);
        // Try to extract currency
        const currencyMatch = priceText.match(/[£$€¥]|GBP|USD|EUR|JPY/);
        if (currencyMatch) {
          const currencyMap: Record<string, string> = {
            '£': 'GBP',
            '$': 'USD',
            '€': 'EUR',
            '¥': 'JPY',
          };
          result.currency = currencyMap[currencyMatch[0]] || currencyMatch[0];
        }
        break;
      }
    }
  }

  // Extract original/compare price
  for (const selector of originalPriceSelectors) {
    const priceText = $(selector).first().text().trim();
    if (priceText) {
      // Improved regex to capture decimal prices
      const priceMatch = priceText.match(/[£$€¥]?\s*([\d,]+\.?\d*)/);
      if (priceMatch) {
        const priceStr = priceMatch[1].replace(/,/g, '');
        const parsedPrice = parseFloat(priceStr);
        // Only use if it's higher than current price (makes sense as old price)
        if (parsedPrice > (result.price || 0)) {
          result.originalPrice = parsedPrice;
          break;
        }
      }
    }
  }

  // Also try to find price in data attributes
  if (!result.originalPrice) {
    const comparePrice = $('[data-compare-price]').first().attr('data-compare-price') ||
      $('[data-compare-at-price]').first().attr('data-compare-at-price');
    if (comparePrice) {
      const priceMatch = comparePrice.match(/[£$€¥]?\s*([\d,]+\.?\d*)/);
      if (priceMatch) {
        const priceStr = priceMatch[1].replace(/,/g, '');
        const parsedPrice = normalizePrice(parseFloat(priceStr));
        if (parsedPrice && parsedPrice > (result.price || 0)) {
          result.originalPrice = parsedPrice;
        }
      }
    }
  }

  // Try to find strikethrough prices (common pattern: <s>£32.00</s> or ~~£32.00~~)
  if (!result.originalPrice) {
    $('s, del, .price--was, .was-price, .regular-price, [class*="was"], [class*="original"]').each((_, element) => {
      const priceText = $(element).text().trim();
      if (priceText) {
        const priceMatch = priceText.match(/[£$€¥]?\s*([\d,]+\.?\d*)/);
        if (priceMatch) {
          const priceStr = priceMatch[1].replace(/,/g, '');
          const parsedPrice = normalizePrice(parseFloat(priceStr));
          // Only use if it's higher than current price (makes sense as old price)
          if (parsedPrice && parsedPrice > (result.price || 0)) {
            result.originalPrice = parsedPrice;
            return false; // Break the loop
          }
        }
      }
    });
  }

  // Also look for "Regular price" or "Was" text patterns in the entire page
  if (!result.originalPrice) {
    const bodyText = $('body').text();
    // Look for patterns like "Regular price ~~£32.00~~" or "Regular price £32.00"
    const regularPricePatterns = [
      /regular\s+price\s*~~\s*[£$€¥]?\s*([\d,]+\.?\d*)\s*~~/i,
      /regular\s+price\s*[£$€¥]?\s*([\d,]+\.?\d*)/i,
      /was\s*[£$€¥]?\s*([\d,]+\.?\d*)/i,
      /original\s+price\s*[£$€¥]?\s*([\d,]+\.?\d*)/i,
    ];

    for (const pattern of regularPricePatterns) {
      const match = bodyText.match(pattern);
      if (match) {
        const priceStr = match[1].replace(/,/g, '');
        const parsedPrice = normalizePrice(parseFloat(priceStr));
        if (parsedPrice && parsedPrice > (result.price || 0)) {
          result.originalPrice = parsedPrice;
          break;
        }
      }
    }

    // Look for strikethrough pattern with tildes: ~~£32.00~~
    if (!result.originalPrice) {
      const tildeMatches = bodyText.matchAll(/~~\s*[£$€¥]?\s*([\d,]+\.?\d*)\s*~~/g);
      for (const match of tildeMatches) {
        const priceStr = match[1].replace(/,/g, '');
        const parsedPrice = normalizePrice(parseFloat(priceStr));
        if (parsedPrice && parsedPrice > (result.price || 0)) {
          result.originalPrice = parsedPrice;
          break;
        }
      }
    }
  }

  // Look in price containers for any higher price
  if (!result.originalPrice) {
    $('.product__price, .product-single__price, .product-price, [class*="price"]').each((_, element) => {
      const containerText = $(element).text();
      // Find all prices in this container
      const priceMatches = containerText.matchAll(/[£$€¥]?\s*([\d,]+\.?\d*)/g);
      const prices: number[] = [];
      for (const match of priceMatches) {
        const priceStr = match[1].replace(/,/g, '');
        const parsedPrice = normalizePrice(parseFloat(priceStr));
        if (parsedPrice && parsedPrice > 0) {
          prices.push(parsedPrice);
        }
      }
      // If we have multiple prices, the higher one is likely the old price
      if (prices.length >= 2) {
        prices.sort((a, b) => b - a); // Sort descending
        if (prices[0] > prices[1]) {
          result.originalPrice = prices[0];
          result.price = prices[1]; // Update current price to the lower one
          return false; // Break the loop
        }
      }
    });
  }

  return result;
}

/**
 * Extracts title from HTML
 */
function extractTitle($: cheerio.Root): string | undefined {
  const selectors = [
    'h1.product__title',
    'h1.product-single__title',
    '.product-title h1',
    'h1[data-product-title]',
    'h1',
  ];

  for (const selector of selectors) {
    const title = $(selector).first().text().trim();
    if (title) return title;
  }

  return undefined;
}

/**
 * Extracts description from HTML
 */
function extractDescription($: cheerio.Root): string | undefined {
  const selectors = [
    '.product__description',
    '.product-single__description',
    '.product-description',
    '[data-product-description]',
    '.rte',
  ];

  for (const selector of selectors) {
    const description = $(selector).first().html() || $(selector).first().text().trim();
    if (description) {
      // Clean up HTML but keep basic formatting
      return description.replace(/\s+/g, ' ').trim();
    }
  }

  return undefined;
}

/**
 * Categories and tags are now managed separately:
 * - Categories: Created from navigation.ts navlinks
 * - Tags: Created from filter options (colors and patterns)
 * This function is deprecated and returns empty arrays
 */
function extractCategoriesAndTags($: cheerio.Root): { categories: string[]; tags: string[] } {
  // Categories and tags are no longer extracted from HTML
  // They are managed separately based on navigation and filters
  return { categories: [], tags: [] };
}

/**
 * Main function to extract product data from a Shopify URL
 */
export async function extractShopifyProduct(url: string): Promise<ExtractedProduct> {
  try {
    console.log(`🔍 Fetching product from: ${url}`);

    // Fetch the HTML
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 30000,
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Initialize product object (matching Product schema)
    // Note: slug will be generated from title during import
    const product: ExtractedProduct = {
      title: '',
      description: undefined,
      images: [],
      videos: [],
      canonicalUrl: url,
      variants: [],
    };

    // Extract from different sources (order matters - most reliable first)
    console.log('📊 Extracting data from multiple sources...');

    // 1. JSON-LD structured data (most reliable)
    const jsonLdData = extractJsonLd($);
    if (jsonLdData.length > 0) {
      console.log('   ✓ Found JSON-LD structured data');
      const jsonLdProduct = extractFromJsonLd(jsonLdData);
      Object.assign(product, jsonLdProduct);
      product.structuredData = jsonLdData;
    }

    // 2. Meta tags
    const metaData = extractFromMetaTags($);
    Object.assign(product, metaData);

    // 3. HTML elements
    if (!product.title) {
      product.title = extractTitle($) || product.metaTitle || 'Unknown Product';
    }

    if (!product.description) {
      product.description = extractDescription($) || product.metaDescription || '';
    }

    // 4. Price from HTML (prioritize HTML extraction as it has correct decimal format)
    const priceData = extractPrice($);
    // HTML prices are more reliable (correct decimal format), so prioritize them
    if (priceData.price) {
      product.price = priceData.price;
    }
    // Always try to get original price from HTML (most reliable source)
    if (priceData.originalPrice) {
      product.originalPrice = priceData.originalPrice;
    }
    if (priceData.currency) {
      product.currency = priceData.currency;
    }

    // 5. Images from HTML (pass jsonLdData for better extraction)
    // Always extract images comprehensively, even if JSON-LD had some
    const images = extractImages($, url, jsonLdData);
    const scriptVideos = extractVideosFromShopifyData($, url);
    const htmlVideos = extractVideosFromHtml($, url);

    // Combine videos, avoiding duplicates
    const videos = [...scriptVideos];
    const seenVideoUrls = new Set(scriptVideos.map(v => v.url));

    htmlVideos.forEach(v => {
      if (!seenVideoUrls.has(v.url)) {
        videos.push(v);
        seenVideoUrls.add(v.url);
      }
    });

    // 6. Extract images and videos as arrays of URLs (matching Product schema)
    product.images = images.map(img => img.url);
    product.videos = videos.map(vid => vid.url);

    // 7. Try Shopify window object
    const shopifyData = extractFromShopifyWindow($);
    Object.assign(product, shopifyData);

    // Also check variants for compare_at_price if originalPrice not found
    if (!product.originalPrice && product.variants && product.variants.length > 0) {
      const variantWithComparePrice = product.variants.find((v: any) => v.compareAtPrice);
      if (variantWithComparePrice) {
        product.originalPrice = variantWithComparePrice.compareAtPrice;
      }
    }

    // Ensure we have at least basic data
    if (!product.title) {
      product.title = $('title').text() || 'Unknown Product';
    }

    console.log('✅ Extraction complete!');
    console.log(`   Title: ${product.title}`);
    if (product.price) {
      console.log(`   Price: ${product.currency || 'USD'} ${product.price}`);
    }
    if (product.originalPrice) {
      console.log(`   Original Price: ${product.currency || 'USD'} ${product.originalPrice}`);
    }
    console.log(`   Images: ${product.images.length} URLs extracted`);
    if (product.images.length > 0) {
      console.log(`   Image URLs (first 3):`);
      product.images.slice(0, 3).forEach((imgUrl, i) => {
        console.log(`     ${i + 1}. ${imgUrl.substring(0, 80)}${imgUrl.length > 80 ? '...' : ''}`);
      });
      if (product.images.length > 3) {
        console.log(`     ... and ${product.images.length - 3} more`);
      }
    }
    console.log(`   Videos: ${product.videos.length} URLs extracted`);
    if (product.videos.length > 0) {
      console.log(`   Video URLs (first 3):`);
      product.videos.slice(0, 3).forEach((vidUrl, i) => {
        console.log(`     ${i + 1}. ${vidUrl.substring(0, 80)}${vidUrl.length > 80 ? '...' : ''}`);
      });
    }
    console.log(`   Variants: ${product.variants?.length || 0}`);
    console.log(`   Description: ${product.description ? 'Yes' : 'No'}`);

    return product;

  } catch (error: any) {
    console.error('❌ Error extracting product:', error.message);
    throw error;
  }
}

/**
 * Strips HTML tags from text
 */
function stripHtmlTags(html: string | null | undefined): string | null {
  if (!html) return null;
  // Remove HTML tags and decode HTML entities
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&amp;/g, '&') // Replace &amp; with &
    .replace(/&lt;/g, '<') // Replace &lt; with <
    .replace(/&gt;/g, '>') // Replace &gt; with >
    .replace(/&quot;/g, '"') // Replace &quot; with "
    .replace(/&#39;/g, "'") // Replace &#39; with '
    .trim();
}

/**
 * Formats a number to a price string with 2 decimal places
 */
function formatPrice(price: number | undefined): string | null {
  if (price === undefined || price === null) return null;
  return price.toFixed(2);
}

/**
 * Formats a date to the required format: "YYYY-MM-DD HH:MM:SS.mmm"
 */
function formatDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

/**
 * Generates a CUID-like ID (simplified version matching the format in Product.json)
 * Format: cmj + 25 alphanumeric characters
 * In production, use a proper CUID library like @paralleldrive/cuid2
 */
function generateCuid(): string {
  const prefix = 'cmj';
  // Generate 25 random alphanumeric characters
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let random = '';
  for (let i = 0; i < 25; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix + random;
}

/**
 * Transforms extracted product to match Product schema format
 * 
 * Note: The following fields are NOT included and will be assigned automatically:
 * - slug: Generated from product title during import
 * - categories: Assigned automatically from DB based on title/description matching
 * - tags: Assigned automatically from DB based on title/description matching
 * - priceBandId: Assigned automatically based on title/description mapping
 */
function transformToProductFormat(product: ExtractedProduct): any {
  const now = new Date();
  const createdAt = now;
  const updatedAt = now;

  return {
    id: generateCuid(),
    title: product.title,
    description: stripHtmlTags(product.description) || null,
    images: product.images, // Already an array of URLs (String[])
    videos: product.videos, // Already an array of URLs (String[])
    createdAt: formatDate(createdAt),
    updatedAt: formatDate(updatedAt),
    // slug, categories, tags, and priceBandId will be assigned automatically during import
  };
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: tsx extractShopifyProduct.ts <product-url> [output-file]

Examples:
  tsx extractShopifyProduct.ts https://1clickblinds.co.uk/products/plain-soft-white-motorised-day-and-night-blind
  tsx extractShopifyProduct.ts https://1clickblinds.co.uk/products/plain-soft-white-motorised-day-and-night-blind output.json
    `);
    process.exit(1);
  }

  const url = args[0];
  const outputFile = args[1];

  try {
    const product = await extractShopifyProduct(url);

    // Transform to the required format
    const transformedProduct = transformToProductFormat(product);

    // Output as array (matching the Product.json format)
    const output = JSON.stringify([transformedProduct], null, 2);

    if (outputFile) {
      // Use process.cwd() for output path when running as script
      const outputPath = outputFile.startsWith('/') || outputFile.match(/^[A-Z]:/)
        ? outputFile
        : join(process.cwd(), outputFile);
      writeFileSync(outputPath, output, 'utf-8');
      console.log(`\n💾 Saved to: ${outputPath}`);
    } else {
      console.log('\n📄 Extracted Product Data:');
      console.log(output);
    }

  } catch (error: any) {
    console.error('\n💥 Failed to extract product:', error.message);
    process.exit(1);
  }
}

// Only run main if this file is executed directly (not imported)
// When using tsx, __filename is available
if (typeof require !== 'undefined' && require.main === module) {
  main();
} else if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].includes('extractShopifyProduct')) {
  main();
}
