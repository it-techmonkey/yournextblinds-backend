-- Remove oldPrice and basePrice columns from Product table
-- Prices are now determined by price bands (minimum is 20x20 inches)

ALTER TABLE "Product" DROP COLUMN IF EXISTS "oldPrice";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "basePrice";
