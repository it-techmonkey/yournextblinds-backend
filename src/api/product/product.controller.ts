import { Request, Response, NextFunction } from 'express';
import * as productService from './product.services.js';

export const getAllProducts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract query parameters
    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    
    // Extract tags filter (can be comma-separated string or array)
    let tags: string[] | undefined;
    if (req.query.tags) {
      if (typeof req.query.tags === 'string') {
        tags = req.query.tags.split(',').map(tag => tag.trim()).filter(Boolean);
      } else if (Array.isArray(req.query.tags)) {
        tags = req.query.tags.map(tag => String(tag).trim()).filter(Boolean);
      }
    }

    // Validate pagination parameters
    if (page !== undefined && (isNaN(page) || page < 1)) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Page must be a positive integer',
        },
      });
      return;
    }

    if (limit !== undefined && (isNaN(limit) || limit < 1 || limit > 1000)) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Limit must be between 1 and 1000',
        },
      });
      return;
    }

    const result = await productService.getAllProducts({
      page,
      limit,
      tags,
    });

    res.status(200).json({
      success: true,
      data: result.products,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

export const getProductBySlug = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { slug } = req.params;
    const product = await productService.getProductBySlug(slug);
    
    if (!product) {
      res.status(404).json({
        success: false,
        error: {
          message: 'Product not found',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

