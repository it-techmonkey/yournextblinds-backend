import dotenv from 'dotenv';

dotenv.config();

// ============================================
// Shopify Configuration
// ============================================

export const shopifyConfig = {
  storeDomain: process.env.SHOPIFY_STORE_DOMAIN || '',
  adminAccessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '',
  storefrontAccessToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || '',
  apiVersion: '2025-01', // Shopify API version
};

/**
 * Validate that required Shopify environment variables are set.
 * Call this before any Shopify API operations.
 */
export function validateShopifyConfig(): void {
  if (!shopifyConfig.storeDomain) {
    throw new Error(
      'SHOPIFY_STORE_DOMAIN is required (e.g., "yournextblinds.myshopify.com")'
    );
  }
  if (!shopifyConfig.adminAccessToken) {
    throw new Error(
      'SHOPIFY_ADMIN_ACCESS_TOKEN is required. Generate one in Shopify Admin → Settings → Apps → Develop apps.'
    );
  }
}

/**
 * Get the Shopify Admin REST API base URL.
 */
export function getAdminApiUrl(endpoint: string): string {
  const domain = shopifyConfig.storeDomain.replace(/^https?:\/\//, '');
  return `https://${domain}/admin/api/${shopifyConfig.apiVersion}${endpoint}`;
}

/**
 * Get default headers for Shopify Admin API requests.
 */
export function getAdminHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': shopifyConfig.adminAccessToken,
  };
}
