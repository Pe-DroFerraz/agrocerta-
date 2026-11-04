-- Fundação AGRO CERTA: PostgreSQL 16, relações, índices e invariantes locais.

CREATE TYPE "RoleKey" AS ENUM ('OWNER', 'PRODUCTION', 'SALES', 'DRIVER');

CREATE TYPE "BatchStatus" AS ENUM ('IN_PRODUCTION', 'MATURING', 'RELEASED', 'BLOCKED', 'EXPIRED', 'EXHAUSTED');

CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'CONFIRMED', 'PICKING', 'READY', 'IN_ROUTE', 'DELIVERED', 'CANCELLED');

CREATE TYPE "MovementType" AS ENUM ('PRODUCTION', 'SALE', 'LOSS', 'ADJUSTMENT', 'PURCHASE');

CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" "RoleKey" NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "expiryAlertDays" INTEGER NOT NULL DEFAULT 7,
    "qualityParameters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefreshSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Producer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "farm" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "pricePerLiter" DECIMAL(12,4) NOT NULL,
    "qualityBonus" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Producer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MilkReceipt" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "producerId" TEXT NOT NULL,
    "liters" DECIMAL(14,3) NOT NULL,
    "temperature" DECIMAL(6,2) NOT NULL,
    "acidity" DECIMAL(6,2) NOT NULL,
    "fat" DECIMAL(6,2) NOT NULL,
    "protein" DECIMAL(6,2) NOT NULL,
    "scc" INTEGER NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "pricePerLiter" DECIMAL(12,4) NOT NULL,
    "responsibleId" TEXT NOT NULL,
    CONSTRAINT "MilkReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
    "kgPerUnit" DECIMAL(8,4) NOT NULL DEFAULT 1,
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "salePrice" DECIMAL(12,2) NOT NULL,
    "shelfLifeDays" INTEGER NOT NULL,
    "minimumStock" DECIMAL(12,3) NOT NULL,
    "expectedLitersPerUnit" DECIMAL(10,3) NOT NULL,
    "photoUrl" TEXT,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Supply" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL(12,4) NOT NULL,
    "stock" DECIMAL(14,3) NOT NULL,
    "minimumStock" DECIMAL(12,3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Supply_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplyPurchase" (
    "id" TEXT NOT NULL,
    "supplyId" TEXT NOT NULL,
    "lotCode" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(12,4) NOT NULL,
    "supplier" TEXT NOT NULL,
    CONSTRAINT "SupplyPurchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecipeItem" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplyId" TEXT NOT NULL,
    "quantityPerUnit" DECIMAL(12,5) NOT NULL,
    CONSTRAINT "RecipeItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "litersUsed" DECIMAL(14,3) NOT NULL,
    "quantityProduced" DECIMAL(14,3) NOT NULL,
    "lossQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "milkCost" DECIMAL(14,2) NOT NULL,
    "supplyCost" DECIMAL(14,2) NOT NULL,
    "overheadCost" DECIMAL(14,2) NOT NULL,
    "lossCost" DECIMAL(14,2) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "responsibleId" TEXT NOT NULL,
    "notes" TEXT,
    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionMilkSource" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "liters" DECIMAL(14,3) NOT NULL,
    CONSTRAINT "ProductionMilkSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionSupplyUse" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "supplyId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "quantity" DECIMAL(12,5) NOT NULL,
    "unitCost" DECIMAL(12,4) NOT NULL,
    CONSTRAINT "ProductionSupplyUse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "manufacturedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "BatchStatus" NOT NULL,
    "initialQuantity" DECIMAL(14,3) NOT NULL,
    "availableQuantity" DECIMAL(14,3) NOT NULL,
    "reservedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(12,4) NOT NULL,
    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "batchId" TEXT,
    "supplyId" TEXT,
    "type" "MovementType" NOT NULL,
    "quantity" DECIMAL(14,5) NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "neighborhood" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 14,
    "creditLimit" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "routeId" TEXT,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerPrice" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "CustomerPrice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "recurringOrderId" TEXT,
    "occurrenceKey" TEXT,
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderStatusEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorName" TEXT NOT NULL,
    CONSTRAINT "OrderStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecurringOrder" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "weekdays" INTEGER[],
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethod" TEXT NOT NULL,
    CONSTRAINT "RecurringOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecurringException" (
    "id" TEXT NOT NULL,
    "recurringOrderId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "skip" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    CONSTRAINT "RecurringException_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecurringOrderItem" (
    "id" TEXT NOT NULL,
    "recurringOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    CONSTRAINT "RecurringOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacityKg" DECIMAL(12,3) NOT NULL,
    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "stopNumber" INTEGER NOT NULL,
    "proofUrl" TEXT,
    "signature" TEXT,
    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryEvent" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    CONSTRAINT "DeliveryEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Receivable" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReceivablePayment" (
    "id" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    CONSTRAINT "ReceivablePayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payable" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FixedCost" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    CONSTRAINT "FixedCost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LossRecord" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "cost" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LossRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "segment" TEXT NOT NULL DEFAULT 'INTERNAL',
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnnouncementSend" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "message" TEXT NOT NULL,
    CONSTRAINT "AnnouncementSend_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

CREATE UNIQUE INDEX "Company_document_key" ON "Company"("document");

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");

CREATE INDEX "RefreshSession_userId_idx" ON "RefreshSession"("userId");

CREATE INDEX "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");

ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Producer_document_key" ON "Producer"("document");

CREATE INDEX "MilkReceipt_producerId_date_idx" ON "MilkReceipt"("producerId", "date");

CREATE INDEX "MilkReceipt_date_approved_idx" ON "MilkReceipt"("date", "approved");

ALTER TABLE "MilkReceipt" ADD CONSTRAINT "MilkReceipt_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MilkReceipt" ADD CONSTRAINT "MilkReceipt_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

CREATE INDEX "SupplyPurchase_supplyId_date_idx" ON "SupplyPurchase"("supplyId", "date");

ALTER TABLE "SupplyPurchase" ADD CONSTRAINT "SupplyPurchase_supplyId_fkey" FOREIGN KEY ("supplyId") REFERENCES "Supply"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "RecipeItem_productId_supplyId_key" ON "RecipeItem"("productId", "supplyId");

ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_supplyId_fkey" FOREIGN KEY ("supplyId") REFERENCES "Supply"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ProductionOrder_date_idx" ON "ProductionOrder"("date");

ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ProductionMilkSource_productionId_receiptId_key" ON "ProductionMilkSource"("productionId", "receiptId");

CREATE INDEX "ProductionMilkSource_receiptId_idx" ON "ProductionMilkSource"("receiptId");

ALTER TABLE "ProductionMilkSource" ADD CONSTRAINT "ProductionMilkSource_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "ProductionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionMilkSource" ADD CONSTRAINT "ProductionMilkSource_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "MilkReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ProductionSupplyUse_supplyId_idx" ON "ProductionSupplyUse"("supplyId");

CREATE INDEX "ProductionSupplyUse_purchaseId_idx" ON "ProductionSupplyUse"("purchaseId");

ALTER TABLE "ProductionSupplyUse" ADD CONSTRAINT "ProductionSupplyUse_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "ProductionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionSupplyUse" ADD CONSTRAINT "ProductionSupplyUse_supplyId_fkey" FOREIGN KEY ("supplyId") REFERENCES "Supply"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionSupplyUse" ADD CONSTRAINT "ProductionSupplyUse_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "SupplyPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Batch_code_key" ON "Batch"("code");

CREATE UNIQUE INDEX "Batch_productionId_key" ON "Batch"("productionId");

CREATE INDEX "Batch_productId_status_expiresAt_idx" ON "Batch"("productId", "status", "expiresAt");

ALTER TABLE "Batch" ADD CONSTRAINT "Batch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Batch" ADD CONSTRAINT "Batch_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "ProductionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "StockMovement_batchId_date_idx" ON "StockMovement"("batchId", "date");

CREATE INDEX "StockMovement_supplyId_date_idx" ON "StockMovement"("supplyId", "date");

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_supplyId_fkey" FOREIGN KEY ("supplyId") REFERENCES "Supply"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Customer_document_key" ON "Customer"("document");

CREATE INDEX "Customer_name_idx" ON "Customer"("name");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CustomerPrice_customerId_productId_key" ON "CustomerPrice"("customerId", "productId");

ALTER TABLE "CustomerPrice" ADD CONSTRAINT "CustomerPrice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerPrice" ADD CONSTRAINT "CustomerPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Order_code_key" ON "Order"("code");

CREATE UNIQUE INDEX "Order_occurrenceKey_key" ON "Order"("occurrenceKey");

CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");

CREATE INDEX "Order_deliveryDate_status_idx" ON "Order"("deliveryDate", "status");

ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order" ADD CONSTRAINT "Order_recurringOrderId_fkey" FOREIGN KEY ("recurringOrderId") REFERENCES "RecurringOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "OrderStatusEvent_orderId_date_idx" ON "OrderStatusEvent"("orderId", "date");

ALTER TABLE "OrderStatusEvent" ADD CONSTRAINT "OrderStatusEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "OrderItem_batchId_idx" ON "OrderItem"("batchId");

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RecurringOrder" ADD CONSTRAINT "RecurringOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "RecurringException_recurringOrderId_date_key" ON "RecurringException"("recurringOrderId", "date");

ALTER TABLE "RecurringException" ADD CONSTRAINT "RecurringException_recurringOrderId_fkey" FOREIGN KEY ("recurringOrderId") REFERENCES "RecurringOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecurringOrderItem" ADD CONSTRAINT "RecurringOrderItem_recurringOrderId_fkey" FOREIGN KEY ("recurringOrderId") REFERENCES "RecurringOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecurringOrderItem" ADD CONSTRAINT "RecurringOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Route_name_key" ON "Route"("name");

CREATE UNIQUE INDEX "Vehicle_plate_key" ON "Vehicle"("plate");

CREATE UNIQUE INDEX "Delivery_orderId_key" ON "Delivery"("orderId");

CREATE INDEX "Delivery_driverId_scheduledAt_idx" ON "Delivery"("driverId", "scheduledAt");

ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Receivable_orderId_key" ON "Receivable"("orderId");

CREATE INDEX "Receivable_dueDate_idx" ON "Receivable"("dueDate");

ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReceivablePayment" ADD CONSTRAINT "ReceivablePayment_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Payable_dueDate_idx" ON "Payable"("dueDate");

CREATE UNIQUE INDEX "FixedCost_month_category_key" ON "FixedCost"("month", "category");

CREATE INDEX "LossRecord_batchId_date_idx" ON "LossRecord"("batchId", "date");

ALTER TABLE "LossRecord" ADD CONSTRAINT "LossRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AnnouncementSend" ADD CONSTRAINT "AnnouncementSend_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "MessageTemplate_key_key" ON "MessageTemplate"("key");

CREATE INDEX "WhatsAppMessage_customerId_createdAt_idx" ON "WhatsAppMessage"("customerId", "createdAt");

ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AuditLog_entity_createdAt_idx" ON "AuditLog"("entity", "createdAt");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MilkReceipt" ADD CONSTRAINT "MilkReceipt_positive_volume" CHECK ("liters" > 0 AND "pricePerLiter" >= 0);

ALTER TABLE "ProductionMilkSource" ADD CONSTRAINT "ProductionMilkSource_positive_volume" CHECK ("liters" > 0);

ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_positive_production" CHECK ("quantityProduced" > 0 AND "litersUsed" > 0 AND "totalCost" >= 0);

ALTER TABLE "Batch" ADD CONSTRAINT "Batch_valid_stock" CHECK ("initialQuantity" >= 0 AND "availableQuantity" >= 0 AND "reservedQuantity" >= 0 AND "reservedQuantity" <= "availableQuantity");

ALTER TABLE "Batch" ADD CONSTRAINT "Batch_valid_dates" CHECK ("expiresAt" > "manufacturedAt");

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_single_target" CHECK (num_nonnulls("batchId", "supplyId") = 1);

ALTER TABLE "Supply" ADD CONSTRAINT "Supply_valid_stock" CHECK ("stock" >= 0 AND "unitCost" >= 0 AND "minimumStock" >= 0);

ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_valid_balance" CHECK ("amount" >= 0 AND "paidAmount" >= 0 AND "paidAmount" <= "amount");

ALTER TABLE "Payable" ADD CONSTRAINT "Payable_valid_balance" CHECK ("amount" >= 0 AND "paidAmount" >= 0 AND "paidAmount" <= "amount");

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_valid_quantity" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "discount" >= 0 AND "discount" <= "quantity" * "unitPrice");

ALTER TABLE "LossRecord" ADD CONSTRAINT "LossRecord_valid_loss" CHECK ("quantity" > 0 AND "cost" >= 0);
