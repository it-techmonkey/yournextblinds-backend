import { prisma } from '../../config/database.js';

// ============================================
// Types
// ============================================

export interface PricingRequest {
  productId: string;
  widthInches: number;
  heightInches: number;
  customizations?: {
    category: string;
    optionId: string;
  }[];
}

export interface PricingResponse {
  dimensionPrice: number;
  customizationPrices: {
    category: string;
    optionId: string;
    name: string;
    price: number;
  }[];
  totalPrice: number;
  widthBand: { mm: number; inches: number };
  heightBand: { mm: number; inches: number };
}

export interface PriceBandMatrix {
  id: string;
  name: string;
  widthBands: { id: string; mm: number; inches: number }[];
  heightBands: { id: string; mm: number; inches: number }[];
  prices: { widthMm: number; heightMm: number; price: number }[];
}

export interface CustomizationPricingData {
  category: string;
  optionId: string;
  name: string;
  prices: { widthMm: number | null; price: number }[];
}

// ============================================
// Helper Functions
// ============================================

/**
 * Find the ceiling width band for a given width in inches
 * Returns the smallest band that can accommodate the width
 */
async function findCeilingWidthBand(widthInches: number) {
  const widthBand = await prisma.widthBand.findFirst({
    where: {
      widthInches: {
        gte: Math.ceil(widthInches),
      },
    },
    orderBy: {
      widthInches: 'asc',
    },
  });

  // If no band found, return the largest band
  if (!widthBand) {
    return prisma.widthBand.findFirst({
      orderBy: {
        widthInches: 'desc',
      },
    });
  }

  return widthBand;
}

/**
 * Find the ceiling height band for a given height in inches
 * Returns the smallest band that can accommodate the height
 */
async function findCeilingHeightBand(heightInches: number) {
  const heightBand = await prisma.heightBand.findFirst({
    where: {
      heightInches: {
        gte: Math.ceil(heightInches),
      },
    },
    orderBy: {
      heightInches: 'asc',
    },
  });

  // If no band found, return the largest band
  if (!heightBand) {
    return prisma.heightBand.findFirst({
      orderBy: {
        heightInches: 'desc',
      },
    });
  }

  return heightBand;
}

// ============================================
// Service Functions
// ============================================

/**
 * Calculate the price for a product with given dimensions and customizations
 */
export async function calculateProductPrice(request: PricingRequest): Promise<PricingResponse> {
  // Get the product with its price band
  const product = await prisma.product.findUnique({
    where: { id: request.productId },
    include: {
      priceBand: true,
    },
  });

  if (!product) {
    throw new Error('Product not found');
  }

  if (!product.priceBandId || !product.priceBand) {
    throw new Error('Product does not have a price band assigned');
  }

  // Find the ceiling bands for the given dimensions
  const widthBand = await findCeilingWidthBand(request.widthInches);
  const heightBand = await findCeilingHeightBand(request.heightInches);

  if (!widthBand || !heightBand) {
    throw new Error('Unable to find appropriate size bands');
  }

  // Get the price cell for this combination
  const priceCell = await prisma.priceCell.findUnique({
    where: {
      priceBandId_widthBandId_heightBandId: {
        priceBandId: product.priceBandId,
        widthBandId: widthBand.id,
        heightBandId: heightBand.id,
      },
    },
  });

  if (!priceCell) {
    throw new Error('Price not found for the given dimensions');
  }

  const dimensionPrice = Number(priceCell.price);

  // Calculate customization prices
  const customizationPrices: PricingResponse['customizationPrices'] = [];

  if (request.customizations && request.customizations.length > 0) {
    for (const customization of request.customizations) {
      const option = await prisma.customizationOption.findUnique({
        where: {
          category_optionId: {
            category: customization.category,
            optionId: customization.optionId,
          },
        },
        include: {
          pricingEntries: {
            where: {
              OR: [
                { widthBandId: null }, // Fixed price
                { widthBandId: widthBand.id }, // Width-dependent price
              ],
            },
          },
        },
      });

      if (option && option.pricingEntries.length > 0) {
        // Prefer width-specific pricing, fall back to fixed pricing
        const pricing = option.pricingEntries.find(p => p.widthBandId === widthBand.id) ||
          option.pricingEntries.find(p => p.widthBandId === null);

        if (pricing) {
          customizationPrices.push({
            category: option.category,
            optionId: option.optionId,
            name: option.name,
            price: Number(pricing.price),
          });
        }
      }
    }
  }

  // Calculate total price
  const customizationTotal = customizationPrices.reduce((sum, c) => sum + c.price, 0);

  // Add motorization base price if applicable
  const hasMotorization = request.customizations?.some(c => c.category === 'motorization');
  const motorizationBasePrice = hasMotorization ? 95 : 0;

  const totalPrice = dimensionPrice + customizationTotal + motorizationBasePrice;

  return {
    dimensionPrice,
    customizationPrices,
    totalPrice,
    widthBand: {
      mm: widthBand.widthMm,
      inches: widthBand.widthInches,
    },
    heightBand: {
      mm: heightBand.heightMm,
      inches: heightBand.heightInches,
    },
  };
}

/**
 * Get the full price band matrix for a product
 */
export async function getPriceBandMatrix(priceBandId: string): Promise<PriceBandMatrix | null> {
  const priceBand = await prisma.priceBand.findUnique({
    where: { id: priceBandId },
    include: {
      priceCells: {
        include: {
          widthBand: true,
          heightBand: true,
        },
      },
    },
  });

  if (!priceBand) {
    return null;
  }

  // Extract unique width and height bands from the price cells
  // This ensures we only return bands that are actually used in this price band
  const widthBandMap = new Map<string, { id: string; mm: number; inches: number }>();
  const heightBandMap = new Map<string, { id: string; mm: number; inches: number }>();

  priceBand.priceCells.forEach(cell => {
    // Add width band if not already in map
    if (!widthBandMap.has(cell.widthBand.id)) {
      widthBandMap.set(cell.widthBand.id, {
        id: cell.widthBand.id,
        mm: cell.widthBand.widthMm,
        inches: cell.widthBand.widthInches,
      });
    }
    // Add height band if not already in map
    if (!heightBandMap.has(cell.heightBand.id)) {
      heightBandMap.set(cell.heightBand.id, {
        id: cell.heightBand.id,
        mm: cell.heightBand.heightMm,
        inches: cell.heightBand.heightInches,
      });
    }
  });

  // Convert maps to arrays and sort by inches
  const widthBands = Array.from(widthBandMap.values()).sort((a, b) => a.inches - b.inches);
  const heightBands = Array.from(heightBandMap.values()).sort((a, b) => a.inches - b.inches);

  return {
    id: priceBand.id,
    name: priceBand.name,
    widthBands,
    heightBands,
    prices: priceBand.priceCells.map(cell => ({
      widthMm: cell.widthBand.widthMm,
      heightMm: cell.heightBand.heightMm,
      price: Number(cell.price),
    })),
  };
}

/**
 * Get all customization options with their pricing
 */
export async function getCustomizationPricing(): Promise<CustomizationPricingData[]> {
  const options = await prisma.customizationOption.findMany({
    include: {
      pricingEntries: {
        include: {
          widthBand: true,
        },
        orderBy: {
          widthBand: {
            sortOrder: 'asc',
          },
        },
      },
    },
    orderBy: [
      { category: 'asc' },
      { sortOrder: 'asc' },
    ],
  });

  return options.map(option => ({
    category: option.category,
    optionId: option.optionId,
    name: option.name,
    prices: option.pricingEntries.map(entry => ({
      widthMm: entry.widthBand?.widthMm || null,
      price: Number(entry.price),
    })),
  }));
}

/**
 * Get all width bands
 */
export async function getWidthBands() {
  return prisma.widthBand.findMany({
    orderBy: { sortOrder: 'asc' },
  });
}

/**
 * Get all height bands
 */
export async function getHeightBands() {
  return prisma.heightBand.findMany({
    orderBy: { sortOrder: 'asc' },
  });
}

/**
 * Get price band by name
 */
export async function getPriceBandByName(name: string) {
  return prisma.priceBand.findUnique({
    where: { name },
  });
}

/**
 * Get product with its price band
 */
export async function getProductWithPriceBand(productId: string) {
  return prisma.product.findUnique({
    where: { id: productId },
    include: {
      priceBand: true,
    },
  });
}

/**
 * Get the minimum price for a price band
 * Finds the price cell with the smallest width × height combination
 * This is the price shown on the product listing
 */
export async function getMinimumPrice(priceBandId: string): Promise<number | null> {
  // Get all price cells for this band
  const priceCells = await prisma.priceCell.findMany({
    where: { priceBandId },
    include: {
      widthBand: true,
      heightBand: true,
    },
  });

  if (priceCells.length === 0) {
    return null;
  }

  // Find the minimum price cell by sorting by width × height (area)
  // Then by width, then by height to ensure consistent ordering
  const sortedCells = priceCells.sort((a, b) => {
    const areaA = a.widthBand.widthMm * a.heightBand.heightMm;
    const areaB = b.widthBand.widthMm * b.heightBand.heightMm;
    
    if (areaA !== areaB) {
      return areaA - areaB;
    }
    
    // If areas are equal, sort by width first, then height
    if (a.widthBand.widthMm !== b.widthBand.widthMm) {
      return a.widthBand.widthMm - b.widthBand.widthMm;
    }
    
    return a.heightBand.heightMm - b.heightBand.heightMm;
  });

  // Return the price of the smallest cell (minimum band)
  return Number(sortedCells[0].price);
}

/**
 * Get minimum prices for multiple price bands in a single query
 * This is much more efficient than calling getMinimumPrice multiple times
 * Returns a map of priceBandId -> minimum price
 */
export async function getMinimumPricesBatch(priceBandIds: string[]): Promise<Map<string, number>> {
  if (priceBandIds.length === 0) {
    return new Map();
  }

  // Filter out null/undefined values
  const validPriceBandIds = priceBandIds.filter((id): id is string => Boolean(id));
  
  if (validPriceBandIds.length === 0) {
    return new Map();
  }

  // Get all price cells for all bands in one query
  const priceCells = await prisma.priceCell.findMany({
    where: {
      priceBandId: {
        in: validPriceBandIds,
      },
    },
    include: {
      widthBand: true,
      heightBand: true,
    },
  });

  // Group price cells by priceBandId
  const cellsByBand = new Map<string, typeof priceCells>();
  priceCells.forEach(cell => {
    if (!cellsByBand.has(cell.priceBandId)) {
      cellsByBand.set(cell.priceBandId, []);
    }
    cellsByBand.get(cell.priceBandId)!.push(cell);
  });

  // Calculate minimum price for each band
  const result = new Map<string, number>();
  
  cellsByBand.forEach((cells, priceBandId) => {
    if (cells.length === 0) {
      return;
    }

    // Find the minimum price cell by sorting by width × height (area)
    const sortedCells = cells.sort((a, b) => {
      const areaA = a.widthBand.widthMm * a.heightBand.heightMm;
      const areaB = b.widthBand.widthMm * b.heightBand.heightMm;
      
      if (areaA !== areaB) {
        return areaA - areaB;
      }
      
      // If areas are equal, sort by width first, then height
      if (a.widthBand.widthMm !== b.widthBand.widthMm) {
        return a.widthBand.widthMm - b.widthBand.widthMm;
      }
      
      return a.heightBand.heightMm - b.heightBand.heightMm;
    });

    result.set(priceBandId, Number(sortedCells[0].price));
  });

  return result;
}

/**
 * Validate cart price
 * Returns true if the calculated price matches the submitted price (within tolerance)
 */
export async function validateCartPrice(
  request: PricingRequest,
  submittedPrice: number,
  tolerance: number = 0.01
): Promise<{ valid: boolean; calculatedPrice: number; difference: number }> {
  const pricing = await calculateProductPrice(request);
  const difference = Math.abs(pricing.totalPrice - submittedPrice);

  return {
    valid: difference <= tolerance,
    calculatedPrice: pricing.totalPrice,
    difference,
  };
}
