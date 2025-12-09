import { Router } from 'express';
import {
  getAllProducts,
  getProductBySlug,
} from './product.controller.js';

const router = Router();

// Product routes
router.get('/', getAllProducts);
router.get('/:slug', getProductBySlug);

export default router;

