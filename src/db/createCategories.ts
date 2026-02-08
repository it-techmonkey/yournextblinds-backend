import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

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
 * Categories based on analysis - Core product types and installation/control types
 */
const categories = [
  // Core Product Types (Primary Categories)
  { name: 'Vertical Blinds', slug: 'vertical-blinds' },
  { name: 'Roller Blinds', slug: 'roller-blinds' },
  { name: 'Roman Blinds', slug: 'roman-blinds' },
  { name: 'Venetian Blinds', slug: 'venetian-blinds' },
  { name: 'Day and Night Blinds', slug: 'day-and-night-blinds' },
  { name: 'Pleated Blinds', slug: 'pleated-blinds' },
  { name: 'Wooden Blinds', slug: 'wooden-blinds' },
  { name: 'Skylight Blinds', slug: 'skylight-blinds' },
  
  // Installation/Control Types (Secondary Categories)
  { name: 'No Drill Blinds', slug: 'no-drill-blinds' },
  { name: 'Motorized Blinds', slug: 'motorized-blinds' },
  
  // Specialized Products
  { name: 'EclipseCore Shades', slug: 'eclipsecore-shades' },
];

/**
 * Creates categories in the database
 */
async function createCategories() {
  try {
    console.log('📖 Creating categories from analysis...');
    console.log(`✨ Found ${categories.length} categories to create`);

    console.log('🔌 Connecting to database...');
    await prisma.$connect();

    let inserted = 0;
    let skipped = 0;

    console.log('💾 Inserting categories into database...');
    for (const category of categories) {
      try {
        // Check if category already exists
        const existing = await prisma.category.findUnique({
          where: { slug: category.slug },
        });

        if (existing) {
          skipped++;
          continue;
        }

        // Create category
        await prisma.category.create({
          data: {
            name: category.name,
            slug: category.slug,
          },
        });

        inserted++;
        console.log(`   ✅ Created: ${category.name}`);
      } catch (error: any) {
        if (error.code === 'P2002') {
          // Unique constraint violation
          skipped++;
        } else {
          console.error(`   ❌ Error creating category "${category.name}":`, error.message);
        }
      }
    }

    console.log(`\n✅ Category creation complete!`);
    console.log(`   📊 Inserted: ${inserted} new categories`);
    console.log(`   ⏭️  Skipped: ${skipped} categories (already exist)`);
    console.log(`   📈 Total unique categories in database: ${inserted + skipped}`);

    // Verify by counting categories in database
    const totalInDb = await prisma.category.count();
    console.log(`   🔍 Verified: ${totalInDb} categories now in database`);

  } catch (error) {
    console.error('❌ Error creating categories:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the script
createCategories()
  .then(() => {
    console.log('\n🎉 Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
