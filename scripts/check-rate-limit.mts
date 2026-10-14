/**
 * Integration test for the shared PostgreSQL checkout rate limiter.
 * Run against the same temporary Postgres instance as check-stock-race.mts.
 */
import { randomBytes } from "node:crypto";
import path from "node:path";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // CI supplies env directly.
}

const { prisma } = await import("../src/lib/prisma");
const { checkCheckoutRateLimit, checkoutRateLimitBucketKeys } = await import("../src/lib/checkout-rate-limit");

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log("  ok   " + name);
  else {
    failures++;
    console.error("  FAIL " + name);
    if (detail !== undefined) console.error("       " + JSON.stringify(detail));
  }
}

const identifier = "checkout-rate-limit-check-" + randomBytes(12).toString("hex");
const now = new Date();

try {
  console.log("Souběžné pokusy o pokladnu:");
  const results = await Promise.all(
    Array.from({ length: 30 }, () => checkCheckoutRateLimit(identifier, now)),
  );
  const allowed = results.filter((result) => result.allowed);
  const blocked = results.filter((result) => !result.allowed);

  check("přesně 5 z 30 souběžných pokusů projde", allowed.length === 5, { allowed: allowed.length });
  check("zbylých 25 pokusů je zablokováno", blocked.length === 25, { blocked: blocked.length });
  check("blokace obsahuje kladný čas čekání",
    blocked.every((result) => result.retryAfterSeconds > 0),
    { invalid: blocked.filter((result) => result.retryAfterSeconds <= 0).length });

  const keys = checkoutRateLimitBucketKeys(identifier, now);
  check("uložené identifikátory neobsahují surovou IP",
    keys.every((key) => /^[a-f0-9]{64}$/.test(key) && !key.includes(identifier)),
    { keys });
} finally {
  const keys = checkoutRateLimitBucketKeys(identifier, now);
  await prisma.checkoutRateLimitBucket.deleteMany({ where: { bucketKey: { in: keys } } }).catch(() => {});
  await prisma.$disconnect();
}

if (failures > 0) {
  console.error("\n" + failures + " kontrol selhalo.");
  process.exit(1);
}
console.log("\nVše v pořádku.");
