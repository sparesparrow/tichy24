import { describe, expect, it } from "vitest";
import { buildOrderEmails } from "./order-email-template";

const order = {
  id: "order_123", number: 42, publicToken: "public-token",
  createdAt: new Date("2026-10-14T12:00:00.000Z"),
  name: "<script>alert('x')</script>", email: "anna@example.ch",
  phone: "+41 79 123 45 67", street: "Bahnhofstrasse 1", postalCode: "8001",
  city: "Zürich", country: "CH", note: "<img src=x onerror=alert(1)>",
  deliveryMethod: "SHIPPING" as const, paymentMethod: "PREPAYMENT" as const,
  subtotalCents: 2500, shippingCents: 990, totalCents: 3490, vatCents: 262, vatRateBp: 810,
  items: [{ name: "Ölfilter <script>", sku: "OF-1", quantity: 1, unitCents: 2500 }],
};

describe("order email templates", () => {
  const emails = buildOrderEmails({
    order, shopName: "tichy24.ch", shopEmail: "info@tichy24.ch",
    siteUrl: "https://tichy24.ch/", bankHolder: "Dušan Tichý", iban: "CH9300762011623852957",
  });
  it("creates both notifications with distinct idempotency keys", () => {
    expect(emails.map((e) => e.type)).toEqual(["ORDER_CONFIRMATION", "NEW_ORDER_NOTIFICATION"]);
    expect(emails[0].recipient).toBe("anna@example.ch");
    expect(emails[1].recipient).toBe("info@tichy24.ch");
    expect(emails[0].subject).toContain("T24-00042");
    expect(emails[0].idempotencyKey).not.toBe(emails[1].idempotencyKey);
  });
  it("escapes user-controlled text in HTML", () => {
    expect(emails[0].html).not.toContain("<script>");
    expect(emails[0].html).toContain("&lt;script&gt;");
    expect(emails[1].html).not.toContain("<img src=x");
    expect(emails[1].html).toContain("&lt;img src=x");
  });
  it("contains order links and payment details", () => {
    expect(emails[0].text).toContain("https://tichy24.ch/bestellung/public-token");
    expect(emails[0].html).toContain("CH9300762011623852957");
    expect(emails[1].text).toContain("https://tichy24.ch/admin/bestellungen/order_123");
  });
  it("does not invent an IBAN if none is configured", () => {
    const [confirmation] = buildOrderEmails({
      order, shopName: "tichy24.ch", shopEmail: "info@tichy24.ch",
      siteUrl: "https://tichy24.ch", bankHolder: "Dušan Tichý", iban: "",
    });
    expect(confirmation.text).toContain("Bankverbindung erhalten Sie separat");
    expect(confirmation.html).not.toContain("CH9300762011623852957");
  });
});
