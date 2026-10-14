CREATE TABLE "CheckoutRateLimitBucket" (
    "bucketKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckoutRateLimitBucket_pkey" PRIMARY KEY ("bucketKey")
);

CREATE INDEX "CheckoutRateLimitBucket_expiresAt_idx" ON "CheckoutRateLimitBucket"("expiresAt");
