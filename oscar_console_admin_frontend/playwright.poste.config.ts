import { defineConfig, devices } from "@playwright/test";

// Les tests d'écran contre la console qui tourne vraiment sur le poste: l'interface
// (docker compose, port 18200) et l'API avec sa base (port 18202), sans aucune API
// simulée. Ils se lancent par tester-la-connexion-sur-le-poste.sh, qui vérifie
// d'abord que les deux applications répondent. Les tests d'écran ordinaires, eux,
// simulent l'API: playwright.config.ts.
export default defineConfig({
  testDir: "./e2e-poste",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.ADRESSE_DE_L_INTERFACE_DU_POSTE || "http://127.0.0.1:18200",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } }],
});
