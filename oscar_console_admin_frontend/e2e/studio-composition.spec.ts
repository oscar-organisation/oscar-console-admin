import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Le nouveau Studio (lot L1, étapes I3 et I4) : ouvrir un bundle, et le
 * composer à la souris.
 *
 * L'API est simulée avec des réponses RÉELLES du serveur, gardées dans
 * src/.../donnees-de-test/reponses-du-serveur/ (voir leur SOURCE.txt) : le
 * catalogue, le bundle de référence enregistré, et la reprise d'un bundle de
 * l'ancienne console telle que l'adaptateur du serveur la rend. Le serveur
 * simulé garde le dernier brouillon reçu : un rechargement le relit.
 *
 * Mis à jour à l'étape I4 : l'écran n'est plus un aperçu en lecture ; il
 * reprend le dessin de l'ancien éditeur (barre d'état, blocs, légende), et la
 * reprise tient sur une ligne, ses points se lisant dans le panneau des
 * problèmes. Les scénarios de l'étape I3 suivent ces changements.
 */

const DONNEES = "../src/modules/module-studio/features/deployment-studio/donnees-de-test/reponses-du-serveur/";
const lire = (fichier: string) => JSON.parse(readFileSync(new URL(`${DONNEES}${fichier}`, import.meta.url), "utf-8"));
const CATALOGUE = lire("catalogue.json");
const REFERENCE = lire("brouillon-reference.json");
const REPRISE = lire("brouillon-reprise-ancien-format.json");

/** Un bundle neuf, tel que le serveur le rend juste après sa création (« Bundle vide »). */
const NEUF = {
  ...REFERENCE,
  bundle_id: "bundle-neuf",
  revision: 1,
  origine: { sorte: "VIDE" },
  modele: {
    format: "oscar.bundle/1",
    bundle: {
      code: "BUNDLE_DEPLOIEMENT_TELEOPERATION_DU_M3",
      nom: "Téléopération du M3",
      description: "Piloter le M3 au clavier et à la manette, avec la vidéo.",
    },
    elements: [],
    liaisons: [],
  },
  mise_en_page: { format: "oscar.mise-en-page/1", blocs: {} },
};
/** Le bundle de référence, sans mise en page : il s'ouvre rangé, ses zones côte à côte. */
const REFERENCE_SANS_MISE_EN_PAGE = { ...REFERENCE, bundle_id: "bundle-range", mise_en_page: { format: "oscar.mise-en-page/1", blocs: {} } };

const PERMISSIONS = ["ui:studio.page", "api:bundle.read", "api:bundle.write", "api:bundle.publish"];

interface Serveur {
  readonly requetes: string[];
  readonly enregistrements: { modele: Modele; mise_en_page: unknown; revision_attendue: number }[];
}

interface Modele {
  bundle: Record<string, unknown>;
  elements: { id: string; parent: string | null; [cle: string]: unknown }[];
  liaisons: { id: string; source: string; destination: string }[];
}

/** Le serveur simulé ; il note chaque requête et garde chaque brouillon reçu. */
async function serveur(page: Page, options: { brouillonIntrouvable?: boolean } = {}): Promise<Serveur> {
  await page.addInitScript(() => {
    window.localStorage.setItem("oscar_access", "e2e-access");
    window.localStorage.setItem("oscar_refresh", "e2e-refresh");
    window.localStorage.setItem("oscar.studio.guide.dismissed", "true");
  });
  const etat: Serveur = { requetes: [], enregistrements: [] };
  const brouillons = new Map<string, Record<string, unknown>>([
    ["bundle-ancien", REPRISE], ["bundle-reference", REFERENCE], ["bundle-neuf", NEUF], ["bundle-range", REFERENCE_SANS_MISE_EN_PAGE],
  ]);
  await page.route("**/api/**", async (route) => {
    const requete = route.request();
    const chemin = new URL(requete.url()).pathname.replace(/^.*\/api/, "");
    const methode = requete.method();
    etat.requetes.push(`${methode} ${chemin}`);
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
    const brouillon = /^\/studio\/bundles\/([^/]+)\/brouillon$/.exec(chemin);
    if (brouillon && methode === "GET") {
      const trouve = brouillons.get(brouillon[1] ?? "");
      await route.fulfill(options.brouillonIntrouvable || !trouve
        ? { status: 404, json: { detail: "Bundle introuvable" } }
        : { json: trouve });
      return;
    }
    if (brouillon && methode === "PUT") {
      const corps = requete.postDataJSON();
      etat.enregistrements.push(corps);
      const avant = brouillons.get(brouillon[1] ?? "") ?? {};
      const revision = Number(avant.revision ?? 0) + 1;
      brouillons.set(brouillon[1] ?? "", { ...avant, modele: corps.modele, mise_en_page: corps.mise_en_page, revision, origine: { sorte: "VIDE" }, reprise: null });
      await route.fulfill({ json: { revision, etat: "ETAT_BROUILLON_BUNDLE_EN_EDITION", empreinte_modele: `e-${revision}`, modifie_le: null } });
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
  return etat;
}

/** Ce qui écrirait : un enregistrement, une publication, un déploiement. */
function ecritures(requetes: readonly string[]): string[] {
  return requetes.filter((requete) => !requete.startsWith("GET ") && !requete.endsWith("/auth/me"));
}

const ecranLarge = (page: Page) => (page.viewportSize()?.width || 0) >= 1100;

/** Un modèle dont les identifiants sont remplacés par leur rang d'apparition : on compare la composition, pas les tirages au hasard. */
function sansIdentifiants(modele: Modele) {
  const rangs = new Map<string, string>();
  modele.elements.forEach((element, rang) => rangs.set(element.id, `e${rang + 1}`));
  modele.liaisons.forEach((liaison, rang) => rangs.set(liaison.id, `l${rang + 1}`));
  const nouveau = (id: string | null) => (id === null ? null : rangs.get(id) ?? `inconnu:${id}`);
  return {
    bundle: modele.bundle,
    elements: modele.elements.map((element) => ({ ...element, id: nouveau(element.id), parent: nouveau(element.parent) })),
    liaisons: modele.liaisons.map((liaison) => ({ id: nouveau(liaison.id), source: nouveau(liaison.source), destination: nouveau(liaison.destination) })),
  };
}

/**
 * Lâche une carte de la palette à un point du canevas : relatif au coin haut gauche de l'élément
 * donné, ou en son centre (`"centre"`).
 */
async function deposer(page: Page, carte: string, sur: Locator, decalage: { x: number; y: number } | "centre") {
  const canevas = page.getByTestId("espace-composition");
  const [cible, boite] = [await sur.boundingBox(), await canevas.boundingBox()];
  if (!cible || !boite) throw new Error(`cible ou canevas introuvable pour ${carte}`);
  const point = decalage === "centre" ? { x: cible.width / 2, y: cible.height / 2 } : decalage;
  // « force » : le point visé est souvent sous un autre bloc ; c'est justement le parent sous le pointeur qui compte.
  await page.locator(".ec-palette").getByRole("button", { name: carte, exact: true }).dragTo(canevas, {
    force: true, targetPosition: { x: cible.x - boite.x + point.x, y: cible.y - boite.y + point.y },
  });
}

/**
 * « Ajuster à l'écran », puis attendre que le canevas ait fini de bouger : une
 * place lue avant la fin serait fausse, et un dépôt tomberait à côté.
 */
async function ajusterALEcran(page: Page) {
  await page.getByRole("button", { name: "Ajuster à l’écran" }).click();
  const vue = page.locator(".react-flow__viewport");
  let avant = "";
  await expect.poll(async () => {
    const maintenant = (await vue.getAttribute("style")) ?? "";
    const stable = maintenant === avant;
    avant = maintenant;
    return stable;
  }, { intervals: [150] }).toBe(true);
}

/** Écrit dans un champ de l'inspecteur, puis le quitte : le réglage compte pour un geste. */
async function regler(page: Page, etiquette: string, valeur: string) {
  const champ = page.getByRole("complementary", { name: "Propriétés" }).getByLabel(etiquette, { exact: true });
  await champ.fill(valeur);
  await champ.press("Tab");
}

const noeud = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const zoneNommee = (page: Page, nom: string) => page.locator(".react-flow__node-zone", { has: page.locator(".ec-zone__titre strong", { hasText: new RegExp(`^${nom}$`) }) });
const blocNomme = (page: Page, nom: string) => page.locator(".react-flow__node-composant", { has: page.locator(".ec-noeud__titre strong", { hasText: new RegExp(`^${nom}$`) }) });

test("un bundle de l'ancienne console s'ouvre par la reprise, rangé, ses points dans le panneau des problèmes", async ({ page }) => {
  test.skip(!ecranLarge(page), "Le canevas demande un écran large.");
  const etat = await serveur(page);
  await page.goto("/studio/bundle-ancien/composition");

  await expect(page.locator(".project-heading strong")).toHaveText("Accueil et inventaire du magasin");
  await expect(page.getByText("BUNDLE_DEPLOIEMENT_ACCUEIL_INVENTAIRE")).toBeVisible();
  const reprise = page.getByRole("region", { name: "Reprise d’un bundle de l’ancienne console" });
  await expect(reprise).toContainText("Repris de l’ancienne console, version 1 : 2 points à revoir.");
  await reprise.getByRole("button", { name: "Voir les points à revoir" }).click();
  const panneau = page.getByRole("complementary", { name: "Problèmes du bundle" });
  await expect(panneau).toContainText("À corriger : Zone à préciser");
  await expect(panneau).toContainText("À vérifier : Type d'unité à confirmer");

  const canevas = page.getByTestId("espace-composition");
  // Les quatre zones, la salle, les six composants, leurs unités et leurs canaux.
  for (const zone of ["Robot", "Serveur", "Application web", "À préciser"]) {
    await expect(canevas.locator(".ec-zone__titre strong", { hasText: new RegExp(`^${zone}$`) })).toBeVisible();
  }
  await expect(canevas.locator(".ec-zone", { hasText: "À préciser" }).getByText("Type à préciser")).toBeVisible();
  await expect(canevas.locator(".ec-salle")).toContainText("Salle temps réel");
  for (const composant of ["Service actions du robot", "Service média du robot", "Réveil du châssis",
    "Analyse des rayons", "Télécommande opérateur web", "Suivi des stocks"]) {
    await expect(canevas.locator(".ec-noeud__titre strong", { hasText: composant })).toBeVisible();
  }
  // Un service sans unité dit le geste suivant.
  await expect(canevas.locator(".ec-noeud", { hasText: "Réveil du châssis" })).toContainText("Déposez une unité ici");
  await expect(canevas.locator(".ec-unite", { hasText: "Pilotage du déplacement" })).toContainText("Commande de déplacement");
  await expect(canevas.locator(".react-flow__edge")).toHaveCount(2);
  // Repris, il s'ouvre rangé : ses zones côte à côte, à la même hauteur, sans se recouvrir.
  const hauts = await canevas.locator(".react-flow__node-zone").evaluateAll((zones) => zones.map((zone) => zone.getBoundingClientRect().top));
  expect(new Set(hauts.map((haut) => Math.round(haut))).size).toBe(1);
  await expect(page.locator(".ec-conseil")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Légende du canevas" })).toBeVisible();
  await expect(page.locator(".studio-statusbar")).toContainText("4 zones");
  await expect(page.locator(".studio-statusbar")).toContainText("6 composants");
  await expect(page.locator(".studio-statusbar")).toContainText("2 liaisons de données");

  // L'ouverture lit, et n'écrit rien : ni brouillon, ni version, ni déploiement.
  await expect(page.locator(".studio-topbar")).toContainText("Pas encore enregistré");
  expect(etat.requetes).toContain("GET /studio/bundles/bundle-ancien/brouillon");
  expect(ecritures(etat.requetes)).toEqual([]);
});

test("le bundle de référence s'affiche : zones, salle, entrées à gauche, sorties à droite, flèches, légende", async ({ page }) => {
  test.skip(!ecranLarge(page), "Le canevas demande un écran large.");
  const etat = await serveur(page);
  await page.goto("/studio/bundle-reference/composition");
  const canevas = page.getByTestId("espace-composition");
  await expect(page.locator(".project-heading strong")).toHaveText("Téléopération du M3");
  // Pas de reprise : ce bundle est déjà au nouveau format.
  await expect(page.getByRole("region", { name: "Reprise d’un bundle de l’ancienne console" })).toHaveCount(0);

  const serveurDeTraitement = canevas.locator(".ec-zone", { hasText: "Serveur de traitement" });
  await expect(serveurDeTraitement).toContainText("Zone serveur");
  await expect(serveurDeTraitement.getByText("Facultative", { exact: true })).toBeVisible();
  await expect(canevas.locator(".ec-zone", { hasText: "Robot M3 Pro" })).toContainText("Zone robot");
  await expect(canevas.locator(".ec-salle")).toBeVisible();

  // L'entrée est sur le bord gauche de son unité, la sortie sur le bord droit.
  const uniteDuService = await canevas.locator('.react-flow__node[data-id="svc-01"] .ec-unite').boundingBox();
  const entree = await canevas.locator('.react-flow__handle[data-handleid="can-01"]').boundingBox();
  const uniteDeLApplication = await canevas.locator('.react-flow__node[data-id="app-01"] .ec-unite').boundingBox();
  const sortie = await canevas.locator('.react-flow__handle[data-handleid="can-02"]').boundingBox();
  if (!uniteDuService || !entree || !uniteDeLApplication || !sortie) throw new Error("unité ou poignée introuvable");
  expect(Math.abs(entree.x + entree.width / 2 - uniteDuService.x)).toBeLessThan(3);
  expect(Math.abs(sortie.x + sortie.width / 2 - (uniteDeLApplication.x + uniteDeLApplication.width))).toBeLessThan(3);
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
  await expect(legende).toContainText("Entrée : point creux, à gauche");
  await expect(legende).toContainText("Sortie : point plein, à droite");
  await expect(legende).toContainText("Liaison : la flèche montre où va la donnée");
  for (const famille of ["Environnements", "Temps réel", "Services et applications"]) {
    await expect(legende).toContainText(famille);
  }
  await legende.getByRole("button", { name: "Légende" }).click();
  await expect(legende.getByRole("button", { name: "Légende" })).toHaveAttribute("aria-expanded", "false");
  await expect(legende).not.toContainText("Entrée : point creux");
  await legende.getByRole("button", { name: "Légende" }).click();
  await expect(legende).toContainText("Entrée : point creux");

  // Sa mise en page enregistrée a été faite pour des blocs plus petits : l'écran le dit, sans rien déplacer.
  await expect(page.locator(".ec-conseil")).toContainText("Des blocs se recouvrent");
  await expect(page.locator(".studio-statusbar")).toContainText("3 zones");
  await expect(page.locator(".studio-statusbar")).toContainText("1 liaison de données");
  expect(ecritures(etat.requetes)).toEqual([]);
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
  await expect(page.locator(".project-heading strong")).toHaveText("Accueil et inventaire du magasin");
  // Le retour mène à la liste.
  await page.getByRole("link", { name: "Revenir à la liste des bundles" }).click();
  await expect(page).toHaveURL(/\/studio$/);
});

test("sur un écran étroit, le canevas renvoie vers un poste de travail", async ({ page }) => {
  test.skip(ecranLarge(page), "Cas propre aux petits écrans.");
  const etat = await serveur(page);
  await page.goto("/studio/bundle-ancien/composition");
  await expect(page.getByText(/demande un écran d’au moins 1100 px/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Revenir à la liste" })).toBeVisible();
  // Rien n'est chargé pour rien.
  expect(etat.requetes.some((requete) => requete.includes("/brouillon"))).toBe(false);
});

test("R1.1 : le bundle de référence se compose à la souris, s'enregistre et se recharge à l'identique", async ({ page }) => {
  test.skip(!ecranLarge(page), "Le canevas demande un écran large.");
  test.setTimeout(60_000);
  const etat = await serveur(page);
  await page.goto("/studio/bundle-neuf/composition");
  const canevas = page.getByTestId("espace-composition");
  // Un bundle vide dit par quoi commencer.
  await expect(page.getByRole("region", { name: "Pour commencer" })).toContainText("Commencez par une zone");

  // Les trois zones, déposées depuis la palette ; la salle arrive seule avec la première.
  await deposer(page, "Zone robot", canevas, { x: 120, y: 160 });
  await expect(canevas.locator(".ec-salle")).toBeVisible();
  await expect(page.getByRole("region", { name: "Pour commencer" })).toHaveCount(0);
  await regler(page, "Nom de la zone", "Robot M3 Pro");
  await regler(page, "Identifiant technique", "ZONE_ENVIRONNEMENT_EXECUTION_ROBOT_M3");

  await deposer(page, "Zone serveur", canevas, { x: 120, y: 160 });
  await regler(page, "Nom de la zone", "Serveur de traitement");
  await regler(page, "Identifiant technique", "ZONE_ENVIRONNEMENT_EXECUTION_SERVEUR_TRAITEMENT");
  const proprietes = page.getByRole("complementary", { name: "Propriétés" });
  await proprietes.getByLabel("Le bundle peut-il s’en passer ?").selectOption("EXIGENCE_ACTIVATION_ENVIRONNEMENT_FACULTATIVE");
  await regler(page, "Pourquoi le bundle fonctionne sans elle", "Le robot se pilote sans lui : il n'est pas sur le chemin de commande.");
  await expect(zoneNommee(page, "Serveur de traitement").getByText("Facultative", { exact: true })).toBeVisible();

  await deposer(page, "Zone application web", canevas, { x: 120, y: 160 });
  await regler(page, "Nom de la zone", "Téléopération web");
  await regler(page, "Identifiant technique", "ZONE_ENVIRONNEMENT_EXECUTION_APPLICATION_WEB_TELEOPERATION");
  // Rangées, les zones ne se recouvrent plus : chacune reçoit ses blocs.
  await page.locator(".studio-topbar").getByRole("button", { name: "Ranger" }).click();
  await ajusterALEcran(page);

  // Le service actions du robot, sa première unité, et l'entrée de commande.
  await deposer(page, "Service", zoneNommee(page, "Robot M3 Pro"), "centre");
  await regler(page, "Nom affiché", "Service actions du robot");
  await regler(page, "Identifiant technique", "INSTANCE_SERVICE_CONFIGUREE_ACTIONS_ROBOT");
  await blocNomme(page, "Service actions du robot").locator(".ec-unite__entete").click();
  await regler(page, "Nom de l’unité", "Commande de la base");
  await regler(page, "Identifiant technique", "INSTANCE_UNITE_CONFIGUREE_COMMANDE_BASE");
  await blocNomme(page, "Service actions du robot").getByRole("button", { name: "Ajouter une entrée" }).click();
  await regler(page, "Nom du canal", "Commande de la base");
  await regler(page, "Identifiant technique", "CANAL_RECEPTION_COMMANDE_BASE");
  await proprietes.getByLabel("Format des données").selectOption({ label: "Binaire compact, haute fréquence" });

  // Le service média, et son unité.
  await deposer(page, "Service", zoneNommee(page, "Robot M3 Pro"), "centre");
  await regler(page, "Nom affiché", "Service média du robot");
  await regler(page, "Identifiant technique", "INSTANCE_SERVICE_CONFIGUREE_MEDIA_ROBOT");
  await blocNomme(page, "Service média du robot").locator(".ec-unite__entete").click();
  await regler(page, "Nom de l’unité", "Média du robot");
  await regler(page, "Identifiant technique", "INSTANCE_UNITE_CONFIGUREE_MEDIA_ROBOT");

  // L'application de téléopération, son unité, et la sortie de commande, déposée dans sa colonne des sorties.
  await deposer(page, "Application", zoneNommee(page, "Téléopération web"), "centre");
  await regler(page, "Nom affiché", "Application de téléopération");
  await regler(page, "Identifiant technique", "INSTANCE_APPLICATION_CONFIGUREE_TELEOPERATION");
  await blocNomme(page, "Application de téléopération").locator(".ec-unite__entete").click();
  await regler(page, "Nom de l’unité", "Commande de l'opérateur");
  await regler(page, "Identifiant technique", "INSTANCE_UNITE_CONFIGUREE_COMMANDE_OPERATEUR");
  await deposer(page, "Canal d'émission", blocNomme(page, "Application de téléopération").locator(".ec-colonne--sortie"), "centre");
  await regler(page, "Nom du canal", "Commande de la base");
  await regler(page, "Identifiant technique", "CANAL_EMISSION_COMMANDE_BASE");
  await proprietes.getByLabel("Format des données").selectOption({ label: "Binaire compact, haute fréquence" });

  // La liaison : tirée de la sortie de l'application jusqu'à l'entrée du service, une fois le bundle rangé.
  await page.locator(".studio-topbar").getByRole("button", { name: "Ranger" }).click();
  await ajusterALEcran(page);
  const depart = await blocNomme(page, "Application de téléopération").locator(".ec-canal--sortie .react-flow__handle").boundingBox();
  const arrivee = await blocNomme(page, "Service actions du robot").locator(".ec-canal--entree .react-flow__handle").boundingBox();
  if (!depart || !arrivee) throw new Error("points de connexion introuvables");
  await page.mouse.move(depart.x + depart.width / 2, depart.y + depart.height / 2);
  await page.mouse.down();
  await page.mouse.move(arrivee.x + arrivee.width / 2, arrivee.y + arrivee.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(canevas.locator(".react-flow__edge")).toHaveCount(1);

  // L'en-tête du bundle : son code, réglé dans ses propriétés.
  await canevas.locator(".react-flow__pane").click({ position: { x: 8, y: 8 } });
  await regler(page, "Identifiant technique", "BUNDLE_DEPLOIEMENT_TELEOPERATION_M3");

  // Le dernier brouillon envoyé est exactement le bundle de référence, aux identifiants près.
  const attendu = sansIdentifiants(REFERENCE.modele);
  await expect.poll(() => {
    const dernier = etat.enregistrements.at(-1);
    return dernier ? sansIdentifiants(dernier.modele) : null;
  }, { timeout: 10_000 }).toEqual(attendu);
  await expect(page.locator(".studio-topbar")).toContainText("Enregistré");
  // Chaque envoi partait de la révision qu'il connaissait : aucun écrasement possible.
  etat.enregistrements.forEach((envoi, rang) => expect(envoi.revision_attendue).toBe(rang + 1));

  // Rechargé, tout est là.
  await page.reload();
  await expect(page.locator(".studio-statusbar")).toContainText("3 zones");
  await expect(page.locator(".studio-statusbar")).toContainText("3 composants");
  await expect(page.locator(".studio-statusbar")).toContainText("3 unités");
  await expect(page.locator(".studio-statusbar")).toContainText("1 liaison de données");
  await expect(zoneNommee(page, "Serveur de traitement").getByText("Facultative", { exact: true })).toBeVisible();
  await expect(canevas.locator(".ec-salle")).toHaveCount(1);
  expect(ecritures(etat.requetes).every((requete) => requete === "PUT /studio/bundles/bundle-neuf/brouillon")).toBe(true);
});

test("R1.2 : chaque dépôt interdit est refusé avec sa raison, près du point de dépôt, et rien n'est créé", async ({ page }) => {
  test.skip(!ecranLarge(page), "Le canevas demande un écran large.");
  const etat = await serveur(page);
  await page.goto("/studio/bundle-range/composition");
  await ajusterALEcran(page);
  const canevas = page.getByTestId("espace-composition");
  const refus = page.locator(".ec-refus");
  await expect(noeud(page, "svc-01")).toBeVisible();

  // Une application dans la zone robot : la zone qui l'accepterait s'éclaire.
  await deposer(page, "Application", noeud(page, "zon-01"), { x: 40, y: 30 });
  await expect(refus).toContainText("La zone « Robot M3 Pro » est une zone robot : elle reçoit des services. Placez cette application dans : Téléopération web.");
  await expect(noeud(page, "zon-03").locator(".ec-zone")).toHaveClass(/ec-compatible/);
  // Un service hors de toute zone, dans le cadre du bundle.
  await deposer(page, "Service", noeud(page, "sal-01"), { x: 300, y: 20 });
  await expect(refus).toContainText("Un service se place dans une zone d'environnement, jamais directement dans le bundle. Déposez-le dans : Robot M3 Pro, Serveur de traitement.");
  // Une deuxième salle.
  await deposer(page, "Salle temps réel", noeud(page, "zon-02"), { x: 40, y: 30 });
  await expect(refus).toContainText("Ce bundle a déjà sa salle temps réel. Il n'en a qu'une : toutes ses unités s'y retrouvent.");
  // Une unité dans une zone, hors d'un service.
  await deposer(page, "Unité", noeud(page, "zon-02"), { x: 60, y: 110 });
  await expect(refus).toContainText("Une unité se place dans un service ou une application.");
  // Une entrée dans la colonne des sorties d'une unité.
  await deposer(page, "Canal de réception", noeud(page, "svc-01").locator(".ec-colonne--sortie"), "centre");
  await expect(refus).toContainText("Ce canal de réception ne peut pas être placé dans un bus d'émission. Placez-le dans un bus de réception.");
  // Le refus s'affiche près du point de dépôt, pas en haut de l'écran.
  const boite = await refus.boundingBox();
  const colonne = await noeud(page, "svc-01").locator(".ec-colonne--sortie").boundingBox();
  if (!boite || !colonne) throw new Error("refus ou colonne introuvable");
  expect(Math.abs(boite.x - (colonne.x + colonne.width / 2 + 14))).toBeLessThan(4);

  // Rien n'a été créé ni envoyé.
  await expect(page.locator(".studio-statusbar")).toContainText("3 zones");
  await expect(page.locator(".studio-statusbar")).toContainText("3 composants");
  await expect(page.locator(".studio-statusbar")).toContainText("3 unités");
  await expect(canevas.locator(".ec-salle")).toHaveCount(1);
  expect(ecritures(etat.requetes)).toEqual([]);
});

test("R1.2 : dans un bundle vide, la salle est refusée tant qu'aucune zone n'existe", async ({ page }) => {
  test.skip(!ecranLarge(page), "Le canevas demande un écran large.");
  const etat = await serveur(page);
  await page.goto("/studio/bundle-neuf/composition");
  await deposer(page, "Salle temps réel", page.getByTestId("espace-composition"), { x: 120, y: 120 });
  await expect(page.locator(".ec-refus")).toContainText("La salle temps réel se pose seule avec la première zone. Ajoutez d'abord une zone.");
  await expect(page.locator(".studio-statusbar")).toContainText("0 zone");
  expect(ecritures(etat.requetes)).toEqual([]);
});

test("une liaison tirée vers une entrée s'éclaire, se crée, se choisit et se retire ; lâchée dans le vide, elle dit quoi faire", async ({ page }) => {
  test.skip(!ecranLarge(page), "Le canevas demande un écran large.");
  const etat = await serveur(page);
  await page.goto("/studio/bundle-range/composition");
  await ajusterALEcran(page);
  const canevas = page.getByTestId("espace-composition");
  const sortie = canevas.locator('.react-flow__handle[data-handleid="can-02"]');
  const entree = canevas.locator('.react-flow__handle[data-handleid="can-01"]');

  // La liaison existante se choisit d'un clic, et se retire de son bouton.
  await canevas.locator('.react-flow__edge[data-id="lia-01"]').click({ force: true });
  await expect(page.getByRole("complementary", { name: "Propriétés" })).toContainText("Liaison de données");
  await canevas.getByRole("button", { name: "Retirer cette liaison" }).click();
  await expect(canevas.locator(".react-flow__edge")).toHaveCount(0);
  await expect(page.locator(".ec-annonce")).toContainText("Liaison retirée");

  // Tirée depuis la sortie : l'entrée s'éclaire, les autres sorties s'estompent.
  const depart = await sortie.boundingBox();
  const arrivee = await entree.boundingBox();
  if (!depart || !arrivee) throw new Error("points introuvables");
  await page.mouse.move(depart.x + depart.width / 2, depart.y + depart.height / 2);
  await page.mouse.down();
  await page.mouse.move(depart.x - 120, depart.y + 60, { steps: 6 });
  await expect(canevas.locator('[data-element-id="can-01"]')).toHaveClass(/ec-canal--reliable/);
  await expect(canevas.locator('[data-element-id="can-02"]')).toHaveClass(/ec-canal--estompe/);
  // Lâchée près de l'entrée (pas dessus), elle s'y raccroche.
  await page.mouse.move(arrivee.x + arrivee.width / 2 + 8, arrivee.y + arrivee.height / 2 + 4, { steps: 8 });
  await page.mouse.up();
  await expect(canevas.locator(".react-flow__edge")).toHaveCount(1);
  await expect(canevas.locator('[data-element-id="can-01"]')).not.toHaveClass(/ec-canal--reliable/);

  // Lâchée dans le vide : la raison, là où on l'a lâchée.
  await page.mouse.move(depart.x + depart.width / 2, depart.y + depart.height / 2);
  await page.mouse.down();
  await page.mouse.move(depart.x + 200, depart.y - 200, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator(".ec-refus")).toContainText("Lâchez la liaison sur une entrée");
  // Le dernier brouillon envoyé a la nouvelle liaison (le retrait, puis la création, partent dans l'ordre).
  await expect.poll(() => etat.enregistrements.at(-1)?.modele.liaisons.length, { timeout: 10_000 }).toBe(1);
});
