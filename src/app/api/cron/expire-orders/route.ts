import { expireUnpaidPrepaymentOrders } from "@/lib/orders";
import { pruneExpiredCheckoutRateLimitBuckets } from "@/lib/checkout-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel Cron posila CRON_SECRET v Authorization: Bearer <secret>.
 * Endpoint nesmi provest storno pri chybejicim nebo nespravnem tajemstvi.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await expireUnpaidPrepaymentOrders();
    let rateLimitBucketsPruned = 0;
    try {
      rateLimitBucketsPruned = await pruneExpiredCheckoutRateLimitBuckets();
    } catch (cleanupError) {
      // Rate-limit cleanup must not prevent overdue orders from being cancelled.
      console.error("cron.checkout-rate-limit-cleanup failed", cleanupError);
    }
    console.info("cron.expire-unpaid-prepayments", { ...result, rateLimitBucketsPruned });
    return Response.json({ ok: true, ...result, rateLimitBucketsPruned });
  } catch (error) {
    console.error("cron.expire-unpaid-prepayments failed", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
