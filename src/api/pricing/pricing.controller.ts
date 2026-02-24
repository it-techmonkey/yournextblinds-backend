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
    const { handle, widthInches, heightInches, customizations } = req.body;

    // Validate required fields
    if (!handle) {
      res.status(400).json({
        success: false,
        error: { message: 'handle is required' },
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
      handle,
      widthInches,
      heightInches,
      customizations,
    });

    res.status(200).json({
      success: true,
      data: pricing,
    });
  } catch (error: any) {
    if (error.message?.includes('not found') || error.message?.includes('no price band')) {
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
    const { handle, widthInches, heightInches, customizations, submittedPrice } = req.body;

    // Validate required fields
    if (!handle || typeof widthInches !== 'number' || typeof heightInches !== 'number' || typeof submittedPrice !== 'number') {
      res.status(400).json({
        success: false,
        error: { message: 'handle, widthInches, heightInches, and submittedPrice are required' },
      });
      return;
    }

    const validation = await pricingService.validateCartPrice(
      { handle, widthInches, heightInches, customizations },
      submittedPrice
    );

    res.status(200).json({
      success: true,
      data: validation,
    });
  } catch (error: any) {
    if (error.message?.includes('not found') || error.message?.includes('no price band')) {
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
 * GET /api/pricing/matrix/:handle
 */
export const getPriceMatrix = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { handle } = req.params;

    if (!handle) {
      res.status(400).json({
        success: false,
        error: { message: 'handle is required' },
      });
      return;
    }

    // Resolve handle → PriceBand via Shopify cache
    const priceBand = await pricingService.resolveHandleToPriceBand(handle);

    if (!priceBand) {
      res.status(404).json({
        success: false,
        error: { message: `Product "${handle}" not found or has no price band` },
      });
      return;
    }

    const matrix = await pricingService.getPriceBandMatrix(priceBand.id);

    if (!matrix) {
      res.status(404).json({
        success: false,
        error: { message: 'Price matrix not found for this product' },
      });
      return;
    }

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

/**
 * Get minimum prices for all products (by handle)
 * GET /api/pricing/minimum-prices
 */
export const getMinimumPrices = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const prices = await pricingService.getMinimumPricesByHandle();

    res.status(200).json({
      success: true,
      data: prices,
    });
  } catch (error) {
    next(error);
  }
};
