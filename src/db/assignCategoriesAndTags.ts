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
 * Category matching patterns - maps keywords to category slugs
 */
const categoryPatterns: Record<string, string[]> = {
  'vertical-blinds': [
    'vertical', 'vertical blind', 'vertical shade', 'vertical slat',
    'light-filtering-vertical', 'blackout-vertical'
  ],
  'roller-blinds': [
    'roller', 'roller blind', 'roller shade', 'roll up', 'roll-up',
    'light-filtering-roller', 'blackout-roller', 'waterproof-roller'
  ],
  'roman-blinds': [
    'roman', 'roman blind', 'roman shade', 'roman fold'
  ],
  'venetian-blinds': [
    'venetian', 'venetian blind', 'horizontal slat', 'horizontal blind'
  ],
  'day-and-night-blinds': [
    'day and night', 'day-and-night', 'dual', 'zebra', 'zebra shade',
    'dual zebra', 'dual-zebra', 'dual shade', 'dual-shade'
  ],
  'pleated-blinds': [
    'pleated', 'pleated blind', 'pleated shade', 'honeycomb', 'honeycomb blind',
    'perfect-fit-pleated', 'perfect fit pleated'
  ],
  'wooden-blinds': [
    'wooden', 'wood blind', 'wooden blind', 'wood slat', 'wooden slat',
    'perfect-fit-wooden', 'perfect fit wooden'
  ],
  'skylight-blinds': [
    'skylight', 'roof skylight', 'roof-skylight', 'skylight blind'
  ],
  'no-drill-blinds': [
    'no drill', 'no-drill', 'perfect fit', 'perfect-fit', 'perfectfit',
    'no drill roller', 'perfect-fit-shutter', 'perfect-fit-pleated',
    'perfect-fit-wooden', 'perfect-fit-metal'
  ],
  'motorized-blinds': [
    'motorized', 'motorised', 'motorized blind', 'motorised blind',
    'motorized shade', 'motorised shade', 'motor', 'electric', 'automated',
    'motorised-roller', 'motorised-dual', 'motorised-eclipsecore'
  ],
  'eclipsecore-shades': [
    'eclipsecore', 'eclipse core', 'eclipse-core', 'non-driii', 'non driii',
    'honeycomb blackout'
  ],
};

/**
 * Tag matching patterns - maps keywords to tag slugs
 */
const tagPatterns: Record<string, string[]> = {
  // Colors
  'white': ['white', 'ivory', 'cream', 'off-white'],
  'black': ['black', 'charcoal', 'dark'],
  'blue': ['blue', 'navy', 'azure'],
  'yellow': ['yellow', 'gold', 'golden'],
  'gold': ['gold', 'golden', 'brass'],
  'green': ['green', 'emerald', 'lime'],
  'grey': ['grey', 'gray', 'silver', 'silver grey', 'silver gray'],
  'gray': ['grey', 'gray', 'silver', 'silver grey', 'silver gray'],
  'silver': ['silver', 'silver grey', 'silver gray'],
  'purple': ['purple', 'violet', 'lavender'],
  'orange': ['orange', 'tangerine'],
  'red': ['red', 'crimson', 'burgundy'],
  'pink': ['pink', 'rose', 'blush'],
  'brown': ['brown', 'tan', 'beige', 'taupe'],
  'beige': ['beige', 'tan', 'taupe'],
  'cream': ['cream', 'ivory', 'off-white'],
  'ivory': ['ivory', 'cream', 'off-white'],
  'light-wood': ['light wood', 'light-wood', 'oak', 'maple', 'birch', 'pine'],
  'medium-wood': ['medium wood', 'medium-wood', 'walnut', 'cherry'],
  
  // Patterns
  'floral': ['floral', 'flower', 'blossom', 'bloom'],
  'striped': ['striped', 'stripe', 'stripes', 'stripped'],
  'geometric': ['geometric', 'geometrical', 'pattern', 'design'],
  'abstract': ['abstract', 'modern', 'contemporary'],
  'animal': ['animal', 'zoo', 'wildlife'],
  'wood': ['wood', 'wooden', 'wood finish', 'wood-finish'],
  'plain': ['plain', 'solid color', 'solid-colour'],
  'solid': ['solid', 'plain', 'solid color', 'solid-colour'],
  
  // Features
  'blackout': ['blackout', 'black-out', 'black out', 'blockout', 'block-out'],
  'thermal': ['thermal', 'insulated', 'insulation', 'energy efficient'],
  'waterproof': ['waterproof', 'water-proof', 'water resistant', 'water-resistant', 'moisture resistant'],
  'cordless': ['cordless', 'cord-less', 'no cord', 'no-cord'],
  'easy-wipe': ['easy wipe', 'easy-wipe', 'wipeable', 'easy clean', 'easy-clean'],
  'better-sleep': ['better sleep', 'better-sleep', 'sleep', 'sleeping'],
  'light-filtering': ['light filtering', 'light-filtering', 'light filter', 'light-filter'],
  
  // Window Types
  'bay-window': ['bay window', 'bay-window', 'bay'],
  'conservatory-window': ['conservatory window', 'conservatory-window', 'conservatory'],
  'roof-skylight': ['roof skylight', 'roof-skylight', 'skylight', 'roof window'],
  'tilt-turn-window': ['tilt turn', 'tilt-turn', 'tilt and turn', 'tilt-and-turn'],
  'bi-fold-window': ['bi fold', 'bi-fold', 'bifold', 'bifold window'],
  'french-door': ['french door', 'french-door', 'french doors'],
  'sliding-door': ['sliding door', 'sliding-door', 'sliding doors', 'slider'],
  
  // Rooms
  'conservatory': ['conservatory'],
  'bedroom': ['bedroom', 'bed room'],
  'kitchen': ['kitchen'],
  'office': ['office', 'study', 'workspace'],
  'bathroom': ['bathroom', 'bath room', 'washroom'],
  'living-room': ['living room', 'living-room', 'lounge', 'sitting room'],
  'dining-room': ['dining room', 'dining-room', 'diner'],
  'childrens-room': ['children', "children's", 'kids', "kid's", 'nursery', 'playroom'],
};

/**
 * Normalizes text for matching
 */
function normalizeText(text: string): string {
  return text.toLowerCase().trim();
}

/**
 * Finds matching categories for a product
 */
function findMatchingCategories(title: string, description: string = ''): string[] {
  const text = normalizeText(`${title} ${description}`);
  const matchedCategories: Set<string> = new Set();
  
  for (const [categorySlug, patterns] of Object.entries(categoryPatterns)) {
    for (const pattern of patterns) {
      if (text.includes(normalizeText(pattern))) {
        matchedCategories.add(categorySlug);
        break; // Found a match for this category, move to next
      }
    }
  }
  
  return Array.from(matchedCategories);
}

/**
 * Finds matching tags for a product
 */
function findMatchingTags(title: string, description: string = ''): string[] {
  const text = normalizeText(`${title} ${description}`);
  const matchedTags: Set<string> = new Set();
  
  for (const [tagSlug, patterns] of Object.entries(tagPatterns)) {
    for (const pattern of patterns) {
      if (text.includes(normalizeText(pattern))) {
        matchedTags.add(tagSlug);
        break; // Found a match for this tag, move to next
      }
    }
  }
  
  return Array.from(matchedTags);
}

/**
 * Assigns categories and tags to all products
 */
async function assignCategoriesAndTags() {
  try {
    console.log('📖 Assigning categories and tags to products...');

    console.log('🔌 Connecting to database...');
    await prisma.$connect();

    // Get all products
    const products = await prisma.product.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        slug: true,
      },
    });

    console.log(`📦 Found ${products.length} products to process`);

    // Get all categories and tags from database
    const allCategories = await prisma.category.findMany({
      select: { id: true, slug: true },
    });
    const allTags = await prisma.tags.findMany({
      select: { id: true, slug: true },
    });

    const categoryMap = new Map(allCategories.map(c => [c.slug, c.id]));
    const tagMap = new Map(allTags.map(t => [t.slug, t.id]));

    let processed = 0;
    let withCategories = 0;
    let withTags = 0;
    let errors = 0;

    console.log('\n💾 Processing products...');
    
    for (const product of products) {
      try {
        // Find matching categories and tags
        const categorySlugs = findMatchingCategories(
          product.title,
          product.description || ''
        );
        const tagSlugs = findMatchingTags(
          product.title,
          product.description || ''
        );

        // Get category and tag IDs
        const categoryIds = categorySlugs
          .map(slug => categoryMap.get(slug))
          .filter((id): id is string => id !== undefined);
        
        const tagIds = tagSlugs
          .map(slug => tagMap.get(slug))
          .filter((id): id is string => id !== undefined);

        // Update product with categories and tags
        if (categoryIds.length > 0 || tagIds.length > 0) {
          await prisma.product.update({
            where: { id: product.id },
            data: {
              ...(categoryIds.length > 0 && {
                categories: {
                  set: categoryIds.map(id => ({ id })),
                },
              }),
              ...(tagIds.length > 0 && {
                tags: {
                  set: tagIds.map(id => ({ id })),
                },
              }),
            },
          });

          if (categoryIds.length > 0) {
            withCategories++;
          }
          if (tagIds.length > 0) {
            withTags++;
          }

          if (processed % 50 === 0) {
            console.log(`   📊 Processed: ${processed}/${products.length} products`);
          }
        }

        processed++;
      } catch (error: any) {
        errors++;
        console.error(`   ❌ Error processing product "${product.title}" (${product.slug}):`, error.message);
      }
    }

    console.log(`\n✅ Assignment complete!`);
    console.log(`   📊 Processed: ${processed} products`);
    console.log(`   🏷️  Products with categories: ${withCategories}`);
    console.log(`   🏷️  Products with tags: ${withTags}`);
    console.log(`   ❌ Errors: ${errors}`);

    // Verify
    const productsWithCategories = await prisma.product.count({
      where: { categories: { some: {} } },
    });
    const productsWithTags = await prisma.product.count({
      where: { tags: { some: {} } },
    });
    console.log(`   🔍 Verified: ${productsWithCategories} products have categories, ${productsWithTags} products have tags`);

  } catch (error) {
    console.error('❌ Error assigning categories and tags:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the script
assignCategoriesAndTags()
  .then(() => {
    console.log('\n🎉 Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
