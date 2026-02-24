-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED');

-- CreateTable
CREATE TABLE "public"."CartItem" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "roomType" TEXT,
    "blindName" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CustomizationOption" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomizationOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CustomizationPricing" (
    "id" TEXT NOT NULL,
    "customizationOptionId" TEXT NOT NULL,
    "widthBandId" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "isPerUnit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomizationPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."HeightBand" (
    "id" TEXT NOT NULL,
    "heightMm" INTEGER NOT NULL,
    "heightInches" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeightBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "public"."OrderStatus" NOT NULL DEFAULT 'PENDING',
    "customerEmail" TEXT,
    "customerName" TEXT,
    "shippingAddress" JSONB,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "tax" DECIMAL(10,2),
    "shipping" DECIMAL(10,2),
    "total" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "roomType" TEXT,
    "blindName" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PriceBand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PriceCell" (
    "id" TEXT NOT NULL,
    "priceBandId" TEXT NOT NULL,
    "widthBandId" TEXT NOT NULL,
    "heightBandId" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceCell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "images" TEXT[],
    "title" TEXT NOT NULL,
    "priceBandId" TEXT,
    "videos" TEXT[],
    "shopifyProductId" TEXT,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WidthBand" (
    "id" TEXT NOT NULL,
    "widthMm" INTEGER NOT NULL,
    "widthInches" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WidthBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_CategoryToProduct" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CategoryToProduct_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "public"."_ProductToTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProductToTags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "CartItem_createdAt_idx" ON "public"."CartItem"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "CartItem_productId_idx" ON "public"."CartItem"("productId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "public"."Category"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CustomizationOption_category_optionId_key" ON "public"."CustomizationOption"("category" ASC, "optionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CustomizationPricing_customizationOptionId_widthBandId_key" ON "public"."CustomizationPricing"("customizationOptionId" ASC, "widthBandId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "HeightBand_heightMm_key" ON "public"."HeightBand"("heightMm" ASC);

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "public"."Order"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "Order_orderNumber_idx" ON "public"."Order"("orderNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "public"."Order"("orderNumber" ASC);

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "public"."Order"("status" ASC);

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "public"."OrderItem"("orderId" ASC);

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "public"."OrderItem"("productId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PriceBand_name_key" ON "public"."PriceBand"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PriceCell_priceBandId_widthBandId_heightBandId_key" ON "public"."PriceCell"("priceBandId" ASC, "widthBandId" ASC, "heightBandId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Product_shopifyProductId_key" ON "public"."Product"("shopifyProductId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "public"."Product"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Tags_name_key" ON "public"."Tags"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Tags_slug_key" ON "public"."Tags"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WidthBand_widthMm_key" ON "public"."WidthBand"("widthMm" ASC);

-- CreateIndex
CREATE INDEX "_CategoryToProduct_B_index" ON "public"."_CategoryToProduct"("B" ASC);

-- CreateIndex
CREATE INDEX "_ProductToTags_B_index" ON "public"."_ProductToTags"("B" ASC);

-- AddForeignKey
ALTER TABLE "public"."CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomizationPricing" ADD CONSTRAINT "CustomizationPricing_customizationOptionId_fkey" FOREIGN KEY ("customizationOptionId") REFERENCES "public"."CustomizationOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomizationPricing" ADD CONSTRAINT "CustomizationPricing_widthBandId_fkey" FOREIGN KEY ("widthBandId") REFERENCES "public"."WidthBand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PriceCell" ADD CONSTRAINT "PriceCell_heightBandId_fkey" FOREIGN KEY ("heightBandId") REFERENCES "public"."HeightBand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PriceCell" ADD CONSTRAINT "PriceCell_priceBandId_fkey" FOREIGN KEY ("priceBandId") REFERENCES "public"."PriceBand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PriceCell" ADD CONSTRAINT "PriceCell_widthBandId_fkey" FOREIGN KEY ("widthBandId") REFERENCES "public"."WidthBand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_priceBandId_fkey" FOREIGN KEY ("priceBandId") REFERENCES "public"."PriceBand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_CategoryToProduct" ADD CONSTRAINT "_CategoryToProduct_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_CategoryToProduct" ADD CONSTRAINT "_CategoryToProduct_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_ProductToTags" ADD CONSTRAINT "_ProductToTags_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_ProductToTags" ADD CONSTRAINT "_ProductToTags_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."Tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

