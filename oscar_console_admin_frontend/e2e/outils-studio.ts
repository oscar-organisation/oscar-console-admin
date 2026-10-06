import { readFileSync } from "node:fs";
import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Ce que partagent les scénarios du nouveau Studio : le serveur simulé, avec
 * les réponses RÉELLES du serveur gardées dans
 * src/.../donnees-de-test/reponses-du-serveur/ (voir leur SOURCE.txt), et les
 * gestes à la souris (déposer une carte, régler un champ). Le serveur simulé
 * garde le dernier brouillon reçu : un rechargement le relit.
 */

export const DONNEES = "../src/modules/module-studio/features/deployment-studio/donnees-de-test/reponses-du-serveur/";
export const lire = (fichier: string) => JSON.parse(readFileSync(new URL(`${DONNEES}${fichier}`, import.meta.url), "utf-8"));
export const CATALOGUE = lire("catalogue.json");
export const REFERENCE = lire("brouillon-reference.json");
export const REPRISE = lire("brouillon-reprise-ancien-format.json");

/** Un bundle neuf, tel que le serveur le rend juste après sa création (« Bundle vide »). */
export const NEUF = {
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
export const REFERENCE_SANS_MISE_EN_PAGE = { ...REFERENCE, bundle_id: "bundle-range", mise_en_page: { format: "oscar.mise-en-page/1", blocs: {} } };
/**
 * Le bundle de référence placé à rebours : la zone de l'application à droite du robot. La liaison
 * revient alors de droite à gauche ; les zones gardent leurs places rangées, sans se recouvrir.
 */
export const REFERENCE_A_REBOURS = {
  ...REFERENCE,
  bundle_id: "bundle-a-rebours",
  mise_en_page: {
    ...REFERENCE.mise_en_page,
    blocs: {
      ...REFERENCE.mise_en_page.blocs,
      "zon-01": REFERENCE.mise_en_page.blocs["zon-03"],
      "zon-02": REFERENCE.mise_en_page.blocs["zon-01"],
      "zon-03": REFERENCE.mise_en_page.blocs["zon-02"],
    },
  },
};

export const PERMISSIONS = ["ui:studio.page", "api:bundle.read", "api:bundle.write", "api:bundle.publish"];

export interface Serveur {
  readonly requetes: string[];
  readonly enregistrements: { modele: Modele; mise_en_page: unknown; revision_attendue: number }[];
  /** Les corps des créations de bundle (POST /studio/bundles). */
  readonly creations: { nom: string; description: string; depart: unknown }[];
}

export interface Modele {
  bundle: Record<string, unknown>;
  elements: { id: string; parent: string | null; [cle: string]: unknown }[];
  liaisons: { id: string; source: string; destination: string }[];
}

/** Ce que le serveur simulé rend à « Vérifier » : des problèmes rangés comme ceux du serveur (spécification 18.2). */
export interface ProblemeSimule {
  niveau: "ERREUR" | "AVERTISSEMENT";
  code: string;
  titre: string;
  explication: string;
  correction: string;
  element: string | null;
}

/** Un bundle de la liste, tel que le serveur le rend (BundleOut). */
export function bundleDeLaListe(id: string, nom: string, champs: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, org_id: "org-e2e", nom, slug: id, description: "", target: "ENVIRONNEMENT_EXECUTION_ROBOT", statut: "active",
    draft_version: null, published_version: null, version_count: 0, robot_count: 0, component_count: 0, unit_count: 0,
    projet_id: "projet-e2e", format_brouillon: "oscar.bundle/1", updated_at: "2026-10-06T00:30:00Z", ...champs,
  };
}

/** La liste par défaut : un bundle de l'ancienne console, pas encore repris. */
export const LISTE_PAR_DEFAUT = [bundleDeLaListe("bundle-ancien", "Accueil et inventaire du magasin", {
  published_version: { id: "version-ancienne-publiee", bundle_id: "bundle-ancien", numero: 1, statut: "published" },
  version_count: 1, component_count: 6, unit_count: 6, format_brouillon: "ancien",
})];

export interface OptionsDuServeur {
  brouillonIntrouvable?: boolean;
  problemes?: ProblemeSimule[];
  /** La liste des bundles ; LISTE_PAR_DEFAUT sinon. */
  bundles?: Record<string, unknown>[];
  /** La liste ne répond pas : 503, avec sa cause. */
  listeEnPanne?: boolean;
  /** Un autre poste enregistre avant nous : le premier enregistrement répond 409. */
  conflit?: { modele: Modele; revision: number };
}

/** Le serveur simulé ; il note chaque requête et garde chaque brouillon reçu. */
export async function serveur(page: Page, options: OptionsDuServeur = {}): Promise<Serveur> {
  await page.addInitScript(() => {
    window.localStorage.setItem("oscar_access", "e2e-access");
    window.localStorage.setItem("oscar_refresh", "e2e-refresh");
    window.localStorage.setItem("oscar.studio.guide.dismissed", "true");
  });
  const etat: Serveur = { requetes: [], enregistrements: [], creations: [] };
  let liste = options.bundles ?? LISTE_PAR_DEFAUT;
  let conflitEnAttente = options.conflit !== undefined;
  const brouillons = new Map<string, Record<string, unknown>>([
    ["bundle-ancien", REPRISE], ["bundle-reference", REFERENCE], ["bundle-neuf", NEUF], ["bundle-range", REFERENCE_SANS_MISE_EN_PAGE],
    ["bundle-a-rebours", REFERENCE_A_REBOURS],
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
    if (brouillon && methode === "PUT" && conflitEnAttente) {
      // L'autre poste a enregistré : la révision du serveur a monté, son contenu a changé.
      conflitEnAttente = false;
      const avant = brouillons.get(brouillon[1] ?? "") ?? {};
      brouillons.set(brouillon[1] ?? "", { ...avant, modele: options.conflit?.modele, revision: options.conflit?.revision });
      await route.fulfill({ status: 409, json: {
        detail: `Ce brouillon a été modifié depuis un autre poste (révision ${options.conflit?.revision}). Rechargez-le pour voir ces changements ; vos modifications restent proposées à côté.`,
        code: "BROUILLON_MODIFIE_AILLEURS", revision_serveur: options.conflit?.revision,
      } });
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
    const verification = /^\/studio\/bundles\/([^/]+)\/brouillon\/verification$/.exec(chemin);
    if (verification && methode === "POST") {
      const problemes = options.problemes ?? [];
      await route.fulfill({ json: {
        revision: Number(brouillons.get(verification[1] ?? "")?.revision ?? 0),
        problemes,
        erreurs: problemes.filter((probleme) => probleme.niveau === "ERREUR").length,
        avertissements: problemes.filter((probleme) => probleme.niveau === "AVERTISSEMENT").length,
      } });
      return;
    }
    if (chemin === "/studio/bundles" && methode === "GET") {
      await route.fulfill(options.listeEnPanne
        ? { status: 503, json: { detail: "Le service du Studio est momentanément indisponible." } }
        : { json: liste });
      return;
    }
    if (chemin === "/studio/bundles" && methode === "POST") {
      // Un bundle créé naît avec son brouillon : il s'ouvre ensuite comme « bundle-neuf ».
      const corps = requete.postDataJSON();
      etat.creations.push(corps);
      const cree = bundleDeLaListe("bundle-neuf", corps.nom, { description: corps.description });
      liste = [cree, ...liste];
      await route.fulfill({ status: 201, json: cree });
      return;
    }
    const unBundle = /^\/studio\/bundles\/([^/]+)$/.exec(chemin);
    if (unBundle && methode === "GET") {
      const trouve = liste.find((bundle) => bundle.id === unBundle[1]) ?? bundleDeLaListe(unBundle[1] ?? "", "Bundle");
      await route.fulfill({ json: trouve });
      return;
    }
    if (unBundle && methode === "PATCH") {
      const corps = requete.postDataJSON();
      liste = liste.map((bundle) => (bundle.id === unBundle[1] ? { ...bundle, statut: corps.statut } : bundle));
      await route.fulfill({ json: liste.find((bundle) => bundle.id === unBundle[1]) });
      return;
    }
    if (unBundle && methode === "DELETE") {
      liste = liste.filter((bundle) => bundle.id !== unBundle[1]);
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (chemin === "/studio/presets" && methode === "GET") {
      await route.fulfill({ json: [{
        id: "preset-m3", slug: "rosmaster-m3-pro", nom: "ROSMASTER M3 Pro", famille: "rosmaster-m3-pro", constructeur: "Yahboom",
        description: "La composition de référence du M3 Pro.", spec: { nodes: [], edges: [] }, statut: "published", ordre: 1, revision: 1,
      }] });
      return;
    }
    await route.fulfill({ json: [] });
  });
  return etat;
}

/** Ce qui écrirait : un enregistrement, une publication, un déploiement. */
export function ecritures(requetes: readonly string[]): string[] {
  return requetes.filter((requete) => !requete.startsWith("GET ") && !requete.endsWith("/auth/me"));
}

export const ecranLarge = (page: Page) => (page.viewportSize()?.width || 0) >= 1100;

/** Un modèle dont les identifiants sont remplacés par leur rang d'apparition : on compare la composition, pas les tirages au hasard. */
export function sansIdentifiants(modele: Modele) {
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
export async function deposer(page: Page, carte: string, sur: Locator, decalage: { x: number; y: number } | "centre") {
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
export async function ajusterALEcran(page: Page) {
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
export async function regler(page: Page, etiquette: string, valeur: string) {
  const champ = page.getByRole("complementary", { name: "Propriétés" }).getByLabel(etiquette, { exact: true });
  await champ.fill(valeur);
  await champ.press("Tab");
}

export const noeud = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
export const zoneNommee = (page: Page, nom: string) => page.locator(".react-flow__node-zone", { has: page.locator(".ec-zone__titre strong", { hasText: new RegExp(`^${nom}$`) }) });
export const blocNomme = (page: Page, nom: string) => page.locator(".react-flow__node-composant", { has: page.locator(".ec-noeud__titre strong", { hasText: new RegExp(`^${nom}$`) }) });

