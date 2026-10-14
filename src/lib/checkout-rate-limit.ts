import "server-only";
import { prisma } from "./prisma";
import { CHECKOUT_RATE_LIMIT_WINDOWS, rateLimitBucketKey, windowStartMs } from "./rate-limit-policy";

const RETENTION_MS = 24 * 60 * 60 * 1000;

function hmacSecret(): string {
  const dedicated = process.env.RATE_LIMIT_SECRET?.trim();
  if (dedicated) return dedicated;
  const authSecret = process.env.AUTH_SECRET?.trim();
  if (authSecret) return authSecret;
  if (process.env.NODE_ENV !== "production") return "tichy24-local-rate-limit-only";
  throw new Error("RATE_LIMIT_SECRET or AUTH_SECRET must be configured.");
}

export function checkoutRateLimitBucketKeys(clientIdentifier: string, now: Date = new Date()): string[] {
  const secret = hmacSecret();
  return CHECKOUT_RATE_LIMIT_WINDOWS.map((window) => {
    const start = windowStartMs(now.getTime(), window.windowMs);
    return rateLimitBucketKey(secret, clientIdentifier, window.scope, start);
  });
}

async function consumeWindow(
  clientIdentifier: string,
  window: (typeof CHECKOUT_RATE_LIMIT_WINDOWS)[number],
  now: Date,
) {
  const start = windowStartMs(now.getTime(), window.windowMs);
  const key = rateLimitBucketKey(hmacSecret(), clientIdentifier, window.scope, start);
  const expiresAt = new Date(start + window.windowMs + RETENTION_MS);

  // A single atomic PostgreSQL upsert shares this counter across serverless instances.
  const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    'INSERT INTO "CheckoutRateLimitBucket" ("bucketKey", "count", "expiresAt") ' +
    'VALUES ($1, 1, $2) ' +
    'ON CONFLICT ("bucketKey") DO UPDATE ' +
    'SET "count" = "CheckoutRateLimitBucket"."count" + 1 ' +
    'RETURNING "count"',
    key,
    expiresAt,
  );
  const count = Number(rows[0]?.count ?? 1);
  const retryAfterSeconds = Math.max(1, Math.ceil((start + window.windowMs - now.getTime()) / 1000));
  return { allowed: count <= window.limit, count, retryAfterSeconds };
}

export async function checkCheckoutRateLimit(clientIdentifier: string, now: Date = new Date()) {
  const results = await Promise.all(
    CHECKOUT_RATE_LIMIT_WINDOWS.map((window) => consumeWindow(clientIdentifier, window, now)),
  );
  const exceeded = results.filter((result) => !result.allowed);
  return {
    allowed: exceeded.length === 0,
    retryAfterSeconds: exceeded.length === 0
      ? 0
      : Math.max(...exceeded.map((result) => result.retryAfterSeconds)),
  };
}

export async function pruneExpiredCheckoutRateLimitBuckets(now: Date = new Date()): Promise<number> {
  const result = await prisma.checkoutRateLimitBucket.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return result.count;
}
