import { expect, test } from "@playwright/test";
import {
  bundleDeLaListe,
  deposer,
  ecranLarge,
  ecritures,
  noeud,
  REFERENCE,
  serveur,
} from "./outils-studio";

/**
 * Le Studio, étape I6 du lot L1 : la liste des bundles, au serveur seul ; le
 * passage de la liste au nouveau Studio ; la reprise d'un brouillon local,
 * proposée et jamais imposée ; le conflit d'enregistrement, montré sans rien
 * écraser ; et la recette R1.6 : enregistrer et vérifier ne publient ni ne
 * déploient rien. L'API est simulée (e2e/outils-studio.ts).
 */

test("le Studio est accessible depuis la navigation de la console", async ({ page }) => {
  await serveur(page);
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "Bundles de déploiement" })).toBeVisible();
  if ((page.viewportSize()?.width || 0) > 760) await expect(page.getByTestId("nav-studio")).toBeVisible();
});

test("la liste montre chaque bundle tel que le serveur le dit, et ouvre le nouveau Studio", async ({ page }) => {
  test.skip(!ecranLarge(page), "Le canevas demande un écran large.");
  await serveur(page, { bundles: [
    bundleDeLaListe("bundle-reference", "Téléopération du M3", {
      description: "Piloter le M3 au clavier et à la manette, avec la vidéo.", component_count: 3, unit_count: 3, robot_count: 2,
      published_version: { id: "v-4", bundle_id: "bundle-reference", numero: 4, statut: "published" },
    }),
    bundleDeLaListe("bundle-ancien", "Accueil et inventaire du magasin", { format_brouillon: "ancien", component_count: 6, unit_count: 6 }),
  ] });
  await page.goto("/studio");
  const reference = page.locator(".project-card", { hasText: "Téléopération du M3" });
  await expect(reference).toContainText("Brouillon");
  await expect(reference).toContainText("3 composants · 3 unités");
  await expect(reference).toContainText("Dernière version publiée : 4");
  await expect(reference).toContainText("2 robots");
  const ancien = page.locator(".project-card", { hasText: "Accueil et inventaire du magasin" });
  await expect(ancien).toContainText("Ancien format : il s’ouvrira par la reprise, sans rien perdre.");
  await expect(ancien).toContainText("Jamais publié");
  // Aucun « projet » à l'écran de la liste : on parle de bundles.
  await expect(page.locator("main")).not.toContainText(/projet/i);

  await page.getByRole("button", { name: "Ouvrir le bundle Accueil et inventaire du magasin" }).click();
  await expect(page).toHaveURL(/\/studio\/bundle-ancien$/);
  await expect(page.locator(".project-heading strong")).toHaveText("Accueil et inventaire du magasin");
  // L'ancien éditeur reste joignable, discrètement, par le menu du bundle.
  await page.getByRole("button", { name: "Actions sur le bundle" }).click();
  await expect(page.getByRole("menuitem", { name: "Ancien éditeur" })).toHaveAttribute("href", "/studio/bundle-ancien/ancien");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Revenir à la liste des bundles" }).click();
  await expect(page).toHaveURL(/\/studio$/);
});

test("un bundle se crée au serveur, vide ou depuis un préset, et s'ouvre dans le nouveau Studio", async ({ page }) => {
  test.skip(!ecranLarge(page), "Le canevas demande un écran large.");
  const etat = await serveur(page, { bundles: [] });
  await page.goto("/studio");
  await expect(page.getByText("Aucun bundle pour l’instant")).toBeVisible();
  await page.getByRole("button", { name: "Nouveau bundle" }).first().click();
  const fenetre = page.locator(".project-dialog");
  // Sans nom, la création dit quoi faire et n'envoie rien.
  await fenetre.getByRole("button", { name: "Créer et ouvrir" }).click();
  await expect(fenetre).toContainText("Donnez un nom au bundle");
  expect(etat.creations).toEqual([]);
  // Le champ « Environnement principal » de l'ancienne liste n'existe plus : les zones se posent dans le canevas.
  await expect(fenetre.getByText("Environnement principal")).toHaveCount(0);
  await fenetre.getByLabel("Nom du bundle").fill("Téléopération du M3");
  await fenetre.getByLabel("Description").fill("Piloter le M3 au clavier et à la manette, avec la vidéo.");
  await fenetre.getByRole("button", { name: /Préset du catalogue/ }).click();
  await page.getByRole("dialog").getByText("ROSMASTER M3 Pro").first().click();
  await expect(fenetre.getByRole("button", { name: /Préset : ROSMASTER M3 Pro/ })).toBeVisible();
  await fenetre.getByRole("button", { name: /Bundle vide/ }).click();
  await fenetre.getByRole("button", { name: "Créer et ouvrir" }).click();
  await expect(page).toHaveURL(/\/studio\/bundle-neuf$/);
  expect(etat.creations).toEqual([{ nom: "Téléopération du M3", description: "Piloter le M3 au clavier et à la manette, avec la vidéo.", depart: { sorte: "VIDE" } }]);
  await expect(page.getByRole("region", { name: "Pour commencer" })).toBeVisible();
});

test("si le serveur ne répond pas, la liste le dit avec sa cause, et ne montre aucune liste gardée", async ({ page }) => {
  await serveur(page, { listeEnPanne: true });
  await page.addInitScript(() => {
    // Une ancienne liste gardée par l'ancien Studio : elle ne doit jamais s'afficher.
    window.localStorage.setItem("oscar.studio.projects.v2:user-studio:org-e2e", JSON.stringify([{ id: "fantome", name: "Bundle fantôme" }]));
  });
  await page.goto("/studio");
  const alerte = page.getByRole("alert");
  await expect(alerte).toContainText("La liste des bundles n’a pas pu se charger.");
  await expect(alerte).toContainText("Le service du Studio est momentanément indisponible.");
  await expect(alerte.getByRole("button", { name: "Réessayer" })).toBeVisible();
  await expect(page.getByText("Bundle fantôme")).toHaveCount(0);
});

test("archiver range un bundle sans l'effacer ; supprimer demande confirmation", async ({ page }) => {
  test.skip(!ecranLarge(page), "Les actions des cartes se testent sur un écran large.");
  await serveur(page, { bundles: [bundleDeLaListe("bundle-a", "Inventaire de nuit"), bundleDeLaListe("bundle-b", "Accueil du matin")] });
  await page.goto("/studio");
  await page.getByRole("button", { name: "Archiver le bundle Inventaire de nuit" }).click();
  await expect(page.locator(".project-card", { hasText: "Inventaire de nuit" })).toHaveCount(0);
  await page.getByRole("button", { name: "Afficher les bundles archivés (1)" }).click();
  await expect(page.locator(".project-card", { hasText: "Inventaire de nuit" })).toContainText("Archivé");
  await page.getByRole("button", { name: "Supprimer le bundle Accueil du matin" }).click();
  await expect(page.getByRole("dialog")).toContainText("Supprimer ce bundle ?");
  await page.getByRole("dialog").getByRole("button", { name: "Supprimer le bundle" }).click();
  await expect(page.locator(".project-card", { hasText: "Accueil du matin" })).toHaveCount(0);
});

test("R1.6 : composer, enregistrer et vérifier ne publient rien et ne déploient rien", async ({ page }) => {
  test.skip(!ecranLarge(page), "Le canevas demande un écran large.");
  const etat = await serveur(page);
  await page.goto("/studio/bundle-reference");
  await deposer(page, "Unité", noeud(page, "svc-02"), "centre");
  await expect(page.locator(".studio-statusbar")).toContainText("4 unités");
  await expect(page.locator(".studio-topbar .save-state")).toHaveText(/Enregistré/, { timeout: 15_000 });
  await page.locator(".studio-topbar").getByRole("button", { name: /Vérifier/ }).click();
  await expect(page.getByRole("complementary", { name: "Problèmes du bundle" })).toContainText("Le serveur n’a rien trouvé à corriger");
  // Seuls le brouillon et la vérification ont été appelés : ni /draft, ni /publish, ni /deployments.
  const ecrites = ecritures(etat.requetes);
  expect(ecrites.length).toBeGreaterThan(0);
  expect(ecrites.every((requete) => requete === "PUT /studio/bundles/bundle-reference/brouillon"
    || requete === "POST /studio/bundles/bundle-reference/brouillon/verification")).toBe(true);
  expect(etat.requetes.some((requete) => /\/draft|\/publish|\/deployments|\/validate/.test(requete))).toBe(false);
  // Le nouveau Studio n'a pas de bouton « Publier » (la publication revient au lot L9).
  await expect(page.getByRole("button", { name: /Publier/ })).toHaveCount(0);
});

test("un brouillon local est proposé à la reprise, jamais imposé : on peut le reprendre ou l'abandonner", async ({ page }) => {
  test.skip(!ecranLarge(page), "Le canevas demande un écran large.");
  const copie = JSON.parse(JSON.stringify(REFERENCE.modele));
  copie.elements.find((element: { id: string }) => element.id === "zon-01").nom = "Robot renommé sur ce poste";
  const etat = await serveur(page);
  await page.addInitScript((valeur) => {
    // La copie de secours d'une visite d'avant, partie de la même révision que le serveur.
    for (const organisation of ["org-e2e", "global"]) {
      window.localStorage.setItem(`oscar.studio.brouillon-local.v1:user-studio:${organisation}:bundle-reference`, valeur);
    }
  }, JSON.stringify({ revision_de_base: REFERENCE.revision, modele: copie, mise_en_page: REFERENCE.mise_en_page, ecrit_le: "2026-10-06T01:30:00.000Z" }));
  await page.goto("/studio/bundle-reference");
  const fenetre = page.getByRole("dialog");
  await expect(fenetre).toContainText("Reprendre vos modifications ?");
  await expect(fenetre).toContainText("n’ont pas été enregistrées");
  await expect(fenetre.getByRole("link", { name: "Télécharger mes modifications" })).toHaveAttribute("download", /brouillon-local-/);
  // Tant que la personne n'a pas choisi, c'est la version du serveur qui s'affiche, et rien ne part.
  await expect(noeud(page, "zon-01")).toContainText("Robot M3 Pro");
  expect(ecritures(etat.requetes)).toEqual([]);
  await fenetre.getByRole("button", { name: "Les reprendre" }).click();
  await expect(noeud(page, "zon-01")).toContainText("Robot renommé sur ce poste");
  await expect(page.locator(".studio-topbar .save-state")).toHaveText(/Enregistré/, { timeout: 15_000 });
  expect(etat.enregistrements.at(-1)?.modele.elements.find((element) => element.id === "zon-01")?.nom).toBe("Robot renommé sur ce poste");
  // Reprise annulable comme tout geste.
  await page.locator(".studio-topbar").getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(noeud(page, "zon-01")).toContainText("Robot M3 Pro");
});

test("un conflit d'enregistrement est montré de chaque côté, rien n'est écrasé, et la personne choisit", async ({ page }) => {
  test.skip(!ecranLarge(page), "Le canevas demande un écran large.");
  // L'autre poste a ajouté une zone serveur de secours pendant qu'on travaillait ici.
  const ailleurs = JSON.parse(JSON.stringify(REFERENCE.modele));
  ailleurs.elements.push({ id: "zon-secours", sorte: "ZONE_ENVIRONNEMENT_EXECUTION", parent: null, code: "ZONE_ENVIRONNEMENT_EXECUTION_SECOURS",
    nom: "Serveur de secours", type: { code: "TYPE_ENVIRONNEMENT_EXECUTION_SERVEUR", version: "1.0.0" },
    reglages: { exigence: "EXIGENCE_ACTIVATION_ENVIRONNEMENT_OBLIGATOIRE" } });
  const etat = await serveur(page, { conflit: { modele: ailleurs, revision: REFERENCE.revision + 1 } });
  await page.goto("/studio/bundle-reference");
  // Ici : la zone robot renommée.
  await noeud(page, "zon-01").locator(".ec-zone__entete").click();
  const champ = page.getByRole("complementary", { name: "Propriétés" }).getByLabel("Nom de la zone", { exact: true });
  await champ.fill("Robot de l'accueil");
  await champ.press("Tab");
  const fenetre = page.getByRole("dialog");
  await expect(fenetre).toContainText("Ce bundle a été enregistré ailleurs", { timeout: 15_000 });
  await expect(page.locator(".studio-topbar .save-state")).toHaveText(/Conflit avec un autre poste/);
  await expect(fenetre).toContainText("Vos changements, sur ce poste");
  await expect(fenetre).toContainText("1 modifié : « Robot de l'accueil »");
  await expect(fenetre).toContainText(`Ceux de l’autre poste (révision ${REFERENCE.revision + 1})`);
  await expect(fenetre).toContainText("1 élément ajouté : « Serveur de secours »");
  // Un seul envoi, refusé : rien n'a écrasé la version de l'autre poste.
  expect(etat.requetes.filter((requete) => requete.startsWith("PUT ")).length).toBe(1);
  // « Ouvrir la version du serveur » : celle de l'autre poste s'affiche, la nôtre est écartée.
  await fenetre.getByRole("button", { name: "Ouvrir la version du serveur" }).click();
  await expect(page.locator(".ec-zone__titre strong", { hasText: "Serveur de secours" })).toBeVisible();
  await expect(noeud(page, "zon-01")).toContainText("Robot M3 Pro");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
