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
// BAND A Price Matrix Data (from image)
// ============================================

// Width bands in mm and inches
const WIDTH_BANDS = [
  { widthMm: 500, widthInches: 20 },
  { widthMm: 750, widthInches: 30 },
  { widthMm: 1000, widthInches: 39 },
  { widthMm: 1250, widthInches: 49 },
  { widthMm: 1500, widthInches: 59 },
  { widthMm: 1750, widthInches: 69 },
  { widthMm: 2000, widthInches: 79 },
  { widthMm: 2250, widthInches: 89 },
  { widthMm: 2500, widthInches: 98 },
  { widthMm: 2750, widthInches: 108 },
  { widthMm: 3000, widthInches: 118 },
  { widthMm: 3250, widthInches: 128 },
  { widthMm: 3500, widthInches: 138 },
  { widthMm: 3750, widthInches: 148 },
  { widthMm: 4000, widthInches: 157 },
];

// Height bands in mm and inches (DROP)
const HEIGHT_BANDS = [
  { heightMm: 500, heightInches: 20 },
  { heightMm: 750, heightInches: 30 },
  { heightMm: 1000, heightInches: 39 },
  { heightMm: 1250, heightInches: 49 },
  { heightMm: 1500, heightInches: 59 },
  { heightMm: 1750, heightInches: 69 },
  { heightMm: 2000, heightInches: 79 },
  { heightMm: 2250, heightInches: 89 },
  { heightMm: 2500, heightInches: 98 },
  { heightMm: 2750, heightInches: 108 },
  { heightMm: 3000, heightInches: 118 },
];

// BAND A Price matrix [height][width] in GBP
// Row = Drop (height), Column = Width
const BAND_A_PRICES: number[][] = [
  // 500mm drop (20")
  [18.10, 20.00, 21.89, 23.78, 25.67, 27.56, 29.45, 31.34, 33.23, 35.12, 37.01, 38.90, 40.79, 42.68, 44.57],
  // 750mm drop (30")
  [18.65, 20.79, 22.92, 25.05, 27.18, 29.31, 31.45, 33.58, 35.71, 37.84, 39.97, 42.11, 44.24, 46.37, 48.50],
  // 1000mm drop (39")
  [19.21, 21.58, 23.95, 26.32, 28.70, 31.07, 33.44, 35.82, 38.19, 40.56, 42.94, 45.31, 47.68, 50.06, 52.43],
  // 1250mm drop (49")
  [19.76, 22.37, 24.98, 27.60, 30.21, 32.83, 35.44, 38.06, 40.67, 43.28, 45.90, 48.51, 51.13, 53.74, 56.36],
  // 1500mm drop (59")
  [20.31, 23.16, 26.02, 28.87, 31.73, 34.58, 37.44, 40.29, 43.15, 46.01, 48.86, 51.72, 54.57, 57.43, 60.28],
  // 1750mm drop (69")
  [20.86, 23.95, 27.05, 30.15, 33.24, 36.34, 39.44, 42.53, 45.63, 48.73, 51.82, 54.92, 58.02, 61.11, 64.21],
  // 2000mm drop (79")
  [21.41, 24.74, 28.08, 31.42, 34.76, 38.10, 41.43, 44.77, 48.11, 51.45, 54.79, 58.12, 61.46, 64.80, 68.14],
  // 2250mm drop (89")
  [21.96, 25.54, 29.12, 32.69, 36.27, 39.85, 43.43, 47.01, 50.59, 54.17, 57.75, 61.33, 64.91, 68.48, 72.06],
  // 2500mm drop (98")
  [22.51, 26.33, 30.15, 33.97, 37.79, 41.61, 45.43, 49.25, 53.07, 56.89, 60.71, 64.53, 68.35, 72.17, 75.99],
  // 2750mm drop (108")
  [23.06, 27.12, 31.18, 35.24, 39.30, 43.36, 47.43, 51.49, 55.55, 59.61, 63.67, 67.73, 71.79, 75.86, 79.92],
  // 3000mm drop (118")
  [23.61, 27.91, 32.21, 36.52, 40.82, 45.12, 49.42, 53.73, 58.03, 62.33, 66.63, 70.94, 75.24, 79.54, 83.84],
];

// ============================================
// Customization Options Pricing
// ============================================

// Vogue System pricing by width band
const VOGUE_SYSTEM_OPTIONS = [
  {
    optionId: 'white',
    name: 'White',
    prices: [2.50, 3.50, 4.50, 5.50, 6.50, 7.50, 8.50, 9.50, 10.50, 11.50, 12.50, 13.50, 14.50, 15.50, 16.50],
  },
  {
    optionId: 'blk-anth-brwn',
    name: 'Blk/Anth/Brwn',
    prices: [16.00, 16.00, 16.00, 20.00, 20.00, 25.00, 25.00, 29.00, 29.00, 32.00, 32.00, 36.00, 36.00, 41.00, 41.00],
  },
  {
    optionId: 'champgn-gld',
    name: 'Champagne/Gold',
    prices: [18.00, 18.00, 18.00, 22.00, 22.00, 28.00, 28.00, 32.00, 32.00, 36.00, 36.00, 41.00, 41.00, 46.00, 46.00],
  },
];

// Metal Bottom Chain pricing by width band
const METAL_BOTTOM_CHAIN_PRICES = [1.50, 2.40, 3.30, 3.60, 4.20, 5.10, 6.00, 6.90, 7.60, 8.10, 9.00, 9.90, 10.00, 11.10, 12.00];

// F/H/W Metal Weights pricing by width band
const FHW_METAL_WEIGHTS_PRICES = [2.50, 3.50, 4.50, 5.50, 6.50, 7.50, 8.50, 9.50, 10.50, 11.50, 12.50, 13.50, 14.50, 15.50, 16.50];

// Colour Weight & Chain pricing by width band
const COLOUR_WEIGHT_CHAIN_PRICES = [1.50, 2.50, 3.50, 4.50, 5.50, 6.50, 7.50, 8.50, 9.50, 10.50, 11.50, 12.50, 13.50, 14.50, 15.50];

// Fixed price customizations (no width variation)
const FIXED_PRICE_CUSTOMIZATIONS = [
  // Headrail options
  { category: 'headrail', optionId: 'classic', name: 'Classic Headrail', price: 0 },
  { category: 'headrail', optionId: 'platinum', name: 'Platinum Headrail', price: 0 },
  
  // Headrail colours
  { category: 'headrail-colour', optionId: 'ice-white', name: 'Ice White', price: 12.10 },
  { category: 'headrail-colour', optionId: 'brushed-aluminium', name: 'Brushed Aluminium', price: 14.52 },
  { category: 'headrail-colour', optionId: 'anthacite-grey', name: 'Anthacite Grey', price: 13.91 },
  { category: 'headrail-colour', optionId: 'champagne-gold', name: 'Champagne Gold', price: 14.52 },
  { category: 'headrail-colour', optionId: 'piano-black', name: 'Piano Black', price: 13.91 },
  { category: 'headrail-colour', optionId: 'espresso-brown', name: 'Espresso Brown', price: 13.91 },
  
  // Installation method
  { category: 'installation-method', optionId: 'inside-recess', name: 'Inside Recess', price: 0 },
  { category: 'installation-method', optionId: 'exact-size', name: 'Exact Size', price: 0 },
  
  // Control options
  { category: 'control-option', optionId: 'wand', name: 'Wand', price: 0 },
  { category: 'control-option', optionId: 'cord-chain', name: 'Cord & Chain', price: 0 },
  { category: 'control-option', optionId: 'left', name: 'Left', price: 0 },
  { category: 'control-option', optionId: 'right', name: 'Right', price: 0 },
  
  // Stacking options
  { category: 'stacking', optionId: 'left', name: 'Left', price: 0 },
  { category: 'stacking', optionId: 'right', name: 'Right', price: 0 },
  { category: 'stacking', optionId: 'split', name: 'Split', price: 0 },
  
  // Control side options
  { category: 'control-side', optionId: 'left', name: 'Left', price: 0 },
  { category: 'control-side', optionId: 'right', name: 'Right', price: 0 },
  
  // Bottom chain options
  { category: 'bottom-chain', optionId: 'standard-white', name: 'Standard white weights & chains', price: 0 },
  { category: 'bottom-chain', optionId: 'white-chainless', name: 'White chainless weights (Pet Friendly)', price: 0.50 },
  { category: 'bottom-chain', optionId: 'black-weights', name: 'Black weights & chains', price: 0.75 },
  { category: 'bottom-chain', optionId: 'grey-weights', name: 'Grey weights & chains', price: 0.75 },
  
  // Bracket type options
  { category: 'bracket-type', optionId: 'top-fixed', name: 'Top Fixed', price: 0 },
  { category: 'bracket-type', optionId: 'face-fixed', name: 'Face Fixed', price: 0 },
  
  // Chain color options
  { category: 'chain-color', optionId: 'white-plastic', name: 'White - Plastic', price: 0 },
  { category: 'chain-color', optionId: 'black-plastic', name: 'Black - Plastic', price: 0 },
  { category: 'chain-color', optionId: 'anthracite-plastic', name: 'Anthracite - Plastic', price: 0 },
  { category: 'chain-color', optionId: 'chrome-metal', name: 'Chrome - Metal', price: 1.50 }, // Chrome chain £1.50 per blind
  
  // Wrapped cassette options
  { category: 'wrapped-cassette', optionId: 'no', name: 'No', price: 0 },
  { category: 'wrapped-cassette', optionId: 'yes', name: 'Yes', price: 20.00 },
  
  // Cassette matching bar options
  { category: 'cassette-bar', optionId: 'white', name: 'White', price: 0 },
  { category: 'cassette-bar', optionId: 'black', name: 'Black', price: 10.00 },
  { category: 'cassette-bar', optionId: 'grey', name: 'Grey', price: 10.00 },
];

async function seedPricing() {
  console.log('🌱 Starting pricing data seed...');

  // Clear existing pricing data
  console.log('🧹 Clearing existing pricing data...');
  await prisma.customizationPricing.deleteMany();
  await prisma.customizationOption.deleteMany();
  await prisma.priceCell.deleteMany();
  await prisma.priceBand.deleteMany();
  await prisma.widthBand.deleteMany();
  await prisma.heightBand.deleteMany();

  // Create Width Bands
  console.log('📏 Creating width bands...');
  const widthBandRecords = await Promise.all(
    WIDTH_BANDS.map((band, index) =>
      prisma.widthBand.create({
        data: {
          widthMm: band.widthMm,
          widthInches: band.widthInches,
          sortOrder: index,
        },
      })
    )
  );
  console.log(`✅ Created ${widthBandRecords.length} width bands`);

  // Create Height Bands
  console.log('📐 Creating height bands...');
  const heightBandRecords = await Promise.all(
    HEIGHT_BANDS.map((band, index) =>
      prisma.heightBand.create({
        data: {
          heightMm: band.heightMm,
          heightInches: band.heightInches,
          sortOrder: index,
        },
      })
    )
  );
  console.log(`✅ Created ${heightBandRecords.length} height bands`);

  // Create Price Band A
  console.log('💰 Creating price band A...');
  const bandA = await prisma.priceBand.create({
    data: {
      name: 'Band A',
      description: 'Standard pricing band for blinds',
    },
  });

  // Create Price Cells for Band A
  console.log('📊 Creating price cells for Band A...');
  let cellCount = 0;
  for (let heightIndex = 0; heightIndex < HEIGHT_BANDS.length; heightIndex++) {
    for (let widthIndex = 0; widthIndex < WIDTH_BANDS.length; widthIndex++) {
      await prisma.priceCell.create({
        data: {
          priceBandId: bandA.id,
          widthBandId: widthBandRecords[widthIndex].id,
          heightBandId: heightBandRecords[heightIndex].id,
          price: BAND_A_PRICES[heightIndex][widthIndex],
        },
      });
      cellCount++;
    }
  }
  console.log(`✅ Created ${cellCount} price cells`);

  // Create Fixed Price Customization Options
  console.log('🎨 Creating fixed price customization options...');
  for (const option of FIXED_PRICE_CUSTOMIZATIONS) {
    const customizationOption = await prisma.customizationOption.create({
      data: {
        category: option.category,
        optionId: option.optionId,
        name: option.name,
      },
    });

    // Create single pricing entry (no width variation)
    await prisma.customizationPricing.create({
      data: {
        customizationOptionId: customizationOption.id,
        widthBandId: null, // null means applies to all widths
        price: option.price,
      },
    });
  }
  console.log(`✅ Created ${FIXED_PRICE_CUSTOMIZATIONS.length} fixed price options`);

  // Create Vogue System Options (width-dependent pricing)
  console.log('🎭 Creating Vogue System options...');
  for (const option of VOGUE_SYSTEM_OPTIONS) {
    const customizationOption = await prisma.customizationOption.create({
      data: {
        category: 'vogue-system',
        optionId: option.optionId,
        name: option.name,
      },
    });

    // Create pricing entries for each width band
    for (let i = 0; i < WIDTH_BANDS.length; i++) {
      await prisma.customizationPricing.create({
        data: {
          customizationOptionId: customizationOption.id,
          widthBandId: widthBandRecords[i].id,
          price: option.prices[i],
        },
      });
    }
  }
  console.log(`✅ Created ${VOGUE_SYSTEM_OPTIONS.length} Vogue System options`);

  // Create Metal Bottom Chain Option (width-dependent pricing)
  console.log('⛓️ Creating Metal Bottom Chain option...');
  const metalBottomChain = await prisma.customizationOption.create({
    data: {
      category: 'metal-bottom-chain',
      optionId: 'metal-bottom-chain',
      name: 'Metal Bottom Chain',
    },
  });
  for (let i = 0; i < WIDTH_BANDS.length; i++) {
    await prisma.customizationPricing.create({
      data: {
        customizationOptionId: metalBottomChain.id,
        widthBandId: widthBandRecords[i].id,
        price: METAL_BOTTOM_CHAIN_PRICES[i],
      },
    });
  }

  // Create F/H/W Metal Weights Option (width-dependent pricing)
  console.log('⚖️ Creating F/H/W Metal Weights option...');
  const fhwMetalWeights = await prisma.customizationOption.create({
    data: {
      category: 'fhw-metal-weights',
      optionId: 'fhw-metal-weights',
      name: 'F/H/W Metal Weights',
    },
  });
  for (let i = 0; i < WIDTH_BANDS.length; i++) {
    await prisma.customizationPricing.create({
      data: {
        customizationOptionId: fhwMetalWeights.id,
        widthBandId: widthBandRecords[i].id,
        price: FHW_METAL_WEIGHTS_PRICES[i],
      },
    });
  }

  // Create Colour Weight & Chain Option (width-dependent pricing)
  console.log('🌈 Creating Colour Weight & Chain option...');
  const colourWeightChain = await prisma.customizationOption.create({
    data: {
      category: 'colour-weight-chain',
      optionId: 'colour-weight-chain',
      name: 'Colour Weight & Chain',
    },
  });
  for (let i = 0; i < WIDTH_BANDS.length; i++) {
    await prisma.customizationPricing.create({
      data: {
        customizationOptionId: colourWeightChain.id,
        widthBandId: widthBandRecords[i].id,
        price: COLOUR_WEIGHT_CHAIN_PRICES[i],
      },
    });
  }

  console.log('✅ Created width-dependent customization options');

  // Update all products to use Band A
  console.log('🔗 Linking products to Band A...');
  const updateResult = await prisma.product.updateMany({
    data: {
      priceBandId: bandA.id,
    },
  });
  console.log(`✅ Linked ${updateResult.count} products to Band A`);

  console.log('\n🎉 Pricing data seed completed successfully!');
}

seedPricing()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
