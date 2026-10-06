import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Le nouveau canevas du Studio (lot L1, étape I3), en lecture, à côté de
 * l'ancien éditeur (e2e/studio.spec.ts), qui reste en service.
 *
 * L'API est simulée avec des réponses RÉELLES du serveur, gardées dans
 * src/.../donnees-de-test/reponses-du-serveur/ (voir leur SOURCE.txt) : le
 * catalogue, le bundle de référence enregistré, et la reprise d'un bundle de
 * l'ancienne console telle que l'adaptateur du serveur la rend.
 */

const DONNEES = "../src/modules/module-studio/features/deployment-studio/donnees-de-test/reponses-du-serveur/";
const lire = (fichier: string) => JSON.parse(readFileSync(new URL(`${DONNEES}${fichier}`, import.meta.url), "utf-8"));
const CATALOGUE = lire("catalogue.json");
const REFERENCE = lire("brouillon-reference.json");
const REPRISE = lire("brouillon-reprise-ancien-format.json");

const PERMISSIONS = ["ui:studio.page", "api:bundle.read", "api:bundle.write", "api:bundle.publish"];

/** Le serveur simulé ; il note chaque requête, pour vérifier que l'aperçu n'écrit rien. */
async function serveur(page: Page, options: { brouillonIntrouvable?: boolean } = {}) {
  await page.addInitScript(() => {
    window.localStorage.setItem("oscar_access", "e2e-access");
    window.localStorage.setItem("oscar_refresh", "e2e-refresh");
    window.localStorage.setItem("oscar.studio.guide.dismissed", "true");
  });
  const requetes: string[] = [];
  await page.route("**/api/**", async (route) => {
    const requete = route.request();
    const chemin = new URL(requete.url()).pathname.replace(/^.*\/api/, "");
    const methode = requete.method();
    requetes.push(`${methode} ${chemin}`);
    if (chemin.endsWith("/auth/me")) {
      await route.fulfill({ json: {
        id: "user-studio", nom: "Intégratrice Studio", email: "studio@example.test", org_id: "org-e2e",
        permissions: Object.fromEntries(PERMISSIONS.map((code) => [code, ["view", "create", "update", "delete", "execute"]])),
      } });
      return;
    }
    if (chemin === "/studio/catalogue") {
      await route.fulfill({ json: CATALOGUE });
      return;
    }
    if (chemin === "/studio/bundles/bundle-ancien/brouillon" && methode === "GET") {
      await route.fulfill(options.brouillonIntrouvable
        ? { status: 404, json: { detail: "Bundle introuvable" } }
        : { json: REPRISE });
      return;
    }
    if (chemin === "/studio/bundles/bundle-reference/brouillon" && methode === "GET") {
      await route.fulfill({ json: REFERENCE });
      return;
    }
    if (chemin === "/studio/bundles" && methode === "GET") {
      await route.fulfill({ json: [{
        id: "bundle-ancien", org_id: "org-e2e", nom: "Accueil et inventaire du magasin", slug: "accueil",
        description: "", target: "ENVIRONNEMENT_EXECUTION_ROBOT", statut: "active",
        draft_version: null,
        published_version: { id: "version-ancienne-publiee", bundle_id: "bundle-ancien", numero: 1, statut: "published" },
        version_count: 1, robot_count: 0, component_count: 6, unit_count: 6,
        projet_id: "projet-e2e", format_brouillon: "ancien",
      }] });
      return;
    }
    await route.fulfill({ json: [] });
  });
  return requetes;
}

/** Ce qui écrirait : un enregistrement, une publication, un déploiement. */
function ecritures(requetes: readonly string[]): string[] {
  return requetes.filter((requete) => !requete.startsWith("GET ") && !requete.endsWith("/auth/me"));
}

const ecranLarge = (page: Page) => (page.viewportSize()?.width || 0) >= 1100;

test("un bundle de l'ancienne console s'ouvre par la reprise", async ({ page }) => {
  test.skip(!ecranLarge(page), "Le canevas demande un écran large.");
  const requetes = await serveur(page);
  await page.goto("/studio/bundle-ancien/composition");

  await expect(page.getByRole("heading", { name: "Accueil et inventaire du magasin" })).toBeVisible();
  await expect(page.getByText("BUNDLE_DEPLOIEMENT_ACCUEIL_INVENTAIRE")).toBeVisible();
  const reprise = page.getByRole("region", { name: "Reprise d’un bundle de l’ancienne console" });
  await expect(reprise).toContainText("Ce bundle vient de l’ancienne console (version 1)");
  await expect(reprise).toContainText("La reprise signale 2 points à revoir");
  await expect(reprise).toContainText("À corriger : Zone à préciser.");
  await expect(reprise).toContainText("À vérifier : Type d'unité à confirmer.");

  const canevas = page.getByTestId("espace-composition");
  // Les quatre zones, la salle, les six composants, leurs unités et leurs canaux.
  for (const zone of ["Robot", "Serveur", "Application web", "À préciser"]) {
    await expect(canevas.locator(".ec-zone__entete strong", { hasText: new RegExp(`^${zone}$`) })).toBeVisible();
  }
  await expect(canevas.locator(".ec-zone", { hasText: "À préciser" }).getByText("Type à préciser")).toBeVisible();
  await expect(canevas.locator(".ec-salle")).toContainText("Salle temps réel");
  for (const composant of ["Service actions du robot", "Service média du robot", "Réveil du châssis",
    "Analyse des rayons", "Télécommande opérateur web", "Suivi des stocks"]) {
    await expect(canevas.locator(".ec-composant__entete strong", { hasText: composant })).toBeVisible();
  }
  await expect(canevas.locator(".ec-composant", { hasText: "Réveil du châssis" })).toContainText("Aucune unité");
  await expect(canevas.locator(".ec-unite", { hasText: "Pilotage du déplacement" })).toContainText("Commande de déplacement");
  await expect(canevas.locator(".react-flow__edge")).toHaveCount(2);
  await expect(page.getByRole("complementary", { name: "Légende du canevas" })).toBeVisible();
  await expect(page.locator(".ec-pied")).toHaveText(/4 zones\s*6 composants\s*6 unités\s*2 liaisons/);

  // L'aperçu lit, et n'écrit rien : ni brouillon, ni version, ni déploiement.
  await expect(page.getByText("Aperçu en lecture : rien ne se modifie ni ne s’enregistre ici.")).toBeVisible();
  expect(requetes).toContain("GET /studio/bundles/bundle-ancien/brouillon");
  expect(ecritures(requetes)).toEqual([]);
});

test("le bundle de référence s'affiche : zones, salle, entrées à gauche, sorties à droite, flèches, légende", async ({ page }) => {
  test.skip(!ecranLarge(page), "Le canevas demande un écran large.");
  const requetes = await serveur(page);
  await page.goto("/studio/bundle-reference/composition");
  const canevas = page.getByTestId("espace-composition");
  await expect(page.getByRole("heading", { name: "Téléopération du M3" })).toBeVisible();
  // Pas de reprise : ce bundle est déjà au nouveau format.
  await expect(page.getByRole("region", { name: "Reprise d’un bundle de l’ancienne console" })).toHaveCount(0);

  const serveurDeTraitement = canevas.locator(".ec-zone", { hasText: "Serveur de traitement" });
  await expect(serveurDeTraitement).toContainText("Zone serveur");
  await expect(serveurDeTraitement.getByText("Facultative", { exact: true })).toBeVisible();
  await expect(canevas.locator(".ec-zone", { hasText: "Robot M3 Pro" })).toContainText("Zone robot");
  await expect(canevas.locator(".ec-salle")).toBeVisible();

  // L'entrée est sur le bord gauche du service, la sortie sur le bord droit de l'application.
  const service = await canevas.locator('.react-flow__node[data-id="svc-01"]').boundingBox();
  const entree = await canevas.locator('.react-flow__handle[data-handleid="can-01"]').boundingBox();
  const application = await canevas.locator('.react-flow__node[data-id="app-01"]').boundingBox();
  const sortie = await canevas.locator('.react-flow__handle[data-handleid="can-02"]').boundingBox();
  if (!service || !entree || !application || !sortie) throw new Error("bloc ou poignée introuvable");
  expect(Math.abs(entree.x + entree.width / 2 - service.x)).toBeLessThan(2);
  expect(Math.abs(sortie.x + sortie.width / 2 - (application.x + application.width))).toBeLessThan(2);
  await expect(canevas.locator('.react-flow__handle[data-handleid="can-01"]')).toHaveAttribute("data-handlepos", "left");
  await expect(canevas.locator('.react-flow__handle[data-handleid="can-02"]')).toHaveAttribute("data-handlepos", "right");

  // La liaison a sa flèche à l'arrivée (l'entrée), aucune au départ, et ne s'anime pas.
  const liaison = canevas.locator('.react-flow__edge[data-id="lia-01"]');
  await expect(liaison).toHaveCount(1);
  await expect(liaison).not.toHaveClass(/animated/);
  const chemin = liaison.locator("path.react-flow__edge-path");
  await expect(chemin).toHaveAttribute("marker-end", /url\(/);
  expect(await chemin.getAttribute("marker-start")).toBeNull();

  // La légende, ouverte par défaut, se replie et se rouvre.
  const legende = page.getByRole("complementary", { name: "Légende du canevas" });
  await expect(legende).toContainText("Entrée : point creux, à gauche du bloc");
  await expect(legende).toContainText("Sortie : point plein, à droite du bloc");
  await expect(legende).toContainText("Liaison de données : la flèche montre où va la donnée");
  for (const famille of ["Environnements", "Temps réel", "Services et applications"]) {
    await expect(legende).toContainText(famille);
  }
  await legende.getByRole("button", { name: "Légende" }).click();
  await expect(legende.getByRole("button", { name: "Légende" })).toHaveAttribute("aria-expanded", "false");
  await expect(legende).not.toContainText("Entrée : point creux");
  await legende.getByRole("button", { name: "Légende" }).click();
  await expect(legende).toContainText("Entrée : point creux");

  await expect(page.locator(".ec-pied")).toHaveText(/3 zones\s*3 composants\s*3 unités\s*1 liaison/);
  expect(ecritures(requetes)).toEqual([]);
});

test("un bundle qui ne s'ouvre pas le dit, avec sa cause, et propose de réessayer", async ({ page }) => {
  test.skip(!ecranLarge(page), "Le canevas demande un écran large.");
  await serveur(page, { brouillonIntrouvable: true });
  await page.goto("/studio/bundle-ancien/composition");
  const alerte = page.getByRole("alert");
  await expect(alerte).toContainText("Ce bundle n’a pas pu s’ouvrir");
  await expect(alerte).toContainText("Bundle introuvable");
  await expect(alerte.getByRole("button", { name: "Réessayer" })).toBeVisible();
  await expect(alerte.getByRole("link", { name: "Revenir à la liste" })).toHaveAttribute("href", "/studio");
});

test("la liste de l'ancien Studio ouvre le nouveau canevas, à part de l'ancien éditeur", async ({ page }) => {
  test.skip(!ecranLarge(page), "Le canevas demande un écran large.");
  await serveur(page);
  await page.goto("/studio");
  await page.getByRole("button", { name: "Voir le bundle Accueil et inventaire du magasin dans le nouveau canevas" }).click();
  await expect(page).toHaveURL(/\/studio\/bundle-ancien\/composition$/);
  await expect(page.getByRole("heading", { name: "Accueil et inventaire du magasin" })).toBeVisible();
  // Le retour mène à la liste.
  await page.getByRole("link", { name: "Revenir à la liste des bundles" }).click();
  await expect(page).toHaveURL(/\/studio$/);
});

test("sur un écran étroit, le canevas renvoie vers un poste de travail", async ({ page }) => {
  test.skip(ecranLarge(page), "Cas propre aux petits écrans.");
  const requetes = await serveur(page);
  await page.goto("/studio/bundle-ancien/composition");
  await expect(page.getByText(/Le canevas demande un écran d’au moins 1100 px/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Revenir à la liste" })).toBeVisible();
  // Rien n'est chargé pour rien.
  expect(requetes.some((requete) => requete.includes("/brouillon"))).toBe(false);
});
