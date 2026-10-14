import { EmailDeliveryConfigurationError, processEmailOutboxBatch } from "@/lib/email-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron authenticates with Authorization: Bearer CRON_SECRET. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== "Bearer " + secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await processEmailOutboxBatch();
    console.info("cron.send-order-emails", result);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof EmailDeliveryConfigurationError) {
      return Response.json({ ok: false, error: "Email delivery is not configured" }, { status: 503 });
    }
    console.error("cron.send-order-emails failed", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
