import { Router } from 'express';
import productRoutes from '../product/product.routes.js';
import categoryRoutes from '../category/category.routes.js';
import pricingRoutes from '../pricing/pricing.routes.js';

const router = Router();

//Health check route
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

//Product route
router.use('/products', productRoutes);

//Category route
router.use('/categories', categoryRoutes);

//Pricing route
router.use('/pricing', pricingRoutes);


// Placeholder routes - to be expanded
// router.use('/users', userRoutes);
// router.use('/orders', orderRoutes);
// router.use('/cart', cartRoutes);

export default router;

