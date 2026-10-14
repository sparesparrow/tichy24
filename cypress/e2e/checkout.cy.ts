/**
 * Pokladna tichy24: pridani do kosiku, validace serveru, uspesna objednavka.
 * Demo produkt ma sklad 20 a SKU DEMO-W-004. Objednavka je Abholung + hotovost,
 * aby test nepotreboval adresu ani bankovni udaje.
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

describe("checkout", () => {
  beforeEach(() => {
    assertLocalOnly();
  });

  it("odmitne prazdnou pokladnu a kosik zachova", () => {
    addDemoProduct();
    cy.contains("a", "Zur Kasse").click();
    cy.location("pathname").should("eq", "/kasse");
    cy.contains("h1", "Kasse").should("be.visible");

    cy.contains("button", "Zahlungspflichtig bestellen").click();
    cy.get(".notice-error").should("be.visible");
    cy.location("pathname").should("eq", "/kasse");

    cy.visit("/warenkorb");
    cy.contains("Ölfilterschlüssel-Set").should("be.visible");
  });

  it("objedna demo produkt k osobnimu vyzvednuti", () => {
    addDemoProduct();
    cy.contains("a", "Zur Kasse").click();
    cy.location("pathname").should("eq", "/kasse");

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
