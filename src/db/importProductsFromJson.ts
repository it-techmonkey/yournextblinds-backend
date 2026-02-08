import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Prisma client
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
 * Fabric-to-Price-Band mapping based on Bands.md
 * Same mapping as in extractShopifyCategory.ts
 */
const fabricToPriceBand: Record<string, Array<{ category: string; band: string }>> = {
  // Roller Blinds - Light Filtering
  'ATLANTIC': [{ category: 'roller-blinds', band: 'B' }, { category: 'vertical-blinds', band: 'B' }],
  'BERRY': [{ category: 'roller-blinds', band: 'D' }],
  'CALIFORNIA': [{ category: 'roller-blinds', band: 'B' }, { category: 'vertical-blinds', band: 'A' }],
  'DOLPHIN': [{ category: 'roller-blinds', band: 'B' }, { category: 'vertical-blinds', band: 'A' }],
  'ELM': [{ category: 'roller-blinds', band: 'D' }],
  'FABIAN': [{ category: 'roller-blinds', band: 'C' }, { category: 'vertical-blinds', band: 'B' }],
  'FEATHERWEAVE': [{ category: 'roller-blinds', band: 'B' }, { category: 'vertical-blinds', band: 'A' }],
  'FEATHER WEAVE': [{ category: 'roller-blinds', band: 'B' }, { category: 'vertical-blinds', band: 'A' }],
  'HAMBROOK': [{ category: 'roller-blinds', band: 'B' }, { category: 'vertical-blinds', band: 'A' }],
  'ILLUMINATE': [{ category: 'roller-blinds', band: 'D' }],
  'JAGUAR': [{ category: 'roller-blinds', band: 'D' }, { category: 'vertical-blinds', band: 'D' }],
  'LYON': [{ category: 'roller-blinds', band: 'D' }, { category: 'vertical-blinds', band: 'C' }],
  'MARINA': [{ category: 'roller-blinds', band: 'B' }, { category: 'vertical-blinds', band: 'B' }],
  'MILTON': [{ category: 'roller-blinds', band: 'B' }, { category: 'vertical-blinds', band: 'B' }],
  'OASIS': [{ category: 'roller-blinds', band: 'D' }, { category: 'vertical-blinds', band: 'D' }],
  'OPERA': [{ category: 'roller-blinds', band: 'D' }, { category: 'vertical-blinds', band: 'C' }],
  'OPTIMUM': [{ category: 'roller-blinds', band: 'B' }, { category: 'vertical-blinds', band: 'B' }],
  'SUNRISE': [{ category: 'roller-blinds', band: 'B' }, { category: 'vertical-blinds', band: 'B' }],
  'UNITY POLARIS': [{ category: 'roller-blinds', band: 'A' }, { category: 'vertical-blinds', band: 'B' }],
  'YACHT': [{ category: 'roller-blinds', band: 'D' }],
  
  // Roller Blinds - Black Out
  'AQUALUSH': [{ category: 'roller-blinds', band: 'D' }, { category: 'vertical-blinds', band: 'D' }],
  'BLOSSOM': [{ category: 'roller-blinds', band: 'D' }],
  'CAIRO': [{ category: 'roller-blinds', band: 'D' }, { category: 'vertical-blinds', band: 'D' }],
  'ELENA': [{ category: 'roller-blinds', band: 'D' }, { category: 'vertical-blinds', band: 'D' }],
  'FIESTA': [{ category: 'roller-blinds', band: 'D' }, { category: 'vertical-blinds', band: 'D' }],
  'GRAVITY': [{ category: 'roller-blinds', band: 'D' }, { category: 'vertical-blinds', band: 'D' }],
  'HAVANA': [{ category: 'roller-blinds', band: 'D' }, { category: 'vertical-blinds', band: 'D' }],
  'JUPITER': [{ category: 'roller-blinds', band: 'D' }, { category: 'vertical-blinds', band: 'D' }],
  'LAHORE': [{ category: 'roller-blinds', band: 'D' }, { category: 'vertical-blinds', band: 'D' }],
  'MILANO': [{ category: 'roller-blinds', band: 'D' }, { category: 'vertical-blinds', band: 'D' }],
  'RADIANCE': [{ category: 'roller-blinds', band: 'D' }],
  'RAINDROP': [{ category: 'roller-blinds', band: 'D' }, { category: 'vertical-blinds', band: 'D' }],
  'RITA': [{ category: 'roller-blinds', band: 'D' }, { category: 'vertical-blinds', band: 'D' }],
  'SYMPHONY': [{ category: 'roller-blinds', band: 'D' }, { category: 'vertical-blinds', band: 'D' }],
  'TANGO': [{ category: 'roller-blinds', band: 'D' }, { category: 'vertical-blinds', band: 'D' }],
  'ASPIN': [{ category: 'roller-blinds', band: 'E' }],
  'QUIN': [{ category: 'roller-blinds', band: 'E' }],
  
  // Day and Night / Dual Zebra
  'PLAIN SOFT': [{ category: 'day-and-night-blinds', band: 'A' }],
  'ROME': [{ category: 'day-and-night-blinds', band: 'C' }, { category: 'vertical-blinds', band: 'A' }],
  'SOFT TRACEY': [{ category: 'day-and-night-blinds', band: 'B' }],
  'CHICAGO': [{ category: 'day-and-night-blinds', band: 'B' }],
  'PITCH': [{ category: 'day-and-night-blinds', band: 'D' }],
  'OZARK': [{ category: 'day-and-night-blinds', band: 'D' }],
  'CASHMERE': [{ category: 'day-and-night-blinds', band: 'D' }],
  'TOKYO': [{ category: 'day-and-night-blinds', band: 'D' }],
  
  // Vertical Blinds - Light Filtering
  'ALABAMA': [{ category: 'vertical-blinds', band: 'B' }],
  'BADAR': [{ category: 'vertical-blinds', band: 'B' }],
  'BOND': [{ category: 'vertical-blinds', band: 'A' }],
  'CLOUD': [{ category: 'vertical-blinds', band: 'A' }],
  'CROSS STITCH': [{ category: 'vertical-blinds', band: 'B' }],
  'DAISY': [{ category: 'vertical-blinds', band: 'C' }],
  'DOLPHINE': [{ category: 'vertical-blinds', band: 'A' }],
  'EVERSEST': [{ category: 'vertical-blinds', band: 'B' }],
  'HENLY': [{ category: 'vertical-blinds', band: 'A' }],
  'HENLEY': [{ category: 'vertical-blinds', band: 'A' }],
  'LOUISIANA': [{ category: 'vertical-blinds', band: 'C' }],
  'MUMBAI': [{ category: 'vertical-blinds', band: 'C' }],
  'NARCISSUS': [{ category: 'vertical-blinds', band: 'B' }],
  'PACIFIC': [{ category: 'vertical-blinds', band: 'A' }],
  'PARFAIT': [{ category: 'vertical-blinds', band: 'B' }],
  'PHOENIX': [{ category: 'vertical-blinds', band: 'B' }],
  'SHERWOOD': [{ category: 'vertical-blinds', band: 'B' }],
  'STRIPE': [{ category: 'vertical-blinds', band: 'A' }],
  'SWEET': [{ category: 'vertical-blinds', band: 'A' }],
  'UNITY': [{ category: 'vertical-blinds', band: 'B' }],
  
  // Vertical Blinds - Black Out
  'KIA': [{ category: 'vertical-blinds', band: 'D' }],
};

/**
 * Fabric-to-Tag mapping based on Bands.md
 * Maps fabric name + category combination to required tags (light-filtering, blackout, waterproof)
 * Structure: { fabricName: { category: ['tag1', 'tag2'] } }
 * Note: Some fabrics appear in multiple categories with different tags
 */
const fabricToTags: Record<string, Record<string, string[]>> = {
  // Roller Blinds - Light Filtering
  'ATLANTIC': { 'roller-blinds': ['light-filtering'], 'vertical-blinds': ['light-filtering'] },
  'BERRY': { 'roller-blinds': ['light-filtering'] },
  'CALIFORNIA': { 'roller-blinds': ['light-filtering'], 'vertical-blinds': ['light-filtering'] },
  'DOLPHIN': { 'roller-blinds': ['light-filtering'] },
  'ELM': { 'roller-blinds': ['light-filtering'] },
  'FABIAN': { 'roller-blinds': ['light-filtering'], 'vertical-blinds': ['light-filtering'] },
  'FEATHERWEAVE': { 'roller-blinds': ['light-filtering'], 'vertical-blinds': ['light-filtering'] },
  'FEATHER WEAVE': { 'roller-blinds': ['light-filtering'], 'vertical-blinds': ['light-filtering'] },
  'HAMBROOK': { 'roller-blinds': ['light-filtering'], 'vertical-blinds': ['light-filtering'] },
  'ILLUMINATE': { 'roller-blinds': ['light-filtering'] },
  'JAGUAR': { 'roller-blinds': ['light-filtering'], 'vertical-blinds': ['light-filtering'] },
  'LYON': { 'roller-blinds': ['light-filtering'], 'vertical-blinds': ['light-filtering'] },
  'MARINA': { 'roller-blinds': ['light-filtering'], 'vertical-blinds': ['light-filtering'] },
  'MILTON': { 'roller-blinds': ['light-filtering'], 'vertical-blinds': ['light-filtering'] },
  'OASIS': { 'roller-blinds': ['light-filtering'], 'vertical-blinds': ['light-filtering'] },
  'OPERA': { 'roller-blinds': ['light-filtering'], 'vertical-blinds': ['light-filtering'] },
  'OPTIMUM': { 'roller-blinds': ['light-filtering'], 'vertical-blinds': ['light-filtering'] },
  'SUNRISE': { 'roller-blinds': ['light-filtering'], 'vertical-blinds': ['light-filtering'] },
  'UNITY POLARIS': { 'roller-blinds': ['light-filtering'], 'vertical-blinds': ['light-filtering'] },
  'YACHT': { 'roller-blinds': ['light-filtering'] },
  
  // Roller Blinds - Black Out (some also appear in vertical)
  'AQUALUSH': { 'roller-blinds': ['blackout'], 'vertical-blinds': ['blackout'] },
  'BLOSSOM': { 'roller-blinds': ['blackout'] },
  'CAIRO': { 'roller-blinds': ['blackout'], 'vertical-blinds': ['blackout'] },
  'ELENA': { 'roller-blinds': ['blackout'], 'vertical-blinds': ['blackout'] },
  'FIESTA': { 'roller-blinds': ['blackout'], 'vertical-blinds': ['blackout'] },
  'GRAVITY': { 'roller-blinds': ['blackout'], 'vertical-blinds': ['blackout'] },
  'HAVANA': { 'roller-blinds': ['blackout'], 'vertical-blinds': ['blackout'] },
  'JUPITER': { 'roller-blinds': ['blackout'], 'vertical-blinds': ['blackout'] },
  'LAHORE': { 'roller-blinds': ['blackout'], 'vertical-blinds': ['blackout'] },
  'MILANO': { 'roller-blinds': ['blackout'], 'vertical-blinds': ['blackout'] },
  'RADIANCE': { 'roller-blinds': ['blackout'] },
  'RAINDROP': { 'roller-blinds': ['blackout'], 'vertical-blinds': ['blackout'] },
  'RITA': { 'roller-blinds': ['blackout'], 'vertical-blinds': ['blackout'] },
  'SYMPHONY': { 'roller-blinds': ['blackout'], 'vertical-blinds': ['blackout'] },
  'TANGO': { 'roller-blinds': ['blackout'], 'vertical-blinds': ['blackout'] },
  'ASPIN': { 'roller-blinds': ['blackout'] },
  'QUIN': { 'roller-blinds': ['blackout'] },
  
  // Vertical Blinds - Light Filtering (only in vertical)
  'ALABAMA': { 'vertical-blinds': ['light-filtering'] },
  'BADAR': { 'vertical-blinds': ['light-filtering'] },
  'BOND': { 'vertical-blinds': ['light-filtering'] },
  'CLOUD': { 'vertical-blinds': ['light-filtering'] },
  'CROSS STITCH': { 'vertical-blinds': ['light-filtering'] },
  'DAISY': { 'vertical-blinds': ['light-filtering'] },
  'DOLPHINE': { 'vertical-blinds': ['light-filtering'] },
  'EVERSEST': { 'vertical-blinds': ['light-filtering'] },
  'HENLY': { 'vertical-blinds': ['light-filtering'] },
  'HENLEY': { 'vertical-blinds': ['light-filtering'] },
  'LOUISIANA': { 'vertical-blinds': ['light-filtering'] },
  'MUMBAI': { 'vertical-blinds': ['light-filtering'] },
  'NARCISSUS': { 'vertical-blinds': ['light-filtering'] },
  'PACIFIC': { 'vertical-blinds': ['light-filtering'] },
  'PARFAIT': { 'vertical-blinds': ['light-filtering'] },
  'PHOENIX': { 'vertical-blinds': ['light-filtering'] },
  'ROME': { 'vertical-blinds': ['light-filtering'] },
  'SHERWOOD': { 'vertical-blinds': ['light-filtering'] },
  'STRIPE': { 'vertical-blinds': ['light-filtering'] },
  'SWEET': { 'vertical-blinds': ['light-filtering'] },
  'UNITY': { 'vertical-blinds': ['light-filtering'] },
  
  // Vertical Blinds - Black Out (only in vertical)
  'KIA': { 'vertical-blinds': ['blackout'] },
};

/**
 * Gets tags for a fabric based on category from Bands.md
 * Returns array of tag slugs (light-filtering, blackout, waterproof)
 */
function getFabricTags(fabricName: string | null, categorySlug: string): string[] {
  if (!fabricName) return [];
  
  const fabricTags = fabricToTags[fabricName];
  if (!fabricTags) return [];
  
  // Get tags for this specific category
  const categoryTags = fabricTags[categorySlug];
  if (!categoryTags) return [];
  
  // Check if this fabric is also waterproof (for roller-blinds and vertical-blinds)
  // Waterproof fabrics are: AQUALUSH, ELENA, FIESTA, GRAVITY, HAVANA, JUPITER, LAHORE, MILANO, TANGO
  const waterproofFabrics = ['AQUALUSH', 'ELENA', 'FIESTA', 'GRAVITY', 'HAVANA', 'JUPITER', 'LAHORE', 'MILANO', 'TANGO'];
  const isWaterproof = waterproofFabrics.includes(fabricName.toUpperCase()) && 
                       (categorySlug === 'roller-blinds' || categorySlug === 'vertical-blinds');
  
  const tags = [...categoryTags];
  if (isWaterproof) {
    tags.push('waterproof');
  }
  
  return tags;
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
 * Extracts fabric name from product title
 */
function extractFabricName(title: string): string | null {
  const normalizedTitle = title.toUpperCase().trim();
  
  for (const fabricName of Object.keys(fabricToPriceBand)) {
    const normalizedFabric = fabricName.toUpperCase();
    
    if (normalizedTitle.includes(normalizedFabric)) {
      const fabricWords = normalizedFabric.split(' ');
      if (fabricWords.length > 1) {
        const fabricPattern = fabricWords.join('\\s+');
        const regex = new RegExp(`\\b${fabricPattern}\\b`, 'i');
        if (regex.test(title)) {
          return fabricName;
        }
      } else {
        const regex = new RegExp(`\\b${normalizedFabric}\\b`, 'i');
        if (regex.test(title)) {
          return fabricName;
        }
      }
    }
  }
  
  return null;
}

/**
 * Maps category slug to price band name prefix
 */
function getPriceBandPrefix(categorySlug: string): string {
  const categoryToPrefix: Record<string, string> = {
    'vertical-blinds': 'Vertical Blind',
    'roller-blinds': 'Roller',
    'day-and-night-blinds': 'Dayandnight',
    'eclipsecore-shades': 'Eclipsecore',
  };
  
  return categoryToPrefix[categorySlug] || '';
}

/**
 * Finds default price band for a category when fabric name is not found
 * Uses the lowest band (Band A) as default, or Eclipsecore Band for eclipsecore
 */
async function findDefaultPriceBand(categorySlug: string): Promise<string | null> {
  try {
    const prefix = getPriceBandPrefix(categorySlug);
    if (!prefix) {
      return null;
    }

    // Special case for Eclipsecore
    if (categorySlug === 'eclipsecore-shades') {
      const eclipsecoreBand = await prisma.priceBand.findUnique({
        where: { name: 'Eclipsecore Band' },
        select: { id: true },
      });
      return eclipsecoreBand?.id || null;
    }

    // Default to Band A for other categories
    const priceBandName = `${prefix} - Band A`;
    const priceBand = await prisma.priceBand.findUnique({
      where: { name: priceBandName },
      select: { id: true },
    });

    return priceBand?.id || null;
  } catch (error: any) {
    console.warn(`   ⚠️  Could not find default price band for category ${categorySlug}: ${error.message}`);
    return null;
  }
}

/**
 * Finds price band ID for a product based on fabric name and category
 * Price bands in DB are category-specific (e.g., "Vertical Blind - Band A", "Roller - Band B")
 */
async function findPriceBandId(
  fabricName: string | null,
  categorySlugs: string[]
): Promise<string | null> {
  if (!fabricName) {
    return null;
  }

  const fabricMappings = fabricToPriceBand[fabricName];
  if (!fabricMappings || fabricMappings.length === 0) {
    return null;
  }

  let matchedBand: string | null = null;
  let matchedCategory: string | null = null;
  
  for (const categorySlug of categorySlugs) {
    const mapping = fabricMappings.find(m => {
      if (m.category === 'day-and-night-blinds') {
        return categorySlug === 'day-and-night-blinds' || categorySlug === 'day-night-blinds';
      }
      return categorySlug === m.category;
    });
    
    if (mapping) {
      matchedBand = mapping.band;
      matchedCategory = mapping.category;
      break;
    }
  }

  if (!matchedBand || !matchedCategory) {
    return null;
  }

  try {
    // Get the category-specific prefix for the price band name
    const prefix = getPriceBandPrefix(matchedCategory);
    if (!prefix) {
      return null;
    }

    // Construct the price band name (e.g., "Vertical Blind - Band A", "Roller - Band B")
    const priceBandName = `${prefix} - Band ${matchedBand}`;
    
    // Special case for Eclipsecore (no band letter)
    if (matchedCategory === 'eclipsecore-shades') {
      const eclipsecoreBand = await prisma.priceBand.findUnique({
        where: { name: 'Eclipsecore Band' },
        select: { id: true },
      });
      return eclipsecoreBand?.id || null;
    }

    const priceBand = await prisma.priceBand.findUnique({
      where: { name: priceBandName },
      select: { id: true },
    });

    return priceBand?.id || null;
  } catch (error: any) {
    console.warn(`   ⚠️  Could not find price band (${error.message})`);
    return null;
  }
}

/**
 * Imports products from JSON file
 */
async function importProductsFromJson(jsonFilePath: string) {
  try {
    console.log('📖 Importing products from JSON file...\n');
    console.log(`📄 Reading file: ${jsonFilePath}`);

    // Read and parse JSON file
    const fileContent = readFileSync(jsonFilePath, 'utf-8');
    const products = JSON.parse(fileContent);

    if (!Array.isArray(products)) {
      throw new Error('JSON file must contain an array of products');
    }

    console.log(`📦 Found ${products.length} products to import\n`);

    // Get all categories and tags from database
    const allCategories = await prisma.category.findMany({
      select: { id: true, slug: true },
    });
    const allTags = await prisma.tags.findMany({
      select: { id: true, slug: true },
    });

    const categoryMap = new Map(allCategories.map(c => [c.slug, c.id]));
    const tagMap = new Map(allTags.map(t => [t.slug, t.id]));

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const skippedProducts: any[] = []; // Products without price bands

    console.log('💾 Processing products...\n');

    for (let i = 0; i < products.length; i++) {
      const productData = products[i];
      
      try {
        // Validate required fields
        if (!productData.title) {
          console.log(`   ⚠️  [${i + 1}/${products.length}] Skipping product: Missing title`);
          skipped++;
          continue;
        }

        const slug = createSlug(productData.title);

        // Check if product exists by title (case-insensitive)
        const existingProduct = await prisma.product.findFirst({
          where: {
            title: {
              equals: productData.title,
              mode: 'insensitive',
            },
          },
        });

        // Extract fabric name and find price band
        const fabricName = extractFabricName(productData.title);
        const categorySlugs = productData.categories || [];
        const priceBandId = await findPriceBandId(fabricName, categorySlugs);
        
        // Skip products without price bands
        if (!priceBandId) {
          console.log(`   ⏭️  [${i + 1}/${products.length}] Skipping "${productData.title}" - No price band found (fabric: ${fabricName || 'not found'})`);
          skipped++;
          // Store skipped product for JSON export
          skippedProducts.push(productData);
          continue;
        }

        // Get category and tag IDs
        const categoryIds = categorySlugs
          .map((slug: string) => categoryMap.get(slug))
          .filter((id: string | undefined): id is string => id !== undefined);
        
        const tagSlugs = productData.tags || [];
        const tagIds = tagSlugs
          .map((slug: string) => tagMap.get(slug))
          .filter((id: string | undefined): id is string => id !== undefined);

        // Parse dates if provided, otherwise use current time
        // Dates in JSON are in format "2026-02-08 16:32:55.324"
        let createdAt: Date;
        let updatedAt: Date;
        
        if (productData.createdAt) {
          // Convert "2026-02-08 16:32:55.324" to ISO format
          const dateStr = productData.createdAt.replace(' ', 'T');
          createdAt = new Date(dateStr);
          if (isNaN(createdAt.getTime())) {
            createdAt = new Date();
          }
        } else {
          createdAt = new Date();
        }
        
        if (productData.updatedAt) {
          // Convert "2026-02-08 16:32:55.324" to ISO format
          const dateStr = productData.updatedAt.replace(' ', 'T');
          updatedAt = new Date(dateStr);
          if (isNaN(updatedAt.getTime())) {
            updatedAt = new Date();
          }
        } else {
          updatedAt = new Date();
        }

        if (existingProduct) {
          // Update existing product (keep existing ID)
          // Use 'set' for update operations
          const updateData: any = {
            title: productData.title,
            description: productData.description || null,
            images: productData.images || [],
            videos: productData.videos || [],
            updatedAt,
            ...(priceBandId && { priceBandId }),
            ...(categoryIds.length > 0 && {
              categories: {
                set: categoryIds.map((id: string) => ({ id })),
              },
            }),
            ...(tagIds.length > 0 && {
              tags: {
                set: tagIds.map((id: string) => ({ id })),
              },
            }),
          };

          await prisma.product.update({
            where: { id: existingProduct.id },
            data: updateData,
          });
          updated++;
            const fabricInfo = fabricName ? ` [Fabric: ${fabricName}]` : ' [No fabric found]';
            const bandInfo = priceBandId ? ' [Price Band: ✓]' : ' [Price Band: ✗ MISSING]';
            console.log(`   ✅ [${i + 1}/${products.length}] Updated: ${productData.title}${fabricInfo}${bandInfo}`);
        } else {
          // Create new product
          // Use 'connect' for create operations (Prisma doesn't support 'set' on create)
          const createData: any = {
            title: productData.title,
            description: productData.description || null,
            images: productData.images || [],
            videos: productData.videos || [],
            slug,
            createdAt,
            updatedAt,
            ...(priceBandId && { priceBandId }),
            ...(categoryIds.length > 0 && {
              categories: {
                connect: categoryIds.map((id: string) => ({ id })),
              },
            }),
            ...(tagIds.length > 0 && {
              tags: {
                connect: tagIds.map((id: string) => ({ id })),
              },
            }),
          };
          
          // Use ID from JSON if provided and it's a valid CUID format
          if (productData.id && typeof productData.id === 'string' && productData.id.length >= 20) {
            createData.id = productData.id;
          }
          
          await prisma.product.create({
            data: createData,
          });
          created++;
            const fabricInfo = fabricName ? ` [Fabric: ${fabricName}]` : ' [No fabric found]';
            const bandInfo = priceBandId ? ' [Price Band: ✓]' : ' [Price Band: ✗ MISSING]';
            console.log(`   ✨ [${i + 1}/${products.length}] Created: ${productData.title}${fabricInfo}${bandInfo}`);
        }

        // Progress update every 50 products
        if ((i + 1) % 50 === 0) {
          console.log(`\n   📊 Progress: ${i + 1}/${products.length} products processed\n`);
        }

      } catch (error: any) {
        errors++;
        console.error(`   ❌ [${i + 1}/${products.length}] Error processing "${productData.title}":`, error.message);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📋 IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Created: ${created} products`);
    console.log(`🔄 Updated: ${updated} products`);
    console.log(`⏭️  Skipped: ${skipped} products (no price band found)`);
    console.log(`❌ Errors: ${errors} products`);
    console.log(`📊 Total: ${products.length} products`);
    console.log('='.repeat(60));
    
    // Save skipped products to JSON file
    if (skippedProducts.length > 0) {
      const skippedFilePath = jsonFilePath.replace(/\.json$/, '_skipped_no_priceband.json');
      writeFileSync(skippedFilePath, JSON.stringify(skippedProducts, null, 2), 'utf-8');
      console.log(`\n📄 Skipped products saved to: ${skippedFilePath}`);
      console.log(`   Total skipped: ${skippedProducts.length} products`);
    } else {
      console.log(`\n✅ All products have price bands assigned!`);
    }
    console.log('');

  } catch (error: any) {
    console.error('❌ Error importing products:', error.message);
    throw error;
  }
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: tsx importProductsFromJson.ts <json-file-path>

Example:
  tsx importProductsFromJson.ts verticalblinds.json
  tsx importProductsFromJson.ts ../verticalblinds.json
    `);
    process.exit(1);
  }

  const jsonFilePath = args[0];
  const fullPath = jsonFilePath.startsWith('/') || jsonFilePath.match(/^[A-Z]:/)
    ? jsonFilePath
    : join(process.cwd(), jsonFilePath);

  try {
    await prisma.$connect();
    console.log('🔌 Connected to database\n');

    await importProductsFromJson(fullPath);

    console.log('🎉 Import completed successfully!');

  } catch (error: any) {
    console.error('\n💥 Import failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the script
if (typeof require !== 'undefined' && require.main === module) {
  main();
} else if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].includes('importProductsFromJson')) {
  main();
}
