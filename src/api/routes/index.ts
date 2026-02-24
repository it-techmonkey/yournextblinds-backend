import { Router } from 'express';
import pricingRoutes from '../pricing/pricing.routes.js';
import orderRoutes from '../order/order.routes.js';
import webhookRoutes from '../order/webhook.routes.js';

const router = Router();

//Health check route
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

//Pricing route
router.use('/pricing', pricingRoutes);

//Order route (Draft Order checkout)
router.use('/orders', orderRoutes);

//Shopify webhook routes
router.use('/webhooks/shopify', webhookRoutes);

export default router;

