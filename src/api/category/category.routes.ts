import { Router } from 'express';
import { getAllCategories } from './category.controller.js';

const router = Router();

router.get('/', getAllCategories);

export default router;

