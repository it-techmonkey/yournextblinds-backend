import { prisma } from '../../config/database.js';
import { getMinimumPrice } from '../pricing/pricing.services.js';

interface GetAllProductsParams {
  page?: number;
  limit?: number;
  tags?: string[];
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

  // Build where clause for tag filtering
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

  // Add price field (minimum band price) to each product
  const productsWithPrice = await Promise.all(
    products.map(async (product) => {
      const price = await getProductPrice(product);
      return {
        ...product,
        price: price || 0,
      };
    })
  );

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

