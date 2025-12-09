import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Prisma 7 adapter setup
const connectionString = process.env.DATABASE_URL!;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Detect if this is a Render database (or other cloud provider requiring SSL)
const isRenderDb = connectionString.includes('render.com') || 
                   connectionString.includes('onrender.com') ||
                   process.env.NODE_ENV === 'production';

// Configure pool with appropriate SSL settings
const poolConfig: any = {
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

if (isRenderDb) {
  // Render databases require SSL with rejectUnauthorized: false
  poolConfig.ssl = {
    rejectUnauthorized: false
  };
} else {
  // Local databases might not support SSL
  poolConfig.ssl = false;
}

const pool = new Pool(poolConfig);
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

async function main() {
  console.log('🌱 Starting seed...');

  // Clear existing data
  console.log('🧹 Clearing existing data...');
  await prisma.productAttributeValue.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.blindConfig.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productAttribute.deleteMany();
  await prisma.category.deleteMany();
  await prisma.blindConfigPreset.deleteMany();

  // Create Categories
  console.log('📁 Creating categories...');
  const categories = await Promise.all([
    prisma.category.create({
      data: {
        slug: 'roller-blinds',
        name: 'Roller Blinds',
        description: 'Classic and versatile roller blinds perfect for any room',
      },
    }),
    prisma.category.create({
      data: {
        slug: 'venetian-blinds',
        name: 'Venetian Blinds',
        description: 'Timeless venetian blinds with adjustable slats for light control',
      },
    }),
    prisma.category.create({
      data: {
        slug: 'roman-blinds',
        name: 'Roman Blinds',
        description: 'Elegant roman blinds that fold up beautifully',
      },
    }),
    prisma.category.create({
      data: {
        slug: 'vertical-blinds',
        name: 'Vertical Blinds',
        description: 'Modern vertical blinds ideal for large windows and doors',
      },
    }),
    prisma.category.create({
      data: {
        slug: 'blackout-blinds',
        name: 'Blackout Blinds',
        description: 'Complete light-blocking blinds for bedrooms and media rooms',
      },
    }),
  ]);

  // Create Product Attributes
  console.log('🏷️ Creating product attributes...');
  const attributes = await Promise.all([
    prisma.productAttribute.create({
      data: { name: 'room' },
    }),
    prisma.productAttribute.create({
      data: { name: 'control_type' },
    }),
    prisma.productAttribute.create({
      data: { name: 'material' },
    }),
    prisma.productAttribute.create({
      data: { name: 'light_control' },
    }),
  ]);

  // Create Blind Config Presets
  console.log('⚙️ Creating blind config presets...');
  const standardPreset = await prisma.blindConfigPreset.create({
    data: {
      name: 'Standard Window',
      description: 'Standard window configuration',
      schema: {
        minWidth: 300,
        maxWidth: 3000,
        minHeight: 300,
        maxHeight: 3000,
        controlTypes: ['chain', 'wand'],
        installationTypes: ['inside_recess', 'outside_recess'],
      },
    },
  });

  // Create Products
  console.log('🪟 Creating products...');
  
  // Product 1: Classic Roller Blind
  const rollerBlind = await prisma.product.create({
    data: {
      slug: 'classic-roller-blind',
      name: 'Classic Roller Blind',
      description: 'A timeless roller blind that combines style with functionality. Perfect for any room in your home.',
      basePrice: 45.99,
      categoryId: categories[0].id,
      isActive: true,
      attributes: {
        create: [
          {
            attributeId: attributes[0].id, // room
            value: 'living room, bedroom, kitchen',
          },
          {
            attributeId: attributes[1].id, // control_type
            value: 'chain, wand',
          },
          {
            attributeId: attributes[2].id, // material
            value: 'polyester',
          },
          {
            attributeId: attributes[3].id, // light_control
            value: 'medium',
          },
        ],
      },
      images: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800',
            alt: 'Classic Roller Blind in white',
            sortOrder: 0,
          },
          {
            url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800',
            alt: 'Classic Roller Blind installation',
            sortOrder: 1,
          },
        ],
      },
      variants: {
        create: [
          {
            sku: 'RB-WHT-001',
            color: 'White',
            pricePerSqM: 45.99,
            samplePrice: 2.99,
            isBlackout: false,
            isWaterResistant: false,
            isActive: true,
            images: {
              create: [
                {
                  url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800',
                  alt: 'White roller blind',
                  sortOrder: 0,
                },
              ],
            },
          },
          {
            sku: 'RB-CRM-002',
            color: 'Cream',
            pricePerSqM: 45.99,
            samplePrice: 2.99,
            isBlackout: false,
            isWaterResistant: false,
            isActive: true,
            images: {
              create: [
                {
                  url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800',
                  alt: 'Cream roller blind',
                  sortOrder: 0,
                },
              ],
            },
          },
          {
            sku: 'RB-GRY-003',
            color: 'Grey',
            pricePerSqM: 47.99,
            samplePrice: 2.99,
            isBlackout: false,
            isWaterResistant: false,
            isActive: true,
          },
        ],
      },
    },
  });

  // Product 2: Blackout Roller Blind
  const blackoutBlind = await prisma.product.create({
    data: {
      slug: 'blackout-roller-blind',
      name: 'Blackout Roller Blind',
      description: 'Complete light-blocking roller blind perfect for bedrooms. Blocks 100% of light for better sleep.',
      basePrice: 65.99,
      categoryId: categories[4].id,
      isActive: true,
      attributes: {
        create: [
          {
            attributeId: attributes[0].id, // room
            value: 'bedroom, nursery, media room',
          },
          {
            attributeId: attributes[1].id, // control_type
            value: 'chain',
          },
          {
            attributeId: attributes[2].id, // material
            value: 'blackout fabric',
          },
          {
            attributeId: attributes[3].id, // light_control
            value: 'complete',
          },
        ],
      },
      images: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800',
            alt: 'Blackout roller blind',
            sortOrder: 0,
          },
        ],
      },
      variants: {
        create: [
          {
            sku: 'BO-BLK-001',
            color: 'Black',
            pricePerSqM: 65.99,
            samplePrice: 3.99,
            isBlackout: true,
            isWaterResistant: false,
            isActive: true,
          },
          {
            sku: 'BO-NAV-002',
            color: 'Navy',
            pricePerSqM: 65.99,
            samplePrice: 3.99,
            isBlackout: true,
            isWaterResistant: false,
            isActive: true,
          },
          {
            sku: 'BO-GRY-003',
            color: 'Charcoal Grey',
            pricePerSqM: 67.99,
            samplePrice: 3.99,
            isBlackout: true,
            isWaterResistant: false,
            isActive: true,
          },
        ],
      },
    },
  });

  // Product 3: Venetian Blind
  const venetianBlind = await prisma.product.create({
    data: {
      slug: 'aluminum-venetian-blind',
      name: 'Aluminum Venetian Blind',
      description: 'Durable aluminum venetian blinds with adjustable slats for precise light control.',
      basePrice: 55.99,
      categoryId: categories[1].id,
      isActive: true,
      attributes: {
        create: [
          {
            attributeId: attributes[0].id, // room
            value: 'office, kitchen, bathroom',
          },
          {
            attributeId: attributes[1].id, // control_type
            value: 'wand',
          },
          {
            attributeId: attributes[2].id, // material
            value: 'aluminum',
          },
          {
            attributeId: attributes[3].id, // light_control
            value: 'precise',
          },
        ],
      },
      images: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1505843513577-22bb7d21e455?w=800',
            alt: 'Aluminum venetian blind',
            sortOrder: 0,
          },
        ],
      },
      variants: {
        create: [
          {
            sku: 'VB-WHT-001',
            color: 'White',
            finish: 'Matte',
            pricePerSqM: 55.99,
            samplePrice: 2.99,
            isBlackout: false,
            isWaterResistant: true,
            isActive: true,
          },
          {
            sku: 'VB-SLV-002',
            color: 'Silver',
            finish: 'Metallic',
            pricePerSqM: 57.99,
            samplePrice: 2.99,
            isBlackout: false,
            isWaterResistant: true,
            isActive: true,
          },
          {
            sku: 'VB-BEZ-003',
            color: 'Beige',
            finish: 'Matte',
            pricePerSqM: 55.99,
            samplePrice: 2.99,
            isBlackout: false,
            isWaterResistant: true,
            isActive: true,
          },
        ],
      },
    },
  });

  // Product 4: Roman Blind
  const romanBlind = await prisma.product.create({
    data: {
      slug: 'elegant-roman-blind',
      name: 'Elegant Roman Blind',
      description: 'Sophisticated roman blind that folds up beautifully. Adds elegance to any room.',
      basePrice: 75.99,
      categoryId: categories[2].id,
      isActive: true,
      attributes: {
        create: [
          {
            attributeId: attributes[0].id, // room
            value: 'living room, dining room, bedroom',
          },
          {
            attributeId: attributes[1].id, // control_type
            value: 'chain',
          },
          {
            attributeId: attributes[2].id, // material
            value: 'cotton blend',
          },
          {
            attributeId: attributes[3].id, // light_control
            value: 'medium',
          },
        ],
      },
      images: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800',
            alt: 'Elegant roman blind',
            sortOrder: 0,
          },
        ],
      },
      variants: {
        create: [
          {
            sku: 'RM-CRM-001',
            color: 'Cream',
            pattern: 'Solid',
            pricePerSqM: 75.99,
            samplePrice: 4.99,
            isBlackout: false,
            isWaterResistant: false,
            isActive: true,
          },
          {
            sku: 'RM-FLR-002',
            color: 'Beige',
            pattern: 'Floral',
            pricePerSqM: 85.99,
            samplePrice: 4.99,
            isBlackout: false,
            isWaterResistant: false,
            isActive: true,
          },
          {
            sku: 'RM-GRY-003',
            color: 'Grey',
            pattern: 'Geometric',
            pricePerSqM: 85.99,
            samplePrice: 4.99,
            isBlackout: false,
            isWaterResistant: false,
            isActive: true,
          },
        ],
      },
    },
  });

  // Product 5: Vertical Blind
  const verticalBlind = await prisma.product.create({
    data: {
      slug: 'modern-vertical-blind',
      name: 'Modern Vertical Blind',
      description: 'Contemporary vertical blinds perfect for large windows, sliding doors, and patio doors.',
      basePrice: 60.99,
      categoryId: categories[3].id,
      isActive: true,
      attributes: {
        create: [
          {
            attributeId: attributes[0].id, // room
            value: 'living room, conservatory, patio door',
          },
          {
            attributeId: attributes[1].id, // control_type
            value: 'wand',
          },
          {
            attributeId: attributes[2].id, // material
            value: 'PVC',
          },
          {
            attributeId: attributes[3].id, // light_control
            value: 'adjustable',
          },
        ],
      },
      images: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1505843513577-22bb7d21e455?w=800',
            alt: 'Modern vertical blind',
            sortOrder: 0,
          },
        ],
      },
      variants: {
        create: [
          {
            sku: 'VL-WHT-001',
            color: 'White',
            pricePerSqM: 60.99,
            samplePrice: 3.99,
            isBlackout: false,
            isWaterResistant: true,
            isActive: true,
          },
          {
            sku: 'VL-BEZ-002',
            color: 'Beige',
            pricePerSqM: 60.99,
            samplePrice: 3.99,
            isBlackout: false,
            isWaterResistant: true,
            isActive: true,
          },
          {
            sku: 'VL-GRY-003',
            color: 'Grey',
            pricePerSqM: 62.99,
            samplePrice: 3.99,
            isBlackout: false,
            isWaterResistant: true,
            isActive: true,
          },
        ],
      },
    },
  });

  // Create some BlindConfigs for variants
  console.log('🔧 Creating blind configs...');
  const rollerVariant = await prisma.productVariant.findFirst({
    where: { sku: 'RB-WHT-001' },
  });

  if (rollerVariant) {
    await prisma.blindConfig.create({
      data: {
        widthMm: 1200,
        heightMm: 1500,
        installationType: 'inside_recess',
        controlSide: 'right',
        controlType: 'chain',
        fittingOption: 'standard',
        variantId: rollerVariant.id,
        presetId: standardPreset.id,
      },
    });
  }

  console.log('✅ Seed completed successfully!');
  console.log(`📊 Created:`);
  console.log(`   - ${categories.length} categories`);
  console.log(`   - ${attributes.length} product attributes`);
  console.log(`   - 5 products`);
  console.log(`   - Multiple variants and images`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

