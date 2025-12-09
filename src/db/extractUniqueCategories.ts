import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../config/database.js';

/**
 * Converts a category name to a URL-friendly slug
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
 * Extracts unique categories from the Shopify dataset and saves them to the database
 */
async function extractUniqueCategories() {
  try {
    console.log('📖 Reading JSON dataset...');
    // Get current file directory
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const jsonPath = join(currentDir, 'dataset_shopify_2025-12-08_17-01-48-275.json');
    const fileContent = readFileSync(jsonPath, 'utf-8');
    const products = JSON.parse(fileContent) as Array<{ categories: string[] }>;

    console.log(`📦 Found ${products.length} products in dataset`);

    // Extract all categories from all products
    const allCategories: string[] = [];
    products.forEach((product) => {
      if (product.categories && Array.isArray(product.categories)) {
        allCategories.push(...product.categories);
      }
    });

    console.log(`🏷️  Found ${allCategories.length} total category entries`);

    // Get unique categories (case-insensitive)
    const uniqueCategoriesMap = new Map<string, string>();
    allCategories.forEach((category) => {
      if (category && category.trim()) {
        const normalized = category.trim();
        // Use lowercase as key to ensure uniqueness (case-insensitive)
        const key = normalized.toLowerCase();
        if (!uniqueCategoriesMap.has(key)) {
          uniqueCategoriesMap.set(key, normalized);
        }
      }
    });

    const uniqueCategories = Array.from(uniqueCategoriesMap.values());
    console.log(`✨ Found ${uniqueCategories.length} unique categories`);

    // Connect to database
    console.log('🔌 Connecting to database...');
    await prisma.$connect();

    // Insert unique categories (skip if slug already exists)
    console.log('💾 Inserting categories into database...');
    let inserted = 0;
    let skipped = 0;

    for (const categoryName of uniqueCategories) {
      const slug = createSlug(categoryName);
      
      try {
        // Check if category already exists
        const existing = await prisma.category.findUnique({
          where: { slug },
        });

        if (existing) {
          skipped++; // Skip duplicates
        } else {
          // Create new category
          await prisma.category.create({
            data: {
              name: categoryName,
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
          console.error(`❌ Error inserting category "${categoryName}":`, error.message);
        }
      }
    }

    console.log('\n✅ Extraction complete!');
    console.log(`   📊 Inserted: ${inserted} new categories`);
    console.log(`   ⏭️  Skipped: ${skipped} categories (already exist)`);
    console.log(`   📈 Total unique categories in database: ${inserted + skipped}`);

    // Verify by counting categories in database
    const totalInDb = await prisma.category.count();
    console.log(`   🔍 Verified: ${totalInDb} categories now in database`);

  } catch (error) {
    console.error('❌ Error extracting categories:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the script
extractUniqueCategories()
  .then(() => {
    console.log('\n🎉 Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });

