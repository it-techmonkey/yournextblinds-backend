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
// ECLIPSECORE BAND Price Matrix Data
// ============================================

// Width bands in mm and inches (from image: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 138 inches)
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

// Height bands in mm and inches (DROP from image: 10, 20, 30, 40, 50, 60, 70, 79 inches)
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

// ECLIPSECORE BAND Price matrix [height][width] in USD (from image)
// Row = Drop (height), Column = Width
// Prices are in USD - keeping as USD for now (can convert to GBP if needed)
// Based on the pricing table image provided
const ECLIPSECORE_PRICES: number[][] = [
  // Row 0: 10" drop (254mm) - Widths: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 138
  [148.57, 151.43, 154.29, 157.14, 160.00, 162.86, 165.71, 168.57, 171.43, 174.29, 177.14, 180.00, 182.86, 224.76],
  // Row 1: 20" drop (508mm) - minimum band price is $164.76 for 20x20
  [151.43, 164.76, 168.10, 171.43, 174.76, 178.10, 181.43, 184.76, 188.10, 191.43, 194.76, 198.10, 201.43, 228.57],
  // Row 2: 30" drop (762mm)
  [154.29, 168.10, 171.90, 175.71, 179.52, 183.33, 187.14, 190.95, 194.76, 198.57, 202.38, 206.19, 210.00, 232.38],
  // Row 3: 40" drop (1016mm)
  [157.14, 171.43, 175.71, 180.00, 184.29, 188.57, 192.86, 197.14, 201.43, 205.71, 210.00, 214.29, 218.57, 236.19],
  // Row 4: 50" drop (1270mm)
  [160.00, 174.76, 179.52, 184.29, 189.05, 193.81, 198.57, 203.33, 208.10, 212.86, 217.62, 222.38, 227.14, 240.00],
  // Row 5: 60" drop (1524mm)
  [162.86, 178.10, 183.33, 188.57, 193.81, 199.05, 204.29, 209.52, 214.76, 220.00, 225.24, 230.48, 235.71, 243.81],
  // Row 6: 70" drop (1778mm)
  [165.71, 181.43, 187.14, 192.86, 198.57, 204.29, 210.00, 215.71, 221.43, 227.14, 232.86, 238.57, 244.29, 247.62],
  // Row 7: 79" drop (2007mm)
  [190.48, 207.62, 214.29, 220.95, 227.62, 234.29, 240.95, 247.62, 254.29, 260.95, 267.62, 274.29, 280.95, 665.71],
];

async function seedEclipsecoreBand() {
  console.log('🌱 Starting Eclipsecore Band seed...');

  try {
    // Check if Eclipsecore Band already exists
    const existingBand = await prisma.priceBand.findUnique({
      where: { name: 'Eclipsecore Band' },
    });

    if (existingBand) {
      console.log('⚠️  Eclipsecore Band already exists. Deleting existing band and recreating...');
      await prisma.priceCell.deleteMany({
        where: { priceBandId: existingBand.id },
      });
      await prisma.priceBand.delete({
        where: { id: existingBand.id },
      });
    }

    // Check if width bands exist, create if they don't
    console.log('📏 Checking/creating width bands...');
    const widthBandRecords = await Promise.all(
      ECLIPSECORE_WIDTH_BANDS.map(async (band, index) => {
        const existing = await prisma.widthBand.findUnique({
          where: { widthMm: band.widthMm },
        });
        if (existing) {
          return existing;
        }
        return prisma.widthBand.create({
          data: {
            widthMm: band.widthMm,
            widthInches: band.widthInches,
            sortOrder: 100 + index, // Offset to avoid conflicts with existing bands
          },
        });
      })
    );
    console.log(`✅ Processed ${widthBandRecords.length} width bands`);

    // Check if height bands exist, create if they don't
    console.log('📐 Checking/creating height bands...');
    const heightBandRecords = await Promise.all(
      ECLIPSECORE_HEIGHT_BANDS.map(async (band, index) => {
        const existing = await prisma.heightBand.findUnique({
          where: { heightMm: band.heightMm },
        });
        if (existing) {
          return existing;
        }
        return prisma.heightBand.create({
          data: {
            heightMm: band.heightMm,
            heightInches: band.heightInches,
            sortOrder: 100 + index, // Offset to avoid conflicts with existing bands
          },
        });
      })
    );
    console.log(`✅ Processed ${heightBandRecords.length} height bands`);

    // Create Eclipsecore Band
    console.log('💰 Creating Eclipsecore Band...');
    const eclipsecoreBand = await prisma.priceBand.create({
      data: {
        name: 'Eclipsecore Band',
        description: 'Pricing band for Eclipsecore products',
      },
    });

    // Create Price Cells for Eclipsecore Band
    console.log('📊 Creating price cells for Eclipsecore Band...');
    let cellCount = 0;
    for (let heightIndex = 0; heightIndex < ECLIPSECORE_HEIGHT_BANDS.length; heightIndex++) {
      for (let widthIndex = 0; widthIndex < ECLIPSECORE_WIDTH_BANDS.length; widthIndex++) {
        await prisma.priceCell.create({
          data: {
            priceBandId: eclipsecoreBand.id,
            widthBandId: widthBandRecords[widthIndex].id,
            heightBandId: heightBandRecords[heightIndex].id,
            price: ECLIPSECORE_PRICES[heightIndex][widthIndex],
          },
        });
        cellCount++;
      }
    }
    console.log(`✅ Created ${cellCount} price cells`);

    console.log('\n🎉 Eclipsecore Band seed completed successfully!');
    console.log(`📌 Band ID: ${eclipsecoreBand.id}`);
    console.log(`💰 Minimum price (20x20): $${ECLIPSECORE_PRICES[1][1].toFixed(2)}`);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  }
}

seedEclipsecoreBand()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
