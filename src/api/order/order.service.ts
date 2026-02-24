import { calculateProductPrice, PricingRequest } from '../pricing/pricing.services.js';
import { getAdminApiUrl, getAdminHeaders, validateShopifyConfig } from '../../config/shopify.js';
import { getCachedProduct } from '../../config/shopifyProductCache.js';
import axios from 'axios';

// ============================================
// Types
// ============================================

export interface CheckoutItemRequest {
  handle: string;
  widthInches: number;
  heightInches: number;
  quantity: number;
  submittedPrice: number;
  configuration: {
    roomType?: string;
    blindName?: string;
    // Customization selections
    headrail?: string;
    headrailColour?: string;
    installationMethod?: string;
    controlOption?: string;
    stacking?: string;
    controlSide?: string;
    bottomChain?: string;
    bracketType?: string;
    chainColor?: string;
    wrappedCassette?: string;
    cassetteMatchingBar?: string;
    motorization?: string;
    blindColor?: string;
    frameColor?: string;
    openingDirection?: string;
    bottomBar?: string;
    rollStyle?: string;
    [key: string]: string | undefined;
  };
}

export interface CreateCheckoutRequest {
  items: CheckoutItemRequest[];
  customerEmail?: string;
  note?: string;
}

export interface CreateCheckoutResponse {
  checkoutUrl: string;
  draftOrderId: string;
  lineItems: {
    handle: string;
    title: string;
    calculatedPrice: number;
    quantity: number;
  }[];
  subtotal: number;
}

interface ShopifyDraftOrderLineItem {
  title: string;
  price: string;
  quantity: number;
  requires_shipping: boolean;
  taxable: boolean;
  properties: { name: string; value: string }[];
}

// ============================================
// Helper Functions
// ============================================

/**
 * Convert configuration to customization pairs for price calculation.
 * Maps frontend option IDs to backend category names.
 */
function configToCustomizations(config: CheckoutItemRequest['configuration']): PricingRequest['customizations'] {
  const customizations: { category: string; optionId: string }[] = [];

  const mappings: Record<string, string> = {
    headrail: 'headrail',
    headrailColour: 'headrail-colour',
    installationMethod: 'installation-method',
    controlOption: 'control-option',
    stacking: 'stacking',
    controlSide: 'control-side',
    bottomChain: 'bottom-chain',
    bracketType: 'bracket-type',
    chainColor: 'chain-color',
    wrappedCassette: 'wrapped-cassette',
    cassetteMatchingBar: 'cassette-bar',
    motorization: 'motorization',
    blindColor: 'blind-color',
    frameColor: 'frame-color',
    openingDirection: 'opening-direction',
    bottomBar: 'bottom-bar',
    rollStyle: 'roll-style',
  };

  for (const [configKey, category] of Object.entries(mappings)) {
    const value = config[configKey];
    if (value && value !== 'none') {
      customizations.push({ category, optionId: value });
    }
  }

  return customizations;
}

/**
 * Build human-readable line item properties for Shopify order display.
 * These show up in the Shopify Admin order detail and on receipts.
 */
function buildLineItemProperties(
  item: CheckoutItemRequest,
  calculatedPrice: number
): { name: string; value: string }[] {
  const properties: { name: string; value: string }[] = [];

  // Dimensions
  properties.push({ name: 'Width', value: `${item.widthInches} inches` });
  properties.push({ name: 'Height', value: `${item.heightInches} inches` });

  // Room and name
  if (item.configuration.roomType) {
    properties.push({ name: 'Room Type', value: item.configuration.roomType });
  }
  if (item.configuration.blindName) {
    properties.push({ name: 'Blind Name', value: item.configuration.blindName });
  }

  // Customization options (human-readable)
  const labelMap: Record<string, string> = {
    headrail: 'Headrail',
    headrailColour: 'Headrail Colour',
    installationMethod: 'Installation',
    controlOption: 'Control Option',
    stacking: 'Stacking',
    controlSide: 'Control Side',
    bottomChain: 'Bottom Chain',
    bracketType: 'Bracket Type',
    chainColor: 'Chain Color',
    wrappedCassette: 'Wrapped Cassette',
    cassetteMatchingBar: 'Cassette Bar',
    motorization: 'Motorization',
    blindColor: 'Blind Color',
    frameColor: 'Frame Color',
    openingDirection: 'Opening Direction',
    bottomBar: 'Bottom Bar',
    rollStyle: 'Roll Style',
  };

  for (const [key, label] of Object.entries(labelMap)) {
    const value = item.configuration[key];
    if (value && value !== 'none') {
      properties.push({ name: label, value });
    }
  }

  // Internal reference: the server-calculated price
  properties.push({ name: '_calculatedPrice', value: calculatedPrice.toFixed(2) });

  return properties;
}

// ============================================
// Price Tolerance
// ============================================

/** Maximum allowed difference (in £) between client-submitted price and server-calculated price */
const PRICE_TOLERANCE = 0.50;

// ============================================
// Service Functions
// ============================================

/**
 * Create a Shopify Draft Order from cart items.
 *
 * Flow:
 * 1. For each cart item, re-calculate the price server-side
 * 2. Validate that the submitted price matches (within tolerance)
 * 3. Build Shopify draft order line items
 * 4. Create draft order via Shopify Admin API
 * 5. Return the invoice URL for redirect
 */
export async function createCheckout(request: CreateCheckoutRequest): Promise<CreateCheckoutResponse> {
  validateShopifyConfig();

  if (!request.items || request.items.length === 0) {
    throw new CheckoutError('Cart is empty', 400);
  }

  const lineItems: ShopifyDraftOrderLineItem[] = [];
  const responseLineItems: CreateCheckoutResponse['lineItems'] = [];
  let subtotal = 0;

  // Process each cart item
  for (const item of request.items) {
    // Validate required fields
    if (!item.handle) {
      throw new CheckoutError('Each item must have a handle', 400);
    }
    if (typeof item.widthInches !== 'number' || item.widthInches <= 0) {
      throw new CheckoutError('Each item must have a positive widthInches', 400);
    }
    if (typeof item.heightInches !== 'number' || item.heightInches <= 0) {
      throw new CheckoutError('Each item must have a positive heightInches', 400);
    }
    if (typeof item.quantity !== 'number' || item.quantity < 1) {
      throw new CheckoutError('Each item must have a quantity >= 1', 400);
    }

    // Get product title from Shopify cache
    const cachedProduct = await getCachedProduct(item.handle);
    if (!cachedProduct) {
      throw new CheckoutError(`Product not found: ${item.handle}`, 404);
    }

    const productTitle = cachedProduct.title;

    // Convert configuration to customization pairs
    const customizations = configToCustomizations(item.configuration);

    // Calculate price server-side
    const pricing = await calculateProductPrice({
      handle: item.handle,
      widthInches: item.widthInches,
      heightInches: item.heightInches,
      customizations,
    });

    // Validate submitted price against calculated price
    const priceDifference = Math.abs(pricing.totalPrice - item.submittedPrice);
    if (priceDifference > PRICE_TOLERANCE) {
      throw new CheckoutError(
        `Price mismatch for "${productTitle}": submitted £${item.submittedPrice.toFixed(2)}, ` +
        `calculated £${pricing.totalPrice.toFixed(2)} (diff: £${priceDifference.toFixed(2)})`,
        422
      );
    }

    // Use the server-calculated price (authoritative)
    const itemPrice = pricing.totalPrice;

    // Build the line item title with dimensions
    const lineItemTitle = `${productTitle} – ${item.widthInches}" × ${item.heightInches}"`;

    // Build Shopify line item
    lineItems.push({
      title: lineItemTitle,
      price: itemPrice.toFixed(2),
      quantity: item.quantity,
      requires_shipping: true,
      taxable: true,
      properties: buildLineItemProperties(item, itemPrice),
    });

    responseLineItems.push({
      handle: item.handle,
      title: lineItemTitle,
      calculatedPrice: itemPrice,
      quantity: item.quantity,
    });

    subtotal += itemPrice * item.quantity;
  }

  // Create Draft Order in Shopify
  const draftOrderPayload: any = {
    draft_order: {
      line_items: lineItems,
      use_customer_default_address: true,
    },
  };

  // Add customer email if provided
  if (request.customerEmail) {
    draftOrderPayload.draft_order.email = request.customerEmail;
  }

  // Add note if provided
  if (request.note) {
    draftOrderPayload.draft_order.note = request.note;
  }

  try {
    const url = getAdminApiUrl('/draft_orders.json');
    const response = await axios.post(url, draftOrderPayload, {
      headers: getAdminHeaders(),
      timeout: 15000,
    });

    const draftOrder = response.data.draft_order;

    if (!draftOrder || !draftOrder.invoice_url) {
      throw new CheckoutError('Failed to create Shopify draft order: no invoice URL returned', 500);
    }

    return {
      checkoutUrl: draftOrder.invoice_url,
      draftOrderId: draftOrder.id.toString(),
      lineItems: responseLineItems,
      subtotal,
    };
  } catch (error: any) {
    // Re-throw CheckoutErrors as-is
    if (error instanceof CheckoutError) {
      throw error;
    }

    // Handle Shopify API errors
    const status = error.response?.status;
    const shopifyErrors = error.response?.data?.errors;

    if (status === 401) {
      throw new CheckoutError('Shopify authentication failed. Check SHOPIFY_ADMIN_ACCESS_TOKEN.', 500);
    }
    if (status === 422) {
      throw new CheckoutError(
        `Shopify rejected the draft order: ${JSON.stringify(shopifyErrors)}`,
        422
      );
    }
    if (status === 429) {
      throw new CheckoutError('Shopify rate limit exceeded. Please try again in a moment.', 429);
    }

    throw new CheckoutError(
      `Failed to create checkout: ${error.message}`,
      500
    );
  }
}

/**
 * Get the status of a draft order.
 */
export async function getDraftOrderStatus(draftOrderId: string): Promise<{
  id: string;
  status: string;
  invoiceUrl: string;
  totalPrice: string;
  createdAt: string;
}> {
  validateShopifyConfig();

  try {
    const url = getAdminApiUrl(`/draft_orders/${draftOrderId}.json`);
    const response = await axios.get(url, {
      headers: getAdminHeaders(),
      timeout: 10000,
    });

    const draftOrder = response.data.draft_order;

    return {
      id: draftOrder.id.toString(),
      status: draftOrder.status,
      invoiceUrl: draftOrder.invoice_url,
      totalPrice: draftOrder.total_price,
      createdAt: draftOrder.created_at,
    };
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new CheckoutError('Draft order not found', 404);
    }
    throw new CheckoutError(`Failed to get draft order status: ${error.message}`, 500);
  }
}

// ============================================
// Custom Error Class
// ============================================

export class CheckoutError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'CheckoutError';
    this.statusCode = statusCode;
  }
}
