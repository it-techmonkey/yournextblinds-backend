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
 * Converts a tag name to a URL-friendly slug
 */
function createSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/_/g, '-') // Replace underscores with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Extracts unique tags from the Shopify dataset and saves them to the database
 */
async function extractUniqueTags() {
  try {
    console.log('📖 Reading JSON dataset...');
    // Get current file directory
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const jsonPath = join(currentDir, 'dataset_shopify_2025-12-08_17-01-48-275.json');
    const fileContent = readFileSync(jsonPath, 'utf-8');
    const products = JSON.parse(fileContent) as Array<{ tags: string[] }>;

    console.log(`📦 Found ${products.length} products in dataset`);

    // Extract all tags from all products
    const allTags: string[] = [];
    products.forEach((product) => {
      if (product.tags && Array.isArray(product.tags)) {
        allTags.push(...product.tags);
      }
    });

    console.log(`🏷️  Found ${allTags.length} total tag entries`);

    // Get unique tags (case-insensitive)
    const uniqueTagsMap = new Map<string, string>();
    allTags.forEach((tag) => {
      if (tag && tag.trim()) {
        const normalized = tag.trim();
        // Use lowercase as key to ensure uniqueness (case-insensitive)
        const key = normalized.toLowerCase();
        if (!uniqueTagsMap.has(key)) {
          uniqueTagsMap.set(key, normalized);
        }
      }
    });

    const uniqueTags = Array.from(uniqueTagsMap.values());
    console.log(`✨ Found ${uniqueTags.length} unique tags`);

    // Connect to database
    console.log('🔌 Connecting to database...');
    await prisma.$connect();

    // Insert unique tags (skip if slug already exists)
    console.log('💾 Inserting tags into database...');
    let inserted = 0;
    let skipped = 0;

    for (const tagName of uniqueTags) {
      const slug = createSlug(tagName);
      
      try {
        // Check if tag already exists
        const existing = await prisma.tags.findUnique({
          where: { slug },
        });

        if (existing) {
          skipped++; // Skip duplicates
        } else {
          // Create new tag
          await prisma.tags.create({
            data: {
              name: tagName,
              slug,
            },
          });
          inserted++;
        }
      } catch (error: any) {
        // If it's a unique constraint error, skip it
        if (error.code === 'P2002') {
          skipped++;
        } else {
          console.error(`❌ Error inserting tag "${tagName}":`, error.message);
        }
      }
    }

    console.log('\n✅ Extraction complete!');
    console.log(`   📊 Inserted: ${inserted} new tags`);
    console.log(`   ⏭️  Skipped: ${skipped} tags (already exist)`);
    console.log(`   📈 Total unique tags in database: ${inserted + skipped}`);

    // Verify by counting tags in database
    const totalInDb = await prisma.tags.count();
    console.log(`   🔍 Verified: ${totalInDb} tags now in database`);

  } catch (error) {
    console.error('❌ Error extracting tags:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the script
extractUniqueTags()
  .then(() => {
    console.log('\n🎉 Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });

