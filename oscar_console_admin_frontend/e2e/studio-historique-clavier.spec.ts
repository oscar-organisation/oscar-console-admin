import { expect, test, type Page } from "@playwright/test";
import { blocNomme, ecranLarge, ecritures, noeud, REFERENCE, serveur, type Serveur } from "./outils-studio";

/**
 * Le nouveau Studio, étape I5 du lot L1 : annuler et rétablir (recette R1.4),
 * les gestes essentiels au clavier seul (recette R1.7), et « Vérifier ».
 * L'API est simulée (e2e/outils-studio.ts).
 */

/** Le dernier brouillon envoyé au serveur, une fois l'écran revenu à « Enregistré ». */
async function dernierEnregistre(page: Page, etat: Serveur) {
  await expect(page.locator(".studio-topbar .save-state")).toHaveText(/Enregistré/, { timeout: 15_000 });
  const dernier = etat.enregistrements.at(-1);
  if (!dernier) throw new Error("aucun enregistrement");
  return { modele: dernier.modele, mise_en_page: dernier.mise_en_page };
}

/**
 * Choisit un élément par l'arborescence, d'un clic : le panneau de gauche est
 * toujours à l'écran, quel que soit le cadrage du canevas. `nom` est le nom
 * affiché, `sorte` le mot qui le suit (« zone d'environnement », « unité »...).
 */
async function choisirDansLaStructure(page: Page, nom: string, sorte?: string, rang = 0) {
  await page.getByRole("tab", { name: "Structure" }).click();
  const nomAccessible = sorte ? `${nom}, ${sorte}` : new RegExp(`^${nom},`);
  await page.getByRole("tree", { name: "Structure du bundle" }).getByRole("treeitem", { name: nomAccessible, exact: true }).nth(rang)
    .locator(":scope > .ec-arbre__ligne").click();
}

test("R1.4 : cinquante gestes à l'écran, tout annuler, tout rétablir : chaque fois l'état exact", async ({ page }) => {
  test.skip(!ecranLarge(page), "Le canevas demande un écran large.");
  test.setTimeout(150_000);
  const etat = await serveur(page);
  await page.goto("/studio/bundle-reference");
  const canevas = page.getByTestId("espace-composition");
  const proprietes = page.getByRole("complementary", { name: "Propriétés" });
  const annulerBouton = page.locator(".studio-topbar").getByRole("button", { name: "Annuler", exact: true });
  const retablirBouton = page.locator(".studio-topbar").getByRole("button", { name: "Rétablir", exact: true });
  await expect(annulerBouton).toBeDisabled();

  // 20 gestes : la zone web déplacée au clavier, 8 px par appui (Maj+flèche).
  await choisirDansLaStructure(page, "Téléopération web");
  await canevas.focus();
  for (let fois = 0; fois < 20; fois += 1) await page.keyboard.press(fois % 2 === 0 ? "Shift+ArrowDown" : "Shift+ArrowRight");
  // 10 gestes : le service média renommé dix fois, chaque champ comptant quand on le quitte.
  await choisirDansLaStructure(page, "Service média du robot", "service");
  for (let fois = 1; fois <= 10; fois += 1) {
    const champ = proprietes.getByLabel("Nom affiché", { exact: true });
    await champ.fill(`Service média ${fois}`);
    await champ.press("Tab");
  }
  // 10 gestes : dix unités ajoutées au clavier (A, puis Entrée), chacune avec sa structure ;
  // flèche gauche revient au service entre deux ajouts.
  await choisirDansLaStructure(page, "Service média 10", "service");
  await canevas.focus();
  for (let fois = 0; fois < 10; fois += 1) {
    await page.keyboard.press("a");
    await expect(page.getByRole("dialog").getByRole("menuitem", { name: "Unité" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.keyboard.press("ArrowLeft");
  }
  // 5 gestes : cinq entrées ajoutées à la commande de la base, depuis ses propriétés.
  for (let fois = 0; fois < 5; fois += 1) {
    await choisirDansLaStructure(page, "Commande de la base", "unité");
    await proprietes.getByRole("button", { name: "Entrée", exact: true }).click();
  }
  // 5 gestes : cinq des unités ajoutées, supprimées après confirmation.
  for (let fois = 0; fois < 5; fois += 1) {
    await choisirDansLaStructure(page, "Unité", "unité");
    await proprietes.getByRole("button", { name: "Supprimer cet élément" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();
  }
  await expect(page.locator(".studio-statusbar")).toContainText("8 unités");
  const apresCinquante = await dernierEnregistre(page, etat);

  // Tout annuler : le brouillon envoyé est exactement celui du départ, mise en page comprise.
  await canevas.focus();
  for (let fois = 0; fois < 50; fois += 1) await page.keyboard.press("Control+z");
  await expect(annulerBouton).toBeDisabled();
  expect(await dernierEnregistre(page, etat)).toEqual({ modele: REFERENCE.modele, mise_en_page: REFERENCE.mise_en_page });
  // Tout rétablir : exactement l'état du cinquantième geste.
  for (let fois = 0; fois < 50; fois += 1) await page.keyboard.press(fois % 2 === 0 ? "Control+Shift+Z" : "Control+y");
  await expect(retablirBouton).toBeDisabled();
  expect(await dernierEnregistre(page, etat)).toEqual(apresCinquante);
  // Les boutons de la barre font de même.
  await annulerBouton.click();
  await expect(retablirBouton).toBeEnabled();
  await retablirBouton.click();
  expect(await dernierEnregistre(page, etat)).toEqual(apresCinquante);
});

test("R1.7 : les gestes essentiels se font au clavier seul, le focus toujours visible", async ({ page }) => {
  test.skip(!ecranLarge(page), "Le canevas demande un écran large.");
  test.setTimeout(90_000);
  const etat = await serveur(page);
  await page.goto("/studio/bundle-neuf");
  await expect(page.getByRole("region", { name: "Pour commencer" })).toBeVisible();
  const canevas = page.getByTestId("espace-composition");
  const focusDans = (selecteur: string) => page.evaluate((s) => Boolean(document.activeElement?.closest(s)), selecteur);
  const focusEstLeCanevas = () => page.evaluate(() => document.activeElement?.getAttribute("data-zone-clavier") === "canevas");

  // Tab parcourt la palette, puis le canevas (un seul arrêt), puis les propriétés, puis la barre du haut.
  const vus: string[] = [];
  for (let fois = 0; fois < 80 && !(await focusEstLeCanevas()); fois += 1) {
    await page.keyboard.press("Tab");
    if (await focusDans(".library-panel") && !vus.includes("palette")) vus.push("palette");
  }
  expect(await focusEstLeCanevas()).toBe(true);
  vus.push("canevas");
  // Le focus se voit : un contour plein, au moins 2 px.
  await expect(canevas).toHaveCSS("outline-style", "solid");
  expect(parseFloat(await canevas.evaluate((element) => getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(2);
  for (let fois = 0; fois < 40 && vus.length < 4; fois += 1) {
    await page.keyboard.press("Tab");
    if (await focusDans(".inspector") && !vus.includes("propriétés")) vus.push("propriétés");
    if (await focusDans(".studio-topbar") && !vus.includes("barre du haut")) vus.push("barre du haut");
  }
  expect(vus).toEqual(["palette", "canevas", "propriétés", "barre du haut"]);
  for (let fois = 0; fois < 80 && !(await focusEstLeCanevas()); fois += 1) await page.keyboard.press("Shift+Tab");

  // Ajouter : A ouvre le menu du bundle ; Entrée pose la première zone (et la salle).
  await page.keyboard.press("a");
  const menu = page.getByRole("dialog");
  await expect(menu).toContainText("Ajouter dans « Téléopération du M3 »");
  await expect(menu.getByRole("menuitem", { name: "Zone robot" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(canevas.locator(".ec-salle")).toBeVisible();
  expect(await focusEstLeCanevas()).toBe(true);
  // Dans la zone choisie, A puis Entrée : un service, avec sa première unité.
  await page.keyboard.press("a");
  await expect(page.getByRole("dialog").getByRole("menuitem", { name: "Service" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".studio-statusbar")).toContainText("1 unité");

  // Régler : Entrée ouvre ses propriétés sur le premier champ ; Entrée valide.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Propriétés" }).getByLabel("Nom affiché", { exact: true })).toBeFocused();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Service actions du robot");
  await page.keyboard.press("Enter");
  await expect(canevas.locator(".ec-noeud__titre strong")).toHaveText("Service actions du robot");
  for (let fois = 0; fois < 40 && !(await focusEstLeCanevas()); fois += 1) await page.keyboard.press("Shift+Tab");
  expect(await focusEstLeCanevas()).toBe(true);

  // Supprimer : flèche droite descend à l'unité ; Suppr ouvre la confirmation ; Entrée confirme.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("complementary", { name: "Propriétés" })).toContainText("Unité");
  await page.keyboard.press("Delete");
  // L'unité a pris le nom du service à sa naissance : « Service ».
  await expect(page.getByRole("dialog")).toContainText("Supprimer « Service » ?");
  await page.keyboard.press("Enter");
  await expect(page.locator(".studio-statusbar")).toContainText("0 unité");
  // Annuler, rétablir, annuler : l'unité revient.
  await page.keyboard.press("Control+z");
  await expect(page.locator(".studio-statusbar")).toContainText("1 unité");
  await page.keyboard.press("Control+y");
  await expect(page.locator(".studio-statusbar")).toContainText("0 unité");
  await page.keyboard.press("Control+z");
  await expect(page.locator(".studio-statusbar")).toContainText("1 unité");

  // Changer de parent : une zone serveur, puis le service y passe, après l'aperçu.
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("complementary", { name: "Propriétés" })).toContainText("Bundle de déploiement");
  await page.keyboard.press("a");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("dialog").getByRole("menuitem", { name: "Zone serveur" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".studio-statusbar")).toContainText("2 zones");
  // De la zone serveur : flèche haut (la salle), flèche haut (la zone robot), flèche droite (son service).
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("complementary", { name: "Propriétés" }).locator(".inspector__header")).toContainText("Service");
  await page.keyboard.press("Enter");
  const nouveauParent = page.getByRole("complementary", { name: "Propriétés" }).getByLabel("Nouveau parent");
  for (let fois = 0; fois < 15 && !(await nouveauParent.evaluate((element) => element === document.activeElement)); fois += 1) await page.keyboard.press("Tab");
  await expect(nouveauParent).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Déplacer « Service actions du robot » ?");
  await page.keyboard.press("Enter");
  await expect(page.locator(".ec-annonce")).toContainText("déplacé dans « Serveur »");

  // Échap libère la sélection : le bundle revient dans les propriétés.
  for (let fois = 0; fois < 40 && !(await focusEstLeCanevas()); fois += 1) await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Propriétés" })).toContainText("Bundle de déploiement");

  // Tout s'est enregistré : le service est dans la zone serveur.
  await expect(page.locator(".studio-topbar .save-state")).toHaveText(/Enregistré/, { timeout: 15_000 });
  const modele = etat.enregistrements.at(-1)?.modele;
  const serveurZone = modele?.elements.find((element) => element.nom === "Serveur");
  const service = modele?.elements.find((element) => element.nom === "Service actions du robot");
  expect(service?.parent).toBe(serveurZone?.id);
  expect(ecritures(etat.requetes).every((requete) => requete.startsWith("PUT ") && requete.endsWith("/brouillon"))).toBe(true);
});

test("Vérifier : le serveur relit le brouillon, et « Localiser » mène à l'élément en cause", async ({ page }) => {
  test.skip(!ecranLarge(page), "Le canevas demande un écran large.");
  const etat = await serveur(page, { problemes: [{
    niveau: "AVERTISSEMENT", code: "CANAL_NON_RELIE", titre: "Canal non relié",
    explication: "L'entrée « Commande de la base » ne reçoit rien.", correction: "Reliez-lui une sortie.", element: "can-01",
  }] });
  await page.goto("/studio/bundle-reference");
  const verifier = page.locator(".studio-topbar").getByRole("button", { name: /Vérifier/ });
  await verifier.click();
  const panneau = page.getByRole("complementary", { name: "Problèmes du bundle" });
  await expect(panneau).toContainText("1 point à revoir");
  await expect(panneau).toContainText("À vérifier : Canal non relié");
  await expect(verifier).toContainText("1");
  await panneau.getByRole("button", { name: "Localiser « Commande de la base »" }).click();
  await expect(page.getByRole("complementary", { name: "Propriétés" })).toContainText("Canal de réception (entrée)");
  await expect(page.locator('[data-element-id="can-01"]')).toHaveClass(/ec-selectionne/);
  // Vérifier n'écrit rien : ni brouillon (rien n'attendait), ni version, ni déploiement.
  expect(ecritures(etat.requetes)).toEqual(["POST /studio/bundles/bundle-reference/brouillon/verification"]);
});
