import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../../config/database.js';
import { shopifyConfig } from '../../config/shopify.js';

const router = Router();

// ============================================
// Webhook Signature Verification
// ============================================

/**
 * Verify Shopify webhook HMAC signature.
 * Shopify signs webhooks with the app's API secret key.
 *
 * NOTE: You must set SHOPIFY_WEBHOOK_SECRET in your .env file.
 * This is the "Webhook signing secret" shown when you create a webhook in Shopify Admin.
 */
function verifyWebhookSignature(rawBody: Buffer, hmacHeader: string): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('⚠️  SHOPIFY_WEBHOOK_SECRET not set — skipping webhook verification');
    return true; // Allow in development, but log warning
  }

  const generatedHash = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(generatedHash),
    Buffer.from(hmacHeader)
  );
}

// ============================================
// Webhook Handlers
// ============================================

/**
 * Handle Shopify orders/paid webhook.
 * Syncs the paid order to the local database.
 *
 * POST /api/webhooks/shopify/orders-paid
 */
router.post('/orders-paid', async (req: Request, res: Response) => {
  try {
    const hmac = req.headers['x-shopify-hmac-sha256'] as string;

    // In production, verify webhook signature
    if (process.env.NODE_ENV === 'production' && hmac) {
      // Express should be configured with raw body parser for this route
      // For now we'll skip raw body verification if body is already parsed
      // TODO: Add raw body middleware for webhook routes
    }

    const order = req.body;

    if (!order || !order.id) {
      console.error('❌ Webhook: Invalid order payload');
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    console.log(`📦 Webhook: Order paid #${order.order_number} (Shopify ID: ${order.id})`);

    // Extract line items and map back to our products
    const lineItems = order.line_items || [];
    const orderItemsData: any[] = [];

    for (const lineItem of lineItems) {
      // Extract configuration from line item properties
      const properties: Record<string, string> = {};
      if (lineItem.properties && Array.isArray(lineItem.properties)) {
        for (const prop of lineItem.properties) {
          if (prop.name && !prop.name.startsWith('_')) {
            properties[prop.name] = prop.value;
          }
        }
      }

      orderItemsData.push({
        configuration: properties,
        roomType: properties['Room Type'] || null,
        blindName: properties['Blind Name'] || null,
        quantity: lineItem.quantity || 1,
        price: parseFloat(lineItem.price) || 0,
        shopifyProductId: lineItem.product_id?.toString() || null,
        title: lineItem.title || null,
      });
    }

    // Create or update order in our database
    const orderNumber = `SHOP-${order.order_number || order.id}`;
    const existingOrder = await prisma.order.findUnique({
      where: { orderNumber },
    });

    if (existingOrder) {
      // Update existing order status
      await prisma.order.update({
        where: { orderNumber },
        data: {
          status: 'CONFIRMED',
          customerEmail: order.email || order.customer?.email || null,
          customerName: order.customer
            ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim()
            : null,
          shippingAddress: order.shipping_address || null,
          subtotal: parseFloat(order.subtotal_price) || 0,
          tax: parseFloat(order.total_tax) || 0,
          shipping: order.shipping_lines?.[0]
            ? parseFloat(order.shipping_lines[0].price) || 0
            : 0,
          total: parseFloat(order.total_price) || 0,
        },
      });

      console.log(`   ✅ Updated order: ${orderNumber}`);
    } else {
      // Create new order with items (store order data without product FK linkage)
      await prisma.order.create({
        data: {
          orderNumber,
          status: 'CONFIRMED',
          customerEmail: order.email || order.customer?.email || null,
          customerName: order.customer
            ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim()
            : null,
          shippingAddress: order.shipping_address || null,
          subtotal: parseFloat(order.subtotal_price) || 0,
          tax: parseFloat(order.total_tax) || 0,
          shipping: order.shipping_lines?.[0]
            ? parseFloat(order.shipping_lines[0].price) || 0
            : 0,
          total: parseFloat(order.total_price) || 0,
        },
      });

      console.log(`   ✅ Created order: ${orderNumber} with ${orderItemsData.length} line items (stored in Shopify)`);
    }

    // Respond 200 to acknowledge receipt (Shopify will retry if non-2xx)
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('❌ Webhook error:', error.message);
    // Still respond 200 to prevent Shopify retries on our errors
    // Log for manual investigation
    res.status(200).json({ success: true, warning: 'Processed with errors' });
  }
});

/**
 * Handle Shopify orders/cancelled webhook.
 * Updates order status in local database.
 *
 * POST /api/webhooks/shopify/orders-cancelled
 */
router.post('/orders-cancelled', async (req: Request, res: Response) => {
  try {
    const order = req.body;

    if (!order || !order.id) {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    console.log(`🚫 Webhook: Order cancelled #${order.order_number} (Shopify ID: ${order.id})`);

    const orderNumber = `SHOP-${order.order_number || order.id}`;
    const existingOrder = await prisma.order.findUnique({
      where: { orderNumber },
    });

    if (existingOrder) {
      await prisma.order.update({
        where: { orderNumber },
        data: { status: 'CANCELLED' },
      });
      console.log(`   ✅ Order ${orderNumber} marked as cancelled`);
    }

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('❌ Webhook error:', error.message);
    res.status(200).json({ success: true, warning: 'Processed with errors' });
  }
});

/**
 * Handle Shopify refunds/create webhook.
 * Updates order status in local database.
 *
 * POST /api/webhooks/shopify/refunds-create
 */
router.post('/refunds-create', async (req: Request, res: Response) => {
  try {
    const refund = req.body;

    if (!refund || !refund.order_id) {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    console.log(`💸 Webhook: Refund created for Shopify order ${refund.order_id}`);

    // Find order by looking up via Shopify — we'd need the order number
    // For now, log the refund for manual handling
    console.log(`   ℹ️  Refund amount: ${refund.transactions?.[0]?.amount || 'unknown'}`);

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('❌ Webhook error:', error.message);
    res.status(200).json({ success: true, warning: 'Processed with errors' });
  }
});

/**
 * Webhook health check / verification endpoint.
 * GET /api/webhooks/shopify/health
 */
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Shopify webhook endpoint is active',
    timestamp: new Date().toISOString(),
  });
});

export default router;
