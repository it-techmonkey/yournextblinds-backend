import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Create a fresh Prisma client instance for this script
const connectionString = process.env.DATABASE_URL!;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('render.com') || connectionString.includes('onrender.com') 
    ? { rejectUnauthorized: false } 
    : false,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Extracts slug from canonical URL
 */
function extractSlugFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    // Find 'products' and get the next part
    const productsIndex = pathParts.indexOf('products');
    if (productsIndex !== -1 && productsIndex < pathParts.length - 1) {
      return pathParts[productsIndex + 1];
    }
    // Fallback: extract last part of path
    return pathParts[pathParts.length - 1] || 'unknown';
  } catch {
    // If URL parsing fails, try to extract manually
    const match = url.match(/\/products\/([^/?]+)/);
    return match ? match[1] : 'unknown';
  }
}

/**
 * Creates a slug from a string
 */
function createSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Strips HTML tags from description
 */
function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  return html.replace(/<[^>]*>/g, '').trim() || null;
}

interface ShopifyProduct {
  source: {
    canonicalUrl: string;
  };
  title: string;
  description?: string;
  categories: string[];
  tags: string[];
  variants: Array<{
    price: {
      current: number;
      previous?: number;
    };
  }>;
  medias: Array<{
    url: string;
    type: string;
  }>;
}

/**
 * Imports products from Shopify dataset into the database
 */
async function importProducts() {
  try {
    console.log('📖 Reading JSON dataset...');
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const jsonPath = join(currentDir, 'dataset_shopify_2025-12-08_17-01-48-275.json');
    const fileContent = readFileSync(jsonPath, 'utf-8');
    const products = JSON.parse(fileContent) as ShopifyProduct[];

    console.log(`📦 Found ${products.length} products in dataset`);

    // Connect to database
    console.log('🔌 Connecting to database...');
    await prisma.$connect();

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    // Process products in batches to avoid memory issues
    const batchSize = 100;
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      console.log(`\n📊 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(products.length / batchSize)} (${i + 1}-${Math.min(i + batchSize, products.length)} of ${products.length})`);

      for (const product of batch) {
        try {
          // Extract slug from canonical URL
          const slug = extractSlugFromUrl(product.source.canonicalUrl);
          
          // Check if product already exists
          const existing = await prisma.product.findUnique({
            where: { slug },
          });

          if (existing) {
            skipped++;
            continue;
          }

          // Extract images from medias
          const images = product.medias
            ?.filter(media => media.type === 'Image' && media.url)
            .map(media => media.url) || [];

          // Get price from first variant
          const firstVariant = product.variants?.[0];
          const currentPrice = firstVariant?.price?.current || 0;
          const previousPrice = firstVariant?.price?.previous || 0; // Default to 0 if not available

          // Process description (strip HTML)
          const description = stripHtml(product.description);

          // Find matching tags
          const tagSlugs = product.tags
            .map(tag => createSlug(tag))
            .filter(Boolean);

          const matchingTags = await prisma.tags.findMany({
            where: {
              slug: { in: tagSlugs },
            },
            select: { id: true },
          });

          // Find matching categories
          const categorySlugs = product.categories
            .map(cat => createSlug(cat))
            .filter(Boolean);

          const matchingCategories = await prisma.category.findMany({
            where: {
              slug: { in: categorySlugs },
            },
            select: { id: true },
          });

          // Create product with relations
          const productData: any = {
            slug,
            title: product.title,
            description,
            images,
          };

          // Only connect tags if there are matching tags
          if (matchingTags.length > 0) {
            productData.tags = {
              connect: matchingTags.map((tag: { id: string }) => ({ id: tag.id })),
            };
          }

          // Only connect categories if there are matching categories
          if (matchingCategories.length > 0) {
            productData.categories = {
              connect: matchingCategories.map((cat: { id: string }) => ({ id: cat.id })),
            };
          }

          await prisma.product.create({
            data: productData,
          });

          imported++;
        } catch (error: any) {
          errors++;
          const slug = extractSlugFromUrl(product.source?.canonicalUrl || 'unknown');
          if (error.code === 'P2002') {
            // Unique constraint violation (slug already exists)
            skipped++;
            console.error(`   ⚠️  Skipped duplicate product: ${slug}`);
          } else {
            console.error(`   ❌ Error importing product "${product.title}" (${slug}):`, error.message);
          }
        }
      }

      // Log progress
      console.log(`   ✅ Imported: ${imported}, ⏭️  Skipped: ${skipped}, ❌ Errors: ${errors}`);
    }

    console.log('\n✅ Import complete!');
    console.log(`   📊 Imported: ${imported} new products`);
    console.log(`   ⏭️  Skipped: ${skipped} products (already exist)`);
    console.log(`   ❌ Errors: ${errors} products`);

    // Verify by counting products in database
    const totalInDb = await prisma.product.count();
    console.log(`   🔍 Verified: ${totalInDb} products now in database`);

  } catch (error) {
    console.error('❌ Error importing products:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the script
importProducts()
  .then(() => {
    console.log('\n🎉 Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });

