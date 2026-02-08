import axios from 'axios';
import * as cheerio from 'cheerio';
import { writeFileSync } from 'fs';
import { join } from 'path';
import * as readline from 'readline';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { extractShopifyProduct } from './extractShopifyProduct';

dotenv.config();

// Initialize Prisma client for database access
let prisma: PrismaClient | null = null;

function getPrismaClient(): PrismaClient {
  if (!prisma) {
    const connectionString = process.env.DATABASE_URL!;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required for category/tag assignment');
    }

    const pool = new Pool({
      connectionString,
      ssl: connectionString.includes('render.com') || connectionString.includes('onrender.com') 
        ? { rejectUnauthorized: false } 
        : false,
    });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

/**
 * Fabric-to-Price-Band mapping based on Bands.md
 * Structure: { fabricName: { category: 'category-slug', band: 'A'|'B'|'C'|'D'|'E'|'F'|'G' } }
 * Some fabrics appear in multiple categories with DIFFERENT price bands (e.g., CALIFORNIA: B in roller, A in vertical)
 * We store each category-band combination separately
 */
const fabricToPriceBand: Record<string, Array<{ category: string; band: string }>> = {
  // Roller Blinds - Light Filtering
  'ATLANTIC': [{ category: 'roller-blinds', band: 'B' }, { category: 'vertical-blinds', band: 'B' }],
  'BERRY': [{ category: 'roller-blinds', band: 'D' }],
  'CALIFORNIA': [{ category: 'roller-blinds', band: 'B' }, { category: 'vertical-blinds', band: 'A' }],
  'DOLPHIN': [{ category: 'roller-blinds', band: 'B' }],
  'ELM': [{ category: 'roller-blinds', band: 'D' }],
  'FABIAN': [{ category: 'roller-blinds', band: 'C' }, { category: 'vertical-blinds', band: 'B' }],
  'FEATHERWEAVE': [{ category: 'roller-blinds', band: 'B' }, { category: 'vertical-blinds', band: 'A' }],
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
  
  // Roller Blinds - Black Out (also used in Vertical Blinds Black Out - same band D)
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
  
  // Vertical Blinds - Light Filtering (only in vertical)
  'ALABAMA': [{ category: 'vertical-blinds', band: 'B' }],
  'BADAR': [{ category: 'vertical-blinds', band: 'B' }],
  'BOND': [{ category: 'vertical-blinds', band: 'A' }],
  'CLOUD': [{ category: 'vertical-blinds', band: 'A' }],
  'CROSS STITCH': [{ category: 'vertical-blinds', band: 'B' }],
  'DAISY': [{ category: 'vertical-blinds', band: 'C' }],
  'DOLPHINE': [{ category: 'vertical-blinds', band: 'A' }],
  'EVERSEST': [{ category: 'vertical-blinds', band: 'B' }],
  'HENLY': [{ category: 'vertical-blinds', band: 'A' }],
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
  
  // Vertical Blinds - Black Out (KIA is only in vertical, not roller)
  'KIA': [{ category: 'vertical-blinds', band: 'D' }],
};

/**
 * Fabric-to-Tag mapping based on Bands.md
 * Maps fabric name + category combination to required tags (light-filtering, blackout, waterproof)
 * Structure: { fabricName: { category: ['tag1', 'tag2'] } }
 */
const fabricToTags: Record<string, Record<string, string[]>> = {
  // Roller Blinds - Light Filtering (some also in vertical)
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
  
  // Roller Blinds - Black Out (some also in vertical)
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
 * Category matching patterns - maps keywords to category slugs
 * Only includes categories that are actually used on the website (from createCategories.ts)
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
 * Only includes tags that are actually used on the website (from createTags.ts)
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
 * Extracts fabric name from product title
 * Fabric names are typically at the start of the title (e.g., "ATLANTIC Light Filtering Roller Blind")
 */
function extractFabricName(title: string): string | null {
  const normalizedTitle = title.toUpperCase().trim();
  
  // Try to match fabric names (case-insensitive)
  for (const fabricName of Object.keys(fabricToPriceBand)) {
    const normalizedFabric = fabricName.toUpperCase();
    
    // Check if fabric name appears at the start of the title or after common prefixes
    if (normalizedTitle.includes(normalizedFabric)) {
      // Prefer exact match at start, but also accept if it's clearly the fabric name
      // Handle multi-word fabrics like "UNITY POLARIS", "PLAIN SOFT", "SOFT TRACEY"
      const fabricWords = normalizedFabric.split(' ');
      if (fabricWords.length > 1) {
        // Multi-word fabric - check if all words appear together
        const fabricPattern = fabricWords.join('\\s+');
        const regex = new RegExp(`\\b${fabricPattern}\\b`, 'i');
        if (regex.test(title)) {
          return fabricName;
        }
      } else {
        // Single-word fabric - check for word boundary
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
 * Finds price band for a product based on fabric name and category
 * Returns the price band ID if found in database, null otherwise
 * 
 * Note: Some fabrics appear in multiple categories with DIFFERENT price bands
 * (e.g., CALIFORNIA: Band B in roller-blinds, Band A in vertical-blinds)
 * We match the fabric to the specific category to get the correct band
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

  // Find the matching category-band combination
  // Priority: match the first category that appears in both fabric mappings and product categories
  let matchedBand: string | null = null;
  let matchedCategory: string | null = null;
  
  for (const categorySlug of categorySlugs) {
    const mapping = fabricMappings.find(m => {
      // Handle day-and-night-blinds variations
      if (m.category === 'day-and-night-blinds') {
        return categorySlug === 'day-and-night-blinds' || categorySlug === 'day-night-blinds';
      }
      return categorySlug === m.category;
    });
    
    if (mapping) {
      matchedBand = mapping.band;
      matchedCategory = mapping.category;
      break; // Use the first match (prioritize primary categories)
    }
  }

  if (!matchedBand || !matchedCategory) {
    return null;
  }

  try {
    const db = getPrismaClient();
    
    // Get the category-specific prefix for the price band name
    // Price bands in DB are category-specific (e.g., "Vertical Blind - Band A", "Roller - Band B")
    const categoryToPrefix: Record<string, string> = {
      'vertical-blinds': 'Vertical Blind',
      'roller-blinds': 'Roller',
      'day-and-night-blinds': 'Dayandnight',
      'eclipsecore-shades': 'Eclipsecore',
    };
    
    const prefix = categoryToPrefix[matchedCategory] || '';
    if (!prefix) {
      return null;
    }

    // Special case for Eclipsecore (no band letter)
    if (matchedCategory === 'eclipsecore-shades') {
      const eclipsecoreBand = await db.priceBand.findUnique({
        where: { name: 'Eclipsecore Band' },
        select: { id: true },
      });
      return eclipsecoreBand?.id || null;
    }

    // Construct the price band name (e.g., "Vertical Blind - Band A", "Roller - Band B")
    const priceBandName = `${prefix} - Band ${matchedBand}`;
    const priceBand = await db.priceBand.findUnique({
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
 * Finds matching categories for a product based on title and description
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
 * Finds matching tags for a product based on title and description
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
 * Assigns categories, tags, and price band to a product based on title and description
 * Returns category slugs, tag slugs, and price band ID that exist in the database
 */
async function assignCategoriesAndTagsToProduct(
  title: string,
  description: string | null
): Promise<{ categorySlugs: string[]; tagSlugs: string[]; priceBandId: string | null }> {
  try {
    const db = getPrismaClient();
    
    // Get all categories and tags from database
    const allCategories = await db.category.findMany({
      select: { slug: true },
    });
    const allTags = await db.tags.findMany({
      select: { slug: true },
    });

    const validCategorySlugs = new Set(allCategories.map(c => c.slug));
    const validTagSlugs = new Set(allTags.map(t => t.slug));

    // Find matching categories
    const matchedCategorySlugs = findMatchingCategories(title, description || '');
    
    // Filter to only include slugs that exist in the database
    const categorySlugs = matchedCategorySlugs.filter(slug => validCategorySlugs.has(slug));

    // Extract fabric name and find price band
    const fabricName = extractFabricName(title);
    const priceBandId = await findPriceBandId(fabricName, categorySlugs);
    
    // Get tags from fabric-to-tag mapping (based on Bands.md)
    const fabricBasedTags: string[] = [];
    for (const categorySlug of categorySlugs) {
      const tags = getFabricTags(fabricName, categorySlug);
      fabricBasedTags.push(...tags);
    }
    
    // Also find tags from title/description (colors, patterns, etc.)
    const matchedTagSlugs = findMatchingTags(title, description || '');
    
    // Combine fabric-based tags with matched tags, removing duplicates
    const allTagSlugs = Array.from(new Set([...fabricBasedTags, ...matchedTagSlugs]));
    
    // Filter to only include slugs that exist in the database
    const tagSlugs = allTagSlugs.filter(slug => validTagSlugs.has(slug));

    return { categorySlugs, tagSlugs, priceBandId };
  } catch (error: any) {
    // If database connection fails, return empty arrays (extraction can continue)
    console.warn(`   ⚠️  Could not assign categories/tags/priceBand (${error.message}), continuing without them`);
    return { categorySlugs: [], tagSlugs: [], priceBandId: null };
  }
}

/**
 * Normalizes a product URL to ensure consistent deduplication
 */
function normalizeProductUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove query params and fragments, keep only pathname
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`.toLowerCase();
  } catch {
    // If URL parsing fails, try to extract product path
    const match = url.match(/(https?:\/\/[^\/]+)(\/products\/[^\/\?#]+)/i);
    if (match) {
      return match[0].toLowerCase().split('?')[0].split('#')[0];
    }
    return url.toLowerCase().split('?')[0].split('#')[0];
  }
}

/**
 * Extracts all product URLs from a Shopify collection/category page
 * Only extracts products that are directly linked from the provided collection page
 * Uses normalized URLs to prevent duplicates
 */
function extractProductUrls($: cheerio.Root, baseUrl: string, collectionUrl: string): string[] {
  const productUrls = new Set<string>();
  
  // Extract the collection path from the provided URL to ensure we only get products from this collection
  let collectionPath = '';
  try {
    const collectionUrlObj = new URL(collectionUrl);
    collectionPath = collectionUrlObj.pathname;
  } catch {
    // If parsing fails, try to extract from string
    const match = collectionUrl.match(/\/collections\/[^\/\?#]+/);
    if (match) {
      collectionPath = match[0];
    }
  }

  // Extract the target collection slug from the collection URL for filtering
  let targetCollectionSlug = '';
  try {
    const collectionUrlObj = new URL(collectionUrl);
    const pathMatch = collectionUrlObj.pathname.match(/\/collections\/([^\/\?#]+)/);
    if (pathMatch) {
      targetCollectionSlug = pathMatch[1];
    }
  } catch {
    const pathMatch = collectionUrl.match(/\/collections\/([^\/\?#]+)/);
    if (pathMatch) {
      targetCollectionSlug = pathMatch[1];
    }
  }

  // Common Shopify product link selectors - but only within the collection context
  const productSelectors = [
    'a[href*="/products/"]',
    '.product-card a',
    '.product-item a',
    '.product-link',
    '[data-product-url]',
    '.grid-product__link',
    '.product__link',
  ];

  productSelectors.forEach(selector => {
    $(selector).each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        // Skip products in global navigation, recommendations, or other collection sections
        const $element = $(element);
        const isInNavigation = $element.closest('nav, header, .navigation, .nav, .menu, .sidebar, .recommendations, .related-products, .you-may-also-like').length > 0;
        if (isInNavigation) {
          return; // Skip products in navigation/recommendation sections
        }

        // Skip if this link is inside a collection link that goes to /collections/all or another collection
        const parentCollectionLink = $element.closest('a[href*="/collections/"]');
        if (parentCollectionLink.length > 0) {
          const parentHref = parentCollectionLink.attr('href');
          if (parentHref) {
            // Skip if parent is /collections/all
            if (parentHref.includes('/collections/all')) {
              return;
            }
            // Skip if parent is a different collection (not the target collection)
            if (targetCollectionSlug && !parentHref.includes(`/collections/${targetCollectionSlug}`)) {
              return;
            }
          }
        }

        // Handle relative URLs
        let fullUrl = href;
        if (href.startsWith('/')) {
          try {
            const urlObj = new URL(baseUrl);
            fullUrl = `${urlObj.protocol}//${urlObj.host}${href}`;
          } catch {
            fullUrl = href.startsWith('http') ? href : `https://${href}`;
          }
        } else if (!href.startsWith('http')) {
          try {
            const urlObj = new URL(baseUrl);
            fullUrl = `${urlObj.protocol}//${urlObj.host}/${href}`;
          } catch {
            fullUrl = `https://${href}`;
          }
        }

        // Only include URLs that contain /products/ and NOT from /collections/all
        // Also verify it's not from a different collection by checking the page context
        if (fullUrl.includes('/products/') && !fullUrl.includes('/collections/all')) {
          // Normalize URL to prevent duplicates
          const normalizedUrl = normalizeProductUrl(fullUrl);
          if (normalizedUrl.includes('/products/')) {
            productUrls.add(normalizedUrl);
          }
        }
      }
    });
  });

  // Also check for product URLs in JSON-LD structured data
  // CRITICAL: Only extract if the JSON-LD is for the CURRENT collection (not /collections/all or other collections)
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const content = $(element).html();
      if (content) {
        const data = JSON.parse(content);
        
        // Extract the target collection slug from the collection URL
        let targetCollectionSlug = '';
        try {
          const collectionUrlObj = new URL(collectionUrl);
          const pathMatch = collectionUrlObj.pathname.match(/\/collections\/([^\/\?#]+)/);
          if (pathMatch) {
            targetCollectionSlug = pathMatch[1];
          }
        } catch {
          const pathMatch = collectionUrl.match(/\/collections\/([^\/\?#]+)/);
          if (pathMatch) {
            targetCollectionSlug = pathMatch[1];
          }
        }
        
        // Check if this JSON-LD is for the current collection
        let isCurrentCollection = false;
        let isAllCollection = false;
        
        // Check main entity or @id
        if (data['@type'] === 'CollectionPage' || data.mainEntity) {
          const collectionId = data.mainEntity?.['@id'] || data['@id'] || '';
          if (collectionId.includes('/collections/all') || collectionId.includes('/collections/all/')) {
            isAllCollection = true;
          } else if (targetCollectionSlug && collectionId.includes(`/collections/${targetCollectionSlug}`)) {
            isCurrentCollection = true;
          }
        }
        
        // Check in @graph for CollectionPage
        if (data['@graph'] && !isAllCollection && !isCurrentCollection) {
          const collectionPage = data['@graph'].find((item: any) => 
            (item['@type'] === 'CollectionPage' || item['@type'] === 'WebPage') && 
            (item['@id'] || item.url)
          );
          if (collectionPage) {
            const collectionId = collectionPage['@id'] || collectionPage.url || '';
            if (collectionId.includes('/collections/all') || collectionId.includes('/collections/all/')) {
              isAllCollection = true;
            } else if (targetCollectionSlug && collectionId.includes(`/collections/${targetCollectionSlug}`)) {
              isCurrentCollection = true;
            }
          }
        }
        
        // Only extract products if this JSON-LD is for the CURRENT collection (not /collections/all or other collections)
        if (isCurrentCollection && !isAllCollection) {
          // Check for ItemList with products
          if (data['@type'] === 'ItemList' && data.itemListElement) {
            data.itemListElement.forEach((item: any) => {
              if (item.item && item.item['@id']) {
                const productUrl = item.item['@id'];
                if (productUrl && productUrl.includes('/products/') && !productUrl.includes('/collections/all')) {
                  const normalizedUrl = normalizeProductUrl(productUrl);
                  if (normalizedUrl.includes('/products/')) {
                    productUrls.add(normalizedUrl);
                  }
                }
              }
            });
          }
          // Check for @graph with products
          if (data['@graph']) {
            data['@graph'].forEach((item: any) => {
              if (item['@type'] === 'Product' && item['@id']) {
                const productUrl = item['@id'];
                if (productUrl && productUrl.includes('/products/') && !productUrl.includes('/collections/all')) {
                  const normalizedUrl = normalizeProductUrl(productUrl);
                  if (normalizedUrl.includes('/products/')) {
                    productUrls.add(normalizedUrl);
                  }
                }
              }
            });
          }
        }
      }
    } catch (error) {
      // Silently continue
    }
  });

  return Array.from(productUrls);
}

/**
 * Gets the next page URL using ?page= query parameter
 */
function getNextPageUrl(baseUrl: string, currentPage: number): string {
  try {
    const urlObj = new URL(baseUrl);
    urlObj.searchParams.set('page', String(currentPage + 1));
    return urlObj.toString();
  } catch {
    // If URL parsing fails, append ?page= parameter
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}page=${currentPage + 1}`;
  }
}

/**
 * Checks if a page has pagination indicators suggesting more pages exist
 */
function hasPaginationIndicators($: cheerio.Root, currentPage: number): boolean {
  // Check for pagination indicators
  const paginationSelectors = [
    '.pagination',
    '.pagination__nav',
    '[data-pagination]',
    '.page-numbers',
    'nav[aria-label*="pagination"]',
  ];

  for (const selector of paginationSelectors) {
    const pagination = $(selector);
    if (pagination.length > 0) {
      // Check for "next" button or page numbers higher than current
      const nextButton = pagination.find('a[rel="next"], .next, [aria-label*="next" i]');
      if (nextButton.length > 0 && nextButton.attr('href')) {
        return true;
      }
      
      // Check for page numbers
      const pageNumbers = pagination.find('a, button').map((_, el) => {
        const text = $(el).text().trim();
        const pageNum = parseInt(text);
        return isNaN(pageNum) ? 0 : pageNum;
      }).get();
      
      const maxPage = Math.max(...pageNumbers, 0);
      if (maxPage > currentPage) {
        return true;
      }
    }
  }

  // Check for "Load More" or "Show More" buttons
  const loadMoreSelectors = [
    'button:contains("Load More")',
    'button:contains("Show More")',
    'a:contains("Load More")',
    '[data-load-more]',
  ];

  for (const selector of loadMoreSelectors) {
    if ($(selector).length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Analyzes a collection page to determine total pages and products
 */
async function analyzeCollection(collectionUrl: string): Promise<{
  totalPages: number;
  totalProducts: number;
  productUrls: string[];
}> {
  const allProductUrls = new Set<string>();
  let currentPage = 1;
  let hasMorePages = true;
  let consecutiveEmptyPages = 0;
  const baseUrl = collectionUrl.split('?')[0];

  // Ensure we start with the base collection URL
  let currentUrl = baseUrl;
  try {
    const urlObj = new URL(baseUrl);
    urlObj.searchParams.delete('page');
    currentUrl = urlObj.toString();
  } catch {
    currentUrl = baseUrl;
  }

  console.log(`🔍 Analyzing collection: ${collectionUrl}\n`);

  while (hasMorePages) {
    const pageUrl = currentPage === 1 ? currentUrl : getNextPageUrl(currentUrl, currentPage - 1);
    
    console.log(`   📄 Checking page ${currentPage}...`);

    try {
      const response = await axios.get(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        timeout: 30000,
        validateStatus: (status) => status < 500,
      });

      // If we get a 404, definitely stop
      if (response.status === 404) {
        console.log(`   ⚠️  Page ${currentPage} returned 404, stopping pagination`);
        hasMorePages = false;
        break;
      }

      if (!response.data) {
        console.log(`   ⚠️  Page ${currentPage} returned empty response, stopping pagination`);
        hasMorePages = false;
        break;
      }

      const $ = cheerio.load(response.data);
      const productUrls = extractProductUrls($, pageUrl, collectionUrl);

      if (productUrls.length > 0) {
        consecutiveEmptyPages = 0; // Reset counter
        productUrls.forEach(url => allProductUrls.add(url));
        console.log(`   ✓ Found ${productUrls.length} products on page ${currentPage}`);
      } else {
        consecutiveEmptyPages++;
        console.log(`   ⚠️  No products found on page ${currentPage}`);
        
        // Check if there are pagination indicators suggesting more pages
        const hasPagination = hasPaginationIndicators($, currentPage);
        
        if (!hasPagination) {
          // No pagination indicators - stop immediately
          console.log(`   ⚠️  No pagination indicators found, stopping pagination`);
          hasMorePages = false;
          break;
        } else if (consecutiveEmptyPages >= 2) {
          // Stop if we've had 2 consecutive empty pages even with pagination indicators
          // (might be a false positive or the site is broken)
          console.log(`   ⚠️  ${consecutiveEmptyPages} consecutive empty pages, stopping pagination`);
          hasMorePages = false;
          break;
        } else {
          console.log(`   ℹ️  Pagination indicators found, continuing...`);
        }
      }

      currentPage++;

      // Safety limit - reasonable limit for collections
      if (currentPage > 100) {
        console.log(`   ⚠️  Reached page limit (100), stopping pagination`);
        hasMorePages = false;
        break;
      }

    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log(`   ⚠️  Page ${currentPage} returned 404, stopping pagination`);
        hasMorePages = false;
        break;
      }
      
      if (currentPage > 1) {
        // If it's not the first page and we get an error, try to continue
        console.log(`   ⚠️  Error on page ${currentPage} (${error.message}), trying next page...`);
        consecutiveEmptyPages++;
        if (consecutiveEmptyPages >= 2) {
          console.log(`   ⚠️  ${consecutiveEmptyPages} consecutive errors, stopping pagination`);
          hasMorePages = false;
          break;
        }
        currentPage++;
        continue;
      }
      
      // If it's the first page, throw the error
      throw error;
    }
  }

  const uniqueUrls = Array.from(allProductUrls);
  return {
    totalPages: currentPage - 1,
    totalProducts: uniqueUrls.length,
    productUrls: uniqueUrls,
  };
}

/**
 * Prompts user for confirmation
 */
function askForConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Extracts all product URLs from a collection page, handling pagination with ?page= parameter
 */
async function extractAllProductUrls(collectionUrl: string, knownProductUrls: string[]): Promise<string[]> {
  // If we already have the URLs from analysis, return them
  if (knownProductUrls.length > 0) {
    return knownProductUrls;
  }

  // Otherwise, extract them (fallback)
  const allProductUrls = new Set<string>();
  let currentPage = 1;
  let hasMorePages = true;
  const baseUrl = collectionUrl.split('?')[0];

  let currentUrl = baseUrl;
  try {
    const urlObj = new URL(baseUrl);
    urlObj.searchParams.delete('page');
    currentUrl = urlObj.toString();
  } catch {
    currentUrl = baseUrl;
  }

  console.log(`🔍 Extracting product URLs from collection: ${collectionUrl}`);

  while (hasMorePages) {
    const pageUrl = currentPage === 1 ? currentUrl : getNextPageUrl(currentUrl, currentPage - 1);
    
    console.log(`   📄 Fetching page ${currentPage}: ${pageUrl}`);

    try {
      const response = await axios.get(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        timeout: 30000,
        validateStatus: (status) => status < 500,
      });

      if (response.status === 404 || !response.data) {
        console.log(`   ⚠️  Page ${currentPage} returned 404 or empty, stopping pagination`);
        hasMorePages = false;
        break;
      }

      const $ = cheerio.load(response.data);
      const productUrls = extractProductUrls($, pageUrl, collectionUrl);

      console.log(`   ✓ Found ${productUrls.length} products on page ${currentPage}`);

      if (productUrls.length === 0) {
        console.log(`   ⚠️  No products found on page ${currentPage}, stopping pagination`);
        hasMorePages = false;
        break;
      }

      productUrls.forEach(url => allProductUrls.add(url));

      currentPage++;

      if (currentPage > 100) {
        console.log(`   ⚠️  Reached page limit (100), stopping pagination`);
        hasMorePages = false;
        break;
      }

    } catch (error: any) {
      if (error.response?.status === 404 || currentPage > 1) {
        console.log(`   ⚠️  Error on page ${currentPage} (${error.message}), stopping pagination`);
        hasMorePages = false;
        break;
      }
      console.error(`   ❌ Error fetching page ${currentPage}:`, error.message);
      throw error;
    }
  }

  const uniqueUrls = Array.from(allProductUrls);
  console.log(`\n✅ Found ${uniqueUrls.length} unique products across ${currentPage - 1} page(s)`);
  return uniqueUrls;
}

/**
 * Extracts all products from a Shopify collection/category page
 * 
 * @param collectionUrl - The URL of the Shopify collection/category page
 * @param options - Extraction options
 * @returns Array of extracted products
 */
export async function extractShopifyCategory(
  collectionUrl: string,
  options: {
    maxConcurrent?: number; // Max concurrent product extractions (default: 3)
    delayBetweenRequests?: number; // Delay in ms between requests (default: 1000)
    skipConfirmation?: boolean; // Skip user confirmation (default: false)
  } = {}
): Promise<any[]> {
  const { maxConcurrent = 3, delayBetweenRequests = 1000, skipConfirmation = false } = options;

  // Step 1: Analyze the collection to get page and product counts
  console.log('📊 Step 1: Analyzing collection...\n');
  const analysis = await analyzeCollection(collectionUrl);

  // Step 2: Display summary and ask for confirmation
  console.log('\n' + '='.repeat(60));
  console.log('📋 COLLECTION ANALYSIS SUMMARY');
  console.log('='.repeat(60));
  console.log(`Collection URL: ${collectionUrl}`);
  console.log(`Total Pages: ${analysis.totalPages}`);
  console.log(`Total Products: ${analysis.totalProducts}`);
  console.log('='.repeat(60) + '\n');

  if (!skipConfirmation) {
    const confirmed = await askForConfirmation('Do you want to proceed with extraction? (y/n): ');
    if (!confirmed) {
      console.log('\n❌ Extraction cancelled by user.');
      return [];
    }
    console.log('\n✅ Starting extraction...\n');
  }

  // Step 3: Use the product URLs from analysis (already extracted)
  const productUrls = analysis.productUrls;

  if (productUrls.length === 0) {
    console.log('⚠️  No products found on this collection page');
    return [];
  }

  console.log(`\n📦 Extracting data from ${productUrls.length} products...`);
  console.log(`   Using ${maxConcurrent} concurrent extractions with ${delayBetweenRequests}ms delay\n`);

  // Step 2: Extract each product
  const products: any[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  // Process products in batches to control concurrency
  for (let i = 0; i < productUrls.length; i += maxConcurrent) {
    const batch = productUrls.slice(i, i + maxConcurrent);
    
    const batchPromises = batch.map(async (url, index) => {
      // Add delay to avoid overwhelming the server
      if (i + index > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
      }

      try {
        console.log(`   [${i + index + 1}/${productUrls.length}] Extracting: ${url}`);
        const product = await extractShopifyProduct(url);
        
        // Skip products with "SPARE PARTS" or "SPAREPARTS" in the title
        const titleUpper = product.title.toUpperCase();
        if (titleUpper.includes('SPARE PARTS') || titleUpper.includes('SPAREPARTS')) {
          console.log(`   ⏭️  Skipping spare parts product: ${product.title}`);
          return null;
        }
        
        // Transform to product format (without slug, categories, tags, priceBandId)
        const now = new Date();
        const createdAt = now;
        const updatedAt = now;

        // Format date helper
        const formatDate = (date: Date): string => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
          return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
        };

        // Strip HTML tags helper
        const stripHtmlTags = (html: string | null | undefined): string | null => {
          if (!html) return null;
          return html
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
        };

        // Generate CUID helper
        const generateCuid = (): string => {
          const prefix = 'cmj';
          const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
          let random = '';
          for (let j = 0; j < 25; j++) {
            random += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          return prefix + random;
        };

        // Assign categories, tags, and price band based on title and description
        const { categorySlugs, tagSlugs, priceBandId } = await assignCategoriesAndTagsToProduct(
          product.title,
          product.description || null
        );

        const transformedProduct = {
          id: generateCuid(),
          title: product.title,
          description: stripHtmlTags(product.description) || null,
          images: product.images,
          videos: product.videos,
          createdAt: formatDate(createdAt),
          updatedAt: formatDate(updatedAt),
          // Categories and tags are assigned automatically from DB based on title/description
          categories: categorySlugs, // Array of category slugs
          tags: tagSlugs, // Array of tag slugs
          // Price band is assigned based on fabric name from Bands.md
          priceBandId: priceBandId || undefined, // Price band ID (if fabric found in Bands.md)
          // slug will be assigned automatically during import
        };

        const categoryInfo = categorySlugs.length > 0 ? ` [Categories: ${categorySlugs.join(', ')}]` : '';
        const tagInfo = tagSlugs.length > 0 ? ` [Tags: ${tagSlugs.length}]` : '';
        const priceBandInfo = priceBandId ? ` [Price Band: ${priceBandId.substring(0, 8)}...]` : '';
        console.log(`   ✓ Successfully extracted: ${product.title}${categoryInfo}${tagInfo}${priceBandInfo}`);
        return transformedProduct;
      } catch (error: any) {
        const errorMsg = error.message || 'Unknown error';
        console.error(`   ❌ Failed to extract ${url}: ${errorMsg}`);
        errors.push({ url, error: errorMsg });
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    products.push(...batchResults.filter(p => p !== null));
  }

  console.log(`\n✅ Extraction complete!`);
  console.log(`   Successfully extracted: ${products.length} products`);
  if (errors.length > 0) {
    console.log(`   Failed extractions: ${errors.length}`);
    console.log(`   Failed URLs:`);
    errors.forEach(({ url, error }) => {
      console.log(`     - ${url}: ${error}`);
    });
  }

  // Close database connection if it was opened
  if (prisma) {
    await prisma.$disconnect();
  }

  return products;
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: tsx extractShopifyCategory.ts <collection-url> [output-file] [options]

Examples:
  tsx extractShopifyCategory.ts https://1clickblinds.co.uk/collections/roller-blinds
  tsx extractShopifyCategory.ts https://1clickblinds.co.uk/collections/roller-blinds output.json
  tsx extractShopifyCategory.ts https://1clickblinds.co.uk/collections/roller-blinds output.json --max-concurrent=5 --delay=2000

Options:
  --max-concurrent=<number>  Maximum concurrent product extractions (default: 3)
  --delay=<number>            Delay in milliseconds between requests (default: 1000)
  --skip-confirmation         Skip confirmation prompt and start extraction immediately
  --yes, -y                   Alias for --skip-confirmation
    `);
    process.exit(1);
  }

  const collectionUrl = args[0];
  const outputFile = args[1];

  // Parse options
  const options: { maxConcurrent?: number; delayBetweenRequests?: number; skipConfirmation?: boolean } = {};
  args.forEach(arg => {
    if (arg.startsWith('--max-concurrent=')) {
      options.maxConcurrent = parseInt(arg.split('=')[1]) || 3;
    } else if (arg.startsWith('--delay=')) {
      options.delayBetweenRequests = parseInt(arg.split('=')[1]) || 1000;
    } else if (arg === '--skip-confirmation' || arg === '--yes' || arg === '-y') {
      options.skipConfirmation = true;
    }
  });

  try {
    const products = await extractShopifyCategory(collectionUrl, options);

    if (products.length === 0) {
      console.log('\n⚠️  No products were extracted');
      process.exit(1);
    }

    // Output as array (matching the Product.json format)
    const output = JSON.stringify(products, null, 2);

    if (outputFile) {
      // Use process.cwd() for output path when running as script
      const outputPath = outputFile.startsWith('/') || outputFile.match(/^[A-Z]:/)
        ? outputFile
        : join(process.cwd(), outputFile);
      writeFileSync(outputPath, output, 'utf-8');
      console.log(`\n💾 Saved ${products.length} products to: ${outputPath}`);
    } else {
      console.log(`\n📄 Extracted ${products.length} Products:`);
      console.log(output);
    }

  } catch (error: any) {
    console.error('\n💥 Failed to extract products:', error.message);
    process.exit(1);
  }
}

// Only run main if this file is executed directly (not imported)
if (typeof require !== 'undefined' && require.main === module) {
  main();
} else if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].includes('extractShopifyCategory')) {
  main();
}
