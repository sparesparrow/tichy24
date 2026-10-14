import { formatChf } from "./money";
import { formatOrderNumber } from "./site";

export interface OrderEmailItem {
  name: string;
  sku: string;
  quantity: number;
  unitCents: number;
}

export interface OrderEmailOrder {
  id: string;
  number: number;
  publicToken: string;
  createdAt: Date;
  name: string;
  email: string;
  phone: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  note: string | null;
  deliveryMethod: "SHIPPING" | "PICKUP";
  paymentMethod: "PREPAYMENT" | "CASH_ON_PICKUP";
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  vatCents: number;
  vatRateBp: number;
  items: readonly OrderEmailItem[];
}

export type OrderEmailType = "ORDER_CONFIRMATION" | "NEW_ORDER_NOTIFICATION";

export interface OrderEmailMessage {
  type: OrderEmailType;
  recipient: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}

export interface BuildOrderEmailsInput {
  order: OrderEmailOrder;
  shopName: string;
  shopEmail: string;
  siteUrl: string;
  bankHolder: string;
  iban: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return char;
    }
  });
}

function shell(shopName: string, content: string): string {
  return "<!doctype html><html lang=\"de-CH\"><body style=\"margin:0;padding:24px;background:#f5f7fa;color:#0f1b2b;font-family:Arial,Helvetica,sans-serif;line-height:1.5;\"><div style=\"max-width:640px;margin:0 auto;background:#fff;border:1px solid #d9e1ea;border-radius:10px;padding:24px;\"><p style=\"font-size:20px;font-weight:700;color:#084f97;margin-top:0;\">" +
    escapeHtml(shopName) + "</p>" + content +
    "<hr style=\"border:0;border-top:1px solid #d9e1ea;margin:24px 0;\"><p style=\"font-size:12px;color:#64748b;\">Diese E-Mail wurde automatisch zu einer Bestellung bei " +
    escapeHtml(shopName) + " erstellt.</p></div></body></html>";
}

function totals(order: OrderEmailOrder): { html: string; text: string } {
  const itemHtml = order.items.map((item) =>
    "<tr><td style=\"padding:8px;border-bottom:1px solid #e2e8f0;\">" +
    item.quantity + " × " + escapeHtml(item.name) + "<br><small>" + escapeHtml(item.sku) +
    "</small></td><td style=\"padding:8px;text-align:right;border-bottom:1px solid #e2e8f0;white-space:nowrap;\">" +
    formatChf(item.unitCents * item.quantity) + "</td></tr>",
  ).join("");
  const itemText = order.items.map((item) =>
    "- " + item.quantity + " x " + item.name + " (" + item.sku + "): " + formatChf(item.unitCents * item.quantity),
  ).join("\n");
  const shipping = order.deliveryMethod === "PICKUP" ? "Abholung" :
    (order.shippingCents === 0 ? "Kostenlos" : formatChf(order.shippingCents));
  const vatHtml = order.vatRateBp > 0
    ? "<tr><td style=\"padding:4px 8px;color:#64748b;\">Davon " + (order.vatRateBp / 100).toFixed(1) +
      " % MwSt.</td><td style=\"padding:4px 8px;text-align:right;color:#64748b;\">" + formatChf(order.vatCents) + "</td></tr>"
    : "";
  return {
    html: "<table role=\"presentation\" style=\"width:100%;border-collapse:collapse;margin:16px 0;\"><tbody>" + itemHtml +
      "<tr><td style=\"padding:8px;\">Zwischensumme</td><td style=\"padding:8px;text-align:right;\">" + formatChf(order.subtotalCents) +
      "</td></tr><tr><td style=\"padding:8px;\">Versand</td><td style=\"padding:8px;text-align:right;\">" + escapeHtml(shipping) +
      "</td></tr><tr><td style=\"padding:10px 8px;border-top:2px solid #0f1b2b;font-weight:700;\">Total (CHF)</td><td style=\"padding:10px 8px;border-top:2px solid #0f1b2b;text-align:right;font-weight:700;\">" +
      formatChf(order.totalCents) + "</td></tr>" + vatHtml + "</tbody></table>",
    text: itemText + "\n\nZwischensumme: " + formatChf(order.subtotalCents) +
      "\nVersand: " + shipping + "\nTotal: " + formatChf(order.totalCents) +
      (order.vatRateBp > 0 ? "\nDavon " + (order.vatRateBp / 100).toFixed(1) + " % MwSt.: " + formatChf(order.vatCents) : ""),
  };
}

export function buildOrderEmails(input: BuildOrderEmailsInput): OrderEmailMessage[] {
  const order = input.order;
  const number = formatOrderNumber(order.number);
  const base = input.siteUrl.replace(/\/$/, "");
  const orderUrl = base + "/bestellung/" + encodeURIComponent(order.publicToken);
  const adminUrl = base + "/admin/bestellungen/" + encodeURIComponent(order.id);
  const date = new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Zurich",
  }).format(order.createdAt);
  const rows = totals(order);
  const delivery = order.deliveryMethod === "SHIPPING" ? "Versand" : "Abholung";
  const payment = order.paymentMethod === "PREPAYMENT" ? "Vorkasse (Banküberweisung)" : "Barzahlung bei Abholung";
  const address = order.deliveryMethod === "SHIPPING"
    ? [order.street, [order.postalCode, order.city].filter(Boolean).join(" "), order.country === "LI" ? "Liechtenstein" : "Schweiz"].filter(Boolean).join("\n")
    : "Persönliche Abholung (nach Vereinbarung)";
  const addressHtml = escapeHtml(address).replace(/\n/g, "<br>");
  const paymentHtml = order.paymentMethod === "PREPAYMENT"
    ? (input.iban.trim()
      ? "<p>Bitte überweisen Sie <strong>" + formatChf(order.totalCents) + "</strong> an <strong>" +
        escapeHtml(input.bankHolder) + "</strong>, IBAN <strong>" + escapeHtml(input.iban) +
        "</strong>. Zahlungszweck: " + escapeHtml(number) + ".</p>"
      : "<p>Die Bankverbindung erhalten Sie separat. Bitte überweisen Sie erst, wenn Ihnen die Zahlungsangaben vorliegen.</p>")
    : "<p>Die Zahlung erfolgt bar bei der persönlichen Abholung.</p>";
  const paymentText = order.paymentMethod === "PREPAYMENT"
    ? (input.iban.trim()
      ? "Bitte überweisen Sie " + formatChf(order.totalCents) + " an " + input.bankHolder +
        ", IBAN " + input.iban + ". Zahlungszweck: " + number + "."
      : "Die Bankverbindung erhalten Sie separat. Bitte überweisen Sie erst, wenn Ihnen die Zahlungsangaben vorliegen.")
    : "Die Zahlung erfolgt bar bei der persönlichen Abholung.";
  const deliveryHtml = order.deliveryMethod === "SHIPPING"
    ? "<p><strong>Lieferadresse</strong><br>" + addressHtml + "</p>"
    : "<p><strong>Lieferung</strong><br>Persönliche Abholung (nach Vereinbarung)</p>";
  const deliveryText = order.deliveryMethod === "SHIPPING"
    ? "Lieferadresse:\n" + address
    : "Lieferung: Persönliche Abholung (nach Vereinbarung)";

  const confirmationHtml = shell(input.shopName,
    "<h1 style=\"font-size:24px;margin:0 0 16px;\">Eingang Ihrer Bestellung " + escapeHtml(number) + "</h1>" +
    "<p>Guten Tag " + escapeHtml(order.name) + ",</p><p>wir haben Ihre Bestellung erhalten. Bitte bewahren Sie diese E-Mail für Ihre Unterlagen auf.</p>" +
    "<p><strong>Bestellnummer:</strong> " + escapeHtml(number) + "<br><strong>Eingegangen:</strong> " + escapeHtml(date) +
    "<br><strong>Lieferung:</strong> " + delivery + "<br><strong>Zahlung:</strong> " + payment + "</p>" +
    rows.html + paymentHtml + deliveryHtml +
    "<p><a href=\"" + escapeHtml(orderUrl) + "\" style=\"display:inline-block;padding:12px 18px;background:#0b6bcb;color:#fff;text-decoration:none;border-radius:7px;\">Bestellübersicht öffnen</a></p>" +
    "<p>Bei Fragen erreichen Sie uns unter <a href=\"mailto:" + escapeHtml(input.shopEmail) + "\">" + escapeHtml(input.shopEmail) + "</a>.</p>");
  const confirmationText = "Guten Tag " + order.name + ",\n\nWir haben Ihre Bestellung erhalten. Bitte bewahren Sie diese E-Mail für Ihre Unterlagen auf.\n\n" +
    "Bestellnummer: " + number + "\nEingegangen: " + date + "\nLieferung: " + delivery + "\nZahlung: " + payment +
    "\n\n" + rows.text + "\n\n" + paymentText + "\n\n" + deliveryText + "\n\nBestellübersicht: " + orderUrl +
    "\nFragen? " + input.shopEmail;
  const notificationHtml = shell(input.shopName,
    "<h1 style=\"font-size:24px;margin:0 0 16px;\">Neue Bestellung " + escapeHtml(number) + "</h1>" +
    "<p>Eine neue Bestellung ist im Shop eingegangen.</p><p><strong>Bestellnummer:</strong> " + escapeHtml(number) +
    "<br><strong>Eingegangen:</strong> " + escapeHtml(date) + "<br><strong>Lieferung:</strong> " + delivery +
    "<br><strong>Zahlung:</strong> " + payment + "</p><h2 style=\"font-size:18px;\">Artikel</h2>" + rows.html +
    "<h2 style=\"font-size:18px;\">Kundendaten</h2><p><strong>Name:</strong> " + escapeHtml(order.name) +
    "<br><strong>E-Mail:</strong> <a href=\"mailto:" + escapeHtml(order.email) + "\">" + escapeHtml(order.email) +
    "</a><br><strong>Telefon:</strong> " + escapeHtml(order.phone || "—") + "<br><strong>Adresse:</strong><br>" + addressHtml +
    (order.note ? "<br><strong>Anmerkung:</strong><br>" + escapeHtml(order.note).replace(/\n/g, "<br>") : "") +
    "</p><p><a href=\"" + escapeHtml(adminUrl) + "\" style=\"display:inline-block;padding:12px 18px;background:#0b6bcb;color:#fff;text-decoration:none;border-radius:7px;\">Bestellung in der Verwaltung öffnen</a></p>");
  const notificationText = "Neue Bestellung " + number + "\nEingegangen: " + date + "\nLieferung: " + delivery + "\nZahlung: " + payment +
    "\n\n" + rows.text + "\n\nKunde: " + order.name + "\nE-Mail: " + order.email + "\nTelefon: " + (order.phone || "—") +
    "\n" + address + (order.note ? "\nAnmerkung: " + order.note : "") + "\n\nIn der Verwaltung öffnen: " + adminUrl;

  return [
    { type: "ORDER_CONFIRMATION", recipient: order.email, replyTo: input.shopEmail, subject: "Eingang Ihrer Bestellung " + number,
      html: confirmationHtml, text: confirmationText, idempotencyKey: "order-confirmation/" + order.id },
    { type: "NEW_ORDER_NOTIFICATION", recipient: input.shopEmail, replyTo: order.email, subject: "Neue Bestellung " + number,
      html: notificationHtml, text: notificationText, idempotencyKey: "new-order-notification/" + order.id },
  ];
}
