/**
 * Pokladna tichy24: pridani do kosiku, validace serveru, uspesna objednavka.
 * Demo produkt ma sklad 20 a SKU DEMO-W-004.
 */

const PRODUCT = "/produkt/oelfilterschluessel-set";

function assertLocalOnly() {
  const base = Cypress.config("baseUrl") ?? "";
  expect(base, "checkout e2e must not hit production").to.match(/localhost|127\.0\.0\.1/);
}

function addDemoProduct() {
  cy.visit(PRODUCT);
  cy.contains("h1", "Ölfilterschlüssel-Set").should("be.visible");
  cy.contains("button", "In den Warenkorb").click();
  cy.location("pathname").should("eq", "/warenkorb");
  cy.contains("Ölfilterschlüssel-Set").should("be.visible");
}

function openCheckout() {
  addDemoProduct();
  cy.contains("a", "Zur Kasse").click();
  cy.location("pathname").should("eq", "/kasse");
}

describe("checkout", () => {
  beforeEach(() => {
    assertLocalOnly();
  });

  it("odmitne prazdnou pokladnu a kosik zachova", () => {
    openCheckout();
    cy.contains("h1", "Kasse").should("be.visible");

    cy.contains("button", "Zahlungspflichtig bestellen").click();
    cy.get(".notice-error").should("be.visible");
    cy.location("pathname").should("eq", "/kasse");

    cy.visit("/warenkorb");
    cy.contains("Ölfilterschlüssel-Set").should("be.visible");
  });

  it("prepina postu a vyzvednuti a ulozi dorucovaci adresu", () => {
    openCheckout();

    cy.get('input[name="deliveryMethod"][value="SHIPPING"]').should("be.checked");
    cy.get("#f-street").should("be.visible");
    cy.get("#f-postalCode").should("be.visible");
    cy.get("#f-city").should("be.visible");
    cy.get("#f-country").should("have.value", "CH");
    cy.get('input[name="paymentMethod"][value="CASH_ON_PICKUP"]').should("not.exist");
    cy.contains(".summary-row", "Versand").should("not.contain", "gratis");

    cy.get('input[name="deliveryMethod"][value="PICKUP"]').check({ force: true });
    cy.get("#f-street").should("not.exist");
    cy.get('input[name="paymentMethod"][value="CASH_ON_PICKUP"]').should("exist");
    cy.contains(".summary-row", "Versand").should("contain", "gratis");

    cy.get('input[name="deliveryMethod"][value="SHIPPING"]').check({ force: true });
    cy.get("#f-street").should("be.visible");
    cy.get('input[name="paymentMethod"][value="PREPAYMENT"]').should("be.checked");
    cy.get('input[name="paymentMethod"][value="CASH_ON_PICKUP"]').should("not.exist");

    cy.get("#f-name").type("Cypress Versand");
    cy.get("#f-email").type("cypress-shipping@example.ch");
    cy.get("#f-street").type("Bahnhofstrasse 1");
    cy.get("#f-postalCode").type("8001");
    cy.get("#f-city").type("Zürich");
    cy.get("#f-country").select("CH");
    cy.get('input[name="terms"]').check({ force: true });
    cy.get("#f-website").should("have.value", "");

    cy.contains("button", "Zahlungspflichtig bestellen").click();
    cy.location("pathname", { timeout: 20000 }).should("match", /^\/bestellung\/.+/);
    cy.contains("h2", "Lieferadresse").should("be.visible");
    cy.contains("Bahnhofstrasse 1").should("be.visible");
    cy.contains("8001 Zürich").should("be.visible");
    cy.contains("Schweiz").should("be.visible");
    cy.contains("So bezahlen Sie").should("be.visible");
    cy.contains("Barzahlung bei Abholung").should("not.exist");
  });

  it("objedna demo produkt k osobnimu vyzvednuti", () => {
    openCheckout();

    cy.get("#f-name").type("Cypress Tester");
    cy.get("#f-email").type("cypress-checkout@example.ch");
    cy.get("#f-phone").type("+41 79 000 00 00");
    cy.get('input[name="deliveryMethod"][value="PICKUP"]').check({ force: true });
    cy.get('input[name="paymentMethod"][value="CASH_ON_PICKUP"]').should("exist").check({ force: true });
    cy.get('input[name="terms"]').check({ force: true });
    cy.get("#f-website").should("have.value", "");

    cy.contains("button", "Zahlungspflichtig bestellen").click();
    cy.location("pathname", { timeout: 20000 }).should("match", /^\/bestellung\/.+/);
    cy.contains("Bestellnummer").should("be.visible");
    cy.contains("Barzahlung bei Abholung").should("be.visible");
  });
});
