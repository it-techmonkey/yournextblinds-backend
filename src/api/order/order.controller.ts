import { Request, Response, NextFunction } from 'express';
import * as orderService from './order.service.js';
import { CheckoutError } from './order.service.js';

/**
 * Create a checkout session via Shopify Draft Order
 * POST /api/orders/create-checkout
 */
export const createCheckout = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { items, customerEmail, note } = req.body;

    // Basic validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        success: false,
        error: { message: 'items array is required and must not be empty' },
      });
      return;
    }

    const result = await orderService.createCheckout({
      items,
      customerEmail,
      note,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error instanceof CheckoutError) {
      res.status(error.statusCode).json({
        success: false,
        error: { message: error.message },
      });
      return;
    }

    // Known pricing errors
    if (
      error.message?.includes('not found') ||
      error.message?.includes('no price band')
    ) {
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
 * Get draft order status
 * GET /api/orders/status/:draftOrderId
 */
export const getDraftOrderStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { draftOrderId } = req.params;

    if (!draftOrderId) {
      res.status(400).json({
        success: false,
        error: { message: 'draftOrderId is required' },
      });
      return;
    }

    const result = await orderService.getDraftOrderStatus(draftOrderId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error instanceof CheckoutError) {
      res.status(error.statusCode).json({
        success: false,
        error: { message: error.message },
      });
      return;
    }
    next(error);
  }
};
