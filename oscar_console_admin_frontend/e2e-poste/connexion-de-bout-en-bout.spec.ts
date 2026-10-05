import { expect, test } from "@playwright/test";

// Sur le poste, l'interface servie par son image (nginx et sa règle de sécurité)
// appelle l'API du poste, servie en http. La règle de sécurité de l'image n'autorise
// que https: compose.override.yaml monte à sa place nginx-security-headers.poste.conf
// (décision 120). Ce scénario prouve que la connexion réussit alors de bout en bout,
// et qu'aucun appel n'est refusé par la règle de sécurité.
//
// Le compte est l'administrateur créé par l'API au premier démarrage, lu dans le
// .env de l'API par tester-la-connexion-sur-le-poste.sh; il n'est jamais affiché.
const email = process.env.ADMIN_EMAIL ?? "";
const motDePasse = process.env.ADMIN_PASSWORD ?? "";

test("sur le poste, l'interface se connecte à l'API du poste, de bout en bout", async ({ page }) => {
  expect(email, "ADMIN_EMAIL manque: lancer ce test par tester-la-connexion-sur-le-poste.sh").not.toBe("");
  expect(motDePasse, "ADMIN_PASSWORD manque: lancer ce test par tester-la-connexion-sur-le-poste.sh").not.toBe("");

  const refusParLaRegleDeSecurite: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) refusParLaRegleDeSecurite.push(message.text());
  });

  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(motDePasse);
  // Un appel refusé par la règle de sécurité ne reçoit aucune réponse: l'attente
  // finit alors sans réponse, et le refus, dit dans la console du navigateur,
  // s'affiche dans l'échec du test.
  const [reponse] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname.endsWith("/auth/login"), { timeout: 15_000 }).catch(() => null),
    page.getByTestId("login-submit").click(),
  ]);

  expect(refusParLaRegleDeSecurite, "appels refusés par la règle de sécurité de l'interface").toEqual([]);
  expect(reponse?.status(), "réponse de l'API du poste à la connexion").toBe(200);
  await expect(page.getByRole("heading", { name: "Espace de travail" })).toBeVisible();
});
