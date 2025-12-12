import { prisma } from '../../config/database.js';

export const getAllCategories = async () => {
  const categories = await prisma.category.findMany({
    include: {
      _count: {
        select: {
          products: true,
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });

  return categories.map((category) => ({
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
    productCount: category._count.products,
  }));
};

