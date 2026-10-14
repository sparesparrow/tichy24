CREATE TYPE "EmailOutboxType" AS ENUM ('ORDER_CONFIRMATION', 'NEW_ORDER_NOTIFICATION');
CREATE TYPE "EmailOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "EmailOutboxType" NOT NULL,
    "recipient" TEXT NOT NULL,
    "replyTo" TEXT,
    "fromAddress" TEXT,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "EmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "lastError" VARCHAR(500),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailOutbox_idempotencyKey_key" ON "EmailOutbox"("idempotencyKey");
CREATE INDEX "EmailOutbox_orderId_idx" ON "EmailOutbox"("orderId");
CREATE INDEX "EmailOutbox_status_nextAttemptAt_idx" ON "EmailOutbox"("status", "nextAttemptAt");
CREATE INDEX "EmailOutbox_status_lockedAt_idx" ON "EmailOutbox"("status", "lockedAt");

ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
