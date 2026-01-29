import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL!;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

// ============================================
// Missing Bands for Eclipsecore Band
// ============================================

// Width bands that might be missing (from Eclipsecore Band requirements)
const ECLIPSECORE_WIDTH_BANDS = [
  { widthMm: 254, widthInches: 10 },
  { widthMm: 508, widthInches: 20 },
  { widthMm: 762, widthInches: 30 },
  { widthMm: 1016, widthInches: 40 },
  { widthMm: 1270, widthInches: 50 },
  { widthMm: 1524, widthInches: 60 },
  { widthMm: 1778, widthInches: 70 },
  { widthMm: 2032, widthInches: 80 },
  { widthMm: 2286, widthInches: 90 },
  { widthMm: 2540, widthInches: 100 },
  { widthMm: 2794, widthInches: 110 },
  { widthMm: 3048, widthInches: 120 },
  { widthMm: 3302, widthInches: 130 },
  { widthMm: 3505, widthInches: 138 },
];

// Height bands that might be missing (from Eclipsecore Band requirements)
const ECLIPSECORE_HEIGHT_BANDS = [
  { heightMm: 254, heightInches: 10 },
  { heightMm: 508, heightInches: 20 },
  { heightMm: 762, heightInches: 30 },
  { heightMm: 1016, heightInches: 40 },
  { heightMm: 1270, heightInches: 50 },
  { heightMm: 1524, heightInches: 60 },
  { heightMm: 1778, heightInches: 70 },
  { heightMm: 2007, heightInches: 79 },
];

async function addMissingBands() {
  console.log('🌱 Starting to add missing bands...');

  // Get all existing bands to check what's missing
  const allExistingWidthBands = await prisma.widthBand.findMany({
    orderBy: { sortOrder: 'asc' },
  });
  const allExistingHeightBands = await prisma.heightBand.findMany({
    orderBy: { sortOrder: 'asc' },
  });

  console.log(`\n📊 Current database state:`);
  console.log(`  Existing width bands: ${allExistingWidthBands.length}`);
  console.log(`  Existing height bands: ${allExistingHeightBands.length}`);

  // Get max sortOrder
  const maxWidthSortOrder = allExistingWidthBands.length > 0 
    ? Math.max(...allExistingWidthBands.map(b => b.sortOrder))
    : -1;
  const maxHeightSortOrder = allExistingHeightBands.length > 0
    ? Math.max(...allExistingHeightBands.map(b => b.sortOrder))
    : -1;

  // Add missing width bands
  console.log('📏 Checking/adding width bands...');
  let widthAdded = 0;
  let widthSortOrder = maxWidthSortOrder + 1;

  for (const band of ECLIPSECORE_WIDTH_BANDS) {
    const existing = await prisma.widthBand.findUnique({
      where: { widthMm: band.widthMm },
    });

    if (!existing) {
      await prisma.widthBand.create({
        data: {
          widthMm: band.widthMm,
          widthInches: band.widthInches,
          sortOrder: widthSortOrder++,
        },
      });
      console.log(`  ✅ Added width band: ${band.widthMm}mm (${band.widthInches}")`);
      widthAdded++;
    } else {
      console.log(`  ⏭️  Width band already exists: ${band.widthMm}mm (${band.widthInches}")`);
    }
  }

  // Add missing height bands
  console.log('📐 Checking/adding height bands...');
  let heightAdded = 0;
  let heightSortOrder = maxHeightSortOrder + 1;

  for (const band of ECLIPSECORE_HEIGHT_BANDS) {
    const existing = await prisma.heightBand.findUnique({
      where: { heightMm: band.heightMm },
    });

    if (!existing) {
      await prisma.heightBand.create({
        data: {
          heightMm: band.heightMm,
          heightInches: band.heightInches,
          sortOrder: heightSortOrder++,
        },
      });
      console.log(`  ✅ Added height band: ${band.heightMm}mm (${band.heightInches}")`);
      heightAdded++;
    } else {
      console.log(`  ⏭️  Height band already exists: ${band.heightMm}mm (${band.heightInches}")`);
    }
  }

  console.log('\n📊 Summary:');
  console.log(`  Width bands added: ${widthAdded}`);
  console.log(`  Height bands added: ${heightAdded}`);
  console.log('\n🎉 Missing bands check completed!');
}

addMissingBands()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
