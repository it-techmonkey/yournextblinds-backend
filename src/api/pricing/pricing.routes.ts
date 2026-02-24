import { Router } from 'express';
import * as pricingController from './pricing.controller.js';

const router = Router();

// Calculate price for a product configuration
router.post('/calculate', pricingController.calculatePrice);

// Validate cart item price
router.post('/validate', pricingController.validatePrice);

// Get price matrix for a product (by Shopify handle)
router.get('/matrix/:handle', pricingController.getPriceMatrix);

// Get all customization options with pricing
router.get('/customizations', pricingController.getCustomizations);

// Get all size bands
router.get('/bands', pricingController.getSizeBands);

// Get minimum prices for all products (handle → min price)
router.get('/minimum-prices', pricingController.getMinimumPrices);

export default router;
