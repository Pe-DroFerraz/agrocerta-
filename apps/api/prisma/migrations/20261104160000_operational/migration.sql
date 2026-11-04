CREATE TABLE "OperationRequest" (
 "id" TEXT PRIMARY KEY, "actorId" TEXT NOT NULL, "route" TEXT NOT NULL,
 "requestHash" TEXT NOT NULL, "result" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PayablePayment" (
 "id" TEXT PRIMARY KEY, "payableId" TEXT NOT NULL REFERENCES "Payable"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "amount" DECIMAL(14,2) NOT NULL CHECK ("amount">0), "date" TIMESTAMP(3) NOT NULL, "method" TEXT NOT NULL
);
CREATE INDEX "PayablePayment_payableId_date_idx" ON "PayablePayment"("payableId","date");

ALTER TABLE "Supply" ALTER COLUMN "stock" TYPE DECIMAL(14,5);
