import axios from 'axios';
import { shopifyConfig, validateShopifyConfig } from './shopify.js';

// ============================================
// Shopify Product Cache
// ============================================
// Fetches all Shopify products with their `custom.price_band_name` metafield
// using the Admin GraphQL API (bulk fetch, no N+1 calls).
// Caches the mapping: handle → { priceBandName, title }
// Auto-refreshes every 10 minutes.

export interface CachedProduct {
  priceBandName: string | null;
  title: string;
}

let productCache: Map<string, CachedProduct> = new Map();
let lastRefreshTime = 0;
let isRefreshing = false;

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * GraphQL query to fetch products with their price_band_name metafield.
 * Fetches 100 products per page with cursor-based pagination.
 */
const PRODUCTS_WITH_METAFIELD_QUERY = `
  query ProductsWithMetafield($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          handle
          title
          priceBandName: metafield(namespace: "custom", key: "price_band_name") {
            value
          }
        }
      }
    }
  }
`;

/**
 * Get the Shopify Admin GraphQL API URL.
 */
function getGraphQLUrl(): string {
  const domain = shopifyConfig.storeDomain.replace(/^https?:\/\//, '');
  return `https://${domain}/admin/api/${shopifyConfig.apiVersion}/graphql.json`;
}

/**
 * Fetch all products from Shopify Admin GraphQL API with their metafields.
 * Uses cursor-based pagination. Each page returns products + metafield inline.
 */
async function fetchAllShopifyProducts(): Promise<Map<string, CachedProduct>> {
  validateShopifyConfig();

  const cache = new Map<string, CachedProduct>();
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response: { data: any } = await axios.post(
      getGraphQLUrl(),
      {
        query: PRODUCTS_WITH_METAFIELD_QUERY,
        variables: { cursor },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': shopifyConfig.adminAccessToken,
        },
        timeout: 30000,
      }
    );

    const data: any = response.data?.data?.products;
    if (!data) {
      console.error('[Cache] Unexpected GraphQL response:', JSON.stringify(response.data?.errors || response.data));
      break;
    }

    for (const edge of data.edges) {
      const node = edge.node;
      cache.set(node.handle, {
        priceBandName: node.priceBandName?.value ?? null,
        title: node.title,
      });
    }

    hasNextPage = data.pageInfo.hasNextPage;
    cursor = data.pageInfo.endCursor;
  }

  return cache;
}

/**
 * Refresh the cache from Shopify Admin API.
 * Only one refresh runs at a time.
 */
async function refreshCache(): Promise<void> {
  if (isRefreshing) return;

  isRefreshing = true;
  try {
    console.log('[Cache] Refreshing Shopify product cache...');
    const newCache = await fetchAllShopifyProducts();
    productCache = newCache;
    lastRefreshTime = Date.now();
    console.log(`[Cache] Loaded ${newCache.size} products from Shopify`);
  } catch (error) {
    console.error('[Cache] Failed to refresh product cache:', (error as Error).message);
    // Keep using stale cache if refresh fails
  } finally {
    isRefreshing = false;
  }
}

/**
 * Ensure the cache is fresh, refreshing if needed.
 */
async function ensureFresh(): Promise<void> {
  if (Date.now() - lastRefreshTime > CACHE_TTL_MS || productCache.size === 0) {
    await refreshCache();
  }
}

// ============================================
// Public API
// ============================================

/**
 * Initialize the cache on server startup.
 * Call this once during boot.
 */
export async function initializeProductCache(): Promise<void> {
  await refreshCache();

  // Set up periodic refresh
  setInterval(() => {
    refreshCache().catch((err) =>
      console.error('[Cache] Periodic refresh failed:', err.message)
    );
  }, CACHE_TTL_MS);
}

/**
 * Get the price band name for a product by its Shopify handle.
 * Returns null if the product is not found or has no price band.
 */
export async function getPriceBandNameByHandle(handle: string): Promise<string | null> {
  await ensureFresh();
  const entry = productCache.get(handle);
  return entry?.priceBandName ?? null;
}

/**
 * Get the cached product data for a handle.
 * Returns null if not found.
 */
export async function getCachedProduct(handle: string): Promise<CachedProduct | null> {
  await ensureFresh();
  return productCache.get(handle) ?? null;
}

/**
 * Get all cached products as a map: handle → CachedProduct.
 */
export async function getAllCachedProducts(): Promise<Map<string, CachedProduct>> {
  await ensureFresh();
  return productCache;
}

/**
 * Force a cache refresh (e.g., after a product is updated in Shopify).
 */
export async function forceRefreshCache(): Promise<void> {
  lastRefreshTime = 0; // Force staleness
  await refreshCache();
}
