import { prisma } from '../../config/database.js';
import { getMinimumPrice, getMinimumPricesBatch } from '../pricing/pricing.services.js';

interface GetAllProductsParams {
  page?: number;
  limit?: number;
  tags?: string[];
  search?: string;
}

/**
 * Get minimum price for a product's price band
 * Returns the price from the smallest width × height combination in the band
 */
async function getProductPrice(product: any): Promise<number | null> {
  if (!product.priceBandId) {
    return null;
  }
  return getMinimumPrice(product.priceBandId);
}

export const getAllProducts = async (params: GetAllProductsParams = {}) => {
  const page = params.page || 1;
  const limit = params.limit || 20;
  const skip = (page - 1) * limit;

  // Build where clause for filtering
  const where: any = {};
  
  if (params.tags && params.tags.length > 0) {
    // Filter by tag slugs
    where.tags = {
      some: {
        slug: {
          in: params.tags,
        },
      },
    };
  }

  // Add search functionality
  if (params.search && params.search.trim()) {
    const searchTerm = params.search.trim();
    
    // Search in multiple fields: title, description, category names, tag names
    where.OR = [
      {
        title: {
          contains: searchTerm,
          mode: 'insensitive',
        },
      },
      {
        description: {
          contains: searchTerm,
          mode: 'insensitive',
        },
      },
      {
        categories: {
          some: {
            name: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
        },
      },
      {
        categories: {
          some: {
            slug: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
        },
      },
      {
        tags: {
          some: {
            name: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
        },
      },
      {
        tags: {
          some: {
            slug: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
        },
      },
    ];
  }

  // Get total count for pagination
  const total = await prisma.product.count({ where });

  // Get paginated products
  const products = await prisma.product.findMany({
    where,
    include: {
      categories: true,
      tags: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    skip,
    take: limit,
  });

  // Batch fetch all minimum prices in a single query instead of N queries
  const priceBandIds = products
    .map(p => p.priceBandId)
    .filter((id): id is string => Boolean(id));
  
  const priceMap = await getMinimumPricesBatch(priceBandIds);

  // Add price field (minimum band price) to each product
  const productsWithPrice = products.map((product) => {
    const price = product.priceBandId ? priceMap.get(product.priceBandId) : null;
    return {
      ...product,
      price: price || 0,
    };
  });

  const totalPages = Math.ceil(total / limit);

  return {
    products: productsWithPrice,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

export const getProductBySlug = async (slug: string) => {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      categories: true,
      tags: true,
    },
  });

  if (!product) {
    return null;
  }

  // Add price field (minimum band price)
  const price = await getProductPrice(product);
  return {
    ...product,
    price: price || 0,
  };
};

