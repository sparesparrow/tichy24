import "server-only";
import { prisma } from "./prisma";
import {
  EMAIL_BATCH_SIZE,
  EMAIL_LOCK_TIMEOUT_MS,
  EMAIL_REQUEST_TIMEOUT_MS,
  MAX_EMAIL_ATTEMPTS,
  emailRetryDelayMs,
  isRetryableEmailFailure,
} from "./email-outbox-policy";

export class EmailDeliveryConfigurationError extends Error {
  constructor() {
    super("RESEND_API_KEY and EMAIL_FROM must be configured.");
  }
}

interface ResendResponse {
  id?: unknown;
  name?: unknown;
}

function safeErrorName(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-z0-9_-]{1,80}$/i.test(value) ? value : undefined;
}

async function deliverOne(
  message: {
    id: string;
    recipient: string;
    replyTo: string | null;
    fromAddress: string;
    subject: string;
    html: string;
    text: string;
    idempotencyKey: string;
    attempts: number;
  },
  apiKey: string,
  now: Date,
): Promise<"sent" | "retried" | "failed"> {
  let httpStatus: number | undefined;
  let errorName: string | undefined;
  let providerMessageId: string | undefined;
  let retryable = true;
  let errorSummary = "Resend network or timeout error";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({
        from: message.fromAddress,
        to: [message.recipient],
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(EMAIL_REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    httpStatus = response.status;
    const body = await response.json().catch(() => null) as ResendResponse | null;
    if (response.ok && typeof body?.id === "string") {
      providerMessageId = body.id;
    } else {
      errorName = safeErrorName(body?.name);
      retryable = response.ok || isRetryableEmailFailure(response.status, errorName);
      errorSummary = "Resend HTTP " + response.status + (errorName ? " (" + errorName + ")" : "");
    }
  } catch {
    // The provider may have accepted a request before the connection timed out.
    // Always retry using the same idempotency key.
    retryable = true;
  }

  if (providerMessageId) {
    await prisma.emailOutbox.update({
      where: { id: message.id },
      data: {
        status: "SENT",
        providerMessageId,
        sentAt: now,
        lockedAt: null,
        lastError: null,
      },
    });
    console.info("email.outbox.sent", { id: message.id, attempts: message.attempts });
    return "sent";
  }

  const terminal = !retryable || message.attempts >= MAX_EMAIL_ATTEMPTS;
  await prisma.emailOutbox.update({
    where: { id: message.id },
    data: {
      status: terminal ? "FAILED" : "PENDING",
      nextAttemptAt: terminal ? now : new Date(now.getTime() + emailRetryDelayMs(message.attempts)),
      lockedAt: null,
      lastError: errorSummary.slice(0, 500),
    },
  });
  console.error("email.outbox.delivery-failed", {
    id: message.id,
    attempts: message.attempts,
    httpStatus,
    errorName,
    retryable,
    terminal,
  });
  return terminal ? "failed" : "retried";
}

export async function processEmailOutboxBatch(now: Date = new Date()) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const configuredFrom = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !configuredFrom) throw new EmailDeliveryConfigurationError();

  const staleBefore = new Date(now.getTime() - EMAIL_LOCK_TIMEOUT_MS);

  // A crashed worker on the final attempt becomes visible as FAILED for manual review.
  await prisma.emailOutbox.updateMany({
    where: {
      status: "PROCESSING",
      lockedAt: { lte: staleBefore },
      attempts: { gte: MAX_EMAIL_ATTEMPTS },
    },
    data: {
      status: "FAILED",
      lockedAt: null,
      lastError: "Worker stopped during final retry; verify provider logs.",
    },
  });

  const eligible = {
    OR: [
      { status: "PENDING" as const, attempts: { lt: MAX_EMAIL_ATTEMPTS }, nextAttemptAt: { lte: now } },
      { status: "PROCESSING" as const, attempts: { lt: MAX_EMAIL_ATTEMPTS }, lockedAt: { lte: staleBefore } },
    ],
  };
  const candidates = await prisma.emailOutbox.findMany({
    where: eligible,
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: EMAIL_BATCH_SIZE,
  });

  const claimed: Array<{
    id: string;
    recipient: string;
    replyTo: string | null;
    fromAddress: string;
    subject: string;
    html: string;
    text: string;
    idempotencyKey: string;
    attempts: number;
  }> = [];

  for (const candidate of candidates) {
    const result = await prisma.emailOutbox.updateMany({
      where: { id: candidate.id, ...eligible },
      data: {
        status: "PROCESSING",
        lockedAt: now,
        attempts: { increment: 1 },
        fromAddress: candidate.fromAddress ?? configuredFrom,
      },
    });
    if (result.count !== 1) continue;

    claimed.push({
      id: candidate.id,
      recipient: candidate.recipient,
      replyTo: candidate.replyTo,
      fromAddress: candidate.fromAddress ?? configuredFrom,
      subject: candidate.subject,
      html: candidate.html,
      text: candidate.text,
      idempotencyKey: candidate.idempotencyKey,
      attempts: candidate.attempts + 1,
    });
  }

  const results = await Promise.all(claimed.map((message) => deliverOne(message, apiKey, now)));
  return {
    scanned: candidates.length,
    claimed: claimed.length,
    sent: results.filter((result) => result === "sent").length,
    retried: results.filter((result) => result === "retried").length,
    failed: results.filter((result) => result === "failed").length,
  };
}
