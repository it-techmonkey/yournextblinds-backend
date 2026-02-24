import { Router } from 'express';
import * as orderController from './order.controller.js';

const router = Router();

// Create a checkout session (Shopify Draft Order)
router.post('/create-checkout', orderController.createCheckout);

// Get draft order status
router.get('/status/:draftOrderId', orderController.getDraftOrderStatus);

export default router;
