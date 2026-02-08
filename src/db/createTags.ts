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
 * Tags based on analysis - Colors, Patterns, Features, Window Types, Rooms
 */
const tags = [
  // Colors
  { name: 'White', slug: 'white' },
  { name: 'Black', slug: 'black' },
  { name: 'Blue', slug: 'blue' },
  { name: 'Yellow', slug: 'yellow' },
  { name: 'Gold', slug: 'gold' },
  { name: 'Green', slug: 'green' },
  { name: 'Grey', slug: 'grey' },
  { name: 'Gray', slug: 'gray' }, // Alternative spelling
  { name: 'Silver', slug: 'silver' },
  { name: 'Purple', slug: 'purple' },
  { name: 'Orange', slug: 'orange' },
  { name: 'Red', slug: 'red' },
  { name: 'Pink', slug: 'pink' },
  { name: 'Brown', slug: 'brown' },
  { name: 'Beige', slug: 'beige' },
  { name: 'Cream', slug: 'cream' },
  { name: 'Ivory', slug: 'ivory' },
  { name: 'Light Wood', slug: 'light-wood' },
  { name: 'Medium Wood', slug: 'medium-wood' },
  
  // Patterns
  { name: 'Floral', slug: 'floral' },
  { name: 'Striped', slug: 'striped' },
  { name: 'Geometric', slug: 'geometric' },
  { name: 'Abstract', slug: 'abstract' },
  { name: 'Animal', slug: 'animal' },
  { name: 'Wood', slug: 'wood' },
  { name: 'Plain', slug: 'plain' },
  { name: 'Solid', slug: 'solid' },
  
  // Features/Solutions
  { name: 'Blackout', slug: 'blackout' },
  { name: 'Thermal', slug: 'thermal' },
  { name: 'Waterproof', slug: 'waterproof' },
  { name: 'Cordless', slug: 'cordless' },
  { name: 'Easy Wipe', slug: 'easy-wipe' },
  { name: 'Better Sleep', slug: 'better-sleep' },
  { name: 'Light Filtering', slug: 'light-filtering' },
  
  // Window Types
  { name: 'Bay Window', slug: 'bay-window' },
  { name: 'Conservatory Window', slug: 'conservatory-window' },
  { name: 'Roof Skylight', slug: 'roof-skylight' },
  { name: 'Tilt and Turn Window', slug: 'tilt-turn-window' },
  { name: 'Bi Fold Window', slug: 'bi-fold-window' },
  { name: 'French Door', slug: 'french-door' },
  { name: 'Sliding Door', slug: 'sliding-door' },
  
  // Rooms
  { name: 'Conservatory', slug: 'conservatory' },
  { name: 'Bedroom', slug: 'bedroom' },
  { name: 'Kitchen', slug: 'kitchen' },
  { name: 'Office', slug: 'office' },
  { name: 'Bathroom', slug: 'bathroom' },
  { name: 'Living Room', slug: 'living-room' },
  { name: 'Dining Room', slug: 'dining-room' },
  { name: "Children's Room", slug: 'childrens-room' },
];

/**
 * Creates tags in the database
 */
async function createTags() {
  try {
    console.log('📖 Creating tags from analysis...');
    console.log(`✨ Found ${tags.length} tags to create`);

    console.log('🔌 Connecting to database...');
    await prisma.$connect();

    let inserted = 0;
    let skipped = 0;

    console.log('💾 Inserting tags into database...');
    for (const tag of tags) {
      try {
        // Check if tag already exists
        const existing = await prisma.tags.findUnique({
          where: { slug: tag.slug },
        });

        if (existing) {
          skipped++;
          continue;
        }

        // Create tag
        await prisma.tags.create({
          data: {
            name: tag.name,
            slug: tag.slug,
          },
        });

        inserted++;
      } catch (error: any) {
        if (error.code === 'P2002') {
          // Unique constraint violation
          skipped++;
        } else {
          console.error(`   ❌ Error creating tag "${tag.name}":`, error.message);
        }
      }
    }

    console.log(`\n✅ Tag creation complete!`);
    console.log(`   📊 Inserted: ${inserted} new tags`);
    console.log(`   ⏭️  Skipped: ${skipped} tags (already exist)`);
    console.log(`   📈 Total unique tags in database: ${inserted + skipped}`);

    // Verify by counting tags in database
    const totalInDb = await prisma.tags.count();
    console.log(`   🔍 Verified: ${totalInDb} tags now in database`);

  } catch (error) {
    console.error('❌ Error creating tags:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the script
createTags()
  .then(() => {
    console.log('\n🎉 Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
