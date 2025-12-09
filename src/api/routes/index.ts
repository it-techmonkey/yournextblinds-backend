import { Router } from 'express';
import productRoutes from '../product/product.routes.js';

const router = Router();

// Health check route
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

// Product routes
router.use('/products', productRoutes);

// Placeholder routes - to be expanded
// router.use('/users', userRoutes);
// router.use('/orders', orderRoutes);
// router.use('/cart', cartRoutes);

export default router;

