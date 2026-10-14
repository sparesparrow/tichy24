import { defineConfig } from "cypress";

/**
 * E2E pokladny. Spousti se proti localhostu (CI: next dev + seed).
 * Produkci zamerne neobjednava — to by odecitalo sklad.
 */
export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL ?? "http://localhost:3000",
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: "cypress/support/e2e.ts",
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 15000,
    pageLoadTimeout: 60000,
  },
});
