import { Request, Response, NextFunction } from 'express';
import * as pricingService from './pricing.services.js';

/**
 * Calculate price for a product configuration
 * POST /api/pricing/calculate
 */
export const calculatePrice = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { productId, widthInches, heightInches, customizations } = req.body;

    // Validate required fields
    if (!productId) {
      res.status(400).json({
        success: false,
        error: { message: 'productId is required' },
      });
      return;
    }

    if (typeof widthInches !== 'number' || widthInches <= 0) {
      res.status(400).json({
        success: false,
        error: { message: 'widthInches must be a positive number' },
      });
      return;
    }

    if (typeof heightInches !== 'number' || heightInches <= 0) {
      res.status(400).json({
        success: false,
        error: { message: 'heightInches must be a positive number' },
      });
      return;
    }

    const pricing = await pricingService.calculateProductPrice({
      productId,
      widthInches,
      heightInches,
      customizations,
    });

    res.status(200).json({
      success: true,
      data: pricing,
    });
  } catch (error: any) {
    if (error.message === 'Product not found') {
      res.status(404).json({
        success: false,
        error: { message: error.message },
      });
      return;
    }
    next(error);
  }
};

/**
 * Validate cart item price
 * POST /api/pricing/validate
 */
export const validatePrice = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { productId, widthInches, heightInches, customizations, submittedPrice } = req.body;

    // Validate required fields
    if (!productId || typeof widthInches !== 'number' || typeof heightInches !== 'number' || typeof submittedPrice !== 'number') {
      res.status(400).json({
        success: false,
        error: { message: 'productId, widthInches, heightInches, and submittedPrice are required' },
      });
      return;
    }

    const validation = await pricingService.validateCartPrice(
      { productId, widthInches, heightInches, customizations },
      submittedPrice
    );

    res.status(200).json({
      success: true,
      data: validation,
    });
  } catch (error: any) {
    if (error.message === 'Product not found') {
      res.status(404).json({
        success: false,
        error: { message: error.message },
      });
      return;
    }
    next(error);
  }
};

/**
 * Get price band matrix for a product
 * GET /api/pricing/matrix/:productId
 */
export const getPriceMatrix = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { productId } = req.params;

    // Get product to find its price band
    const product = await pricingService.getPriceBandByName('Band A'); // Default to Band A for now
    
    if (!product) {
      res.status(404).json({
        success: false,
        error: { message: 'Price band not found' },
      });
      return;
    }

    const matrix = await pricingService.getPriceBandMatrix(product.id);

    res.status(200).json({
      success: true,
      data: matrix,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all customization options with pricing
 * GET /api/pricing/customizations
 */
export const getCustomizations = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const customizations = await pricingService.getCustomizationPricing();

    res.status(200).json({
      success: true,
      data: customizations,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all size bands (width and height)
 * GET /api/pricing/bands
 */
export const getSizeBands = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const [widthBands, heightBands] = await Promise.all([
      pricingService.getWidthBands(),
      pricingService.getHeightBands(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        widthBands: widthBands.map(wb => ({
          id: wb.id,
          mm: wb.widthMm,
          inches: wb.widthInches,
        })),
        heightBands: heightBands.map(hb => ({
          id: hb.id,
          mm: hb.heightMm,
          inches: hb.heightInches,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};
