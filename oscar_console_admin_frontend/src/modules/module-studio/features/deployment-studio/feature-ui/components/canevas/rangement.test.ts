import { describe, expect, it } from "vitest";
import { brouillonDeReference, brouillonRepris, contexteDeTest, figer } from "../../../donnees-de-test";
import { FORMAT_DE_LA_MISE_EN_PAGE, type MiseEnPage, type ModeleBundle } from "../../../feature-domain/modele/types";
import { disposer, MESURES, type NoeudDuCanevas } from "./disposition";
import { miseEnPageALOuverture, ranger } from "./rangement";

/**
 * La disposition automatique (bouton « Ranger », bundle repris ou venu sans
 * mise en page) : toujours la même pour le même modèle, les zones dans le sens
 * de la donnée, des blocs en grille qui ne se chevauchent jamais.
 */

const catalogue = contexteDeTest().catalogue;
const SANS_MISE_EN_PAGE: MiseEnPage = figer({ format: FORMAT_DE_LA_MISE_EN_PAGE, blocs: {} });

function rangeEtDispose(modele: ModeleBundle, indice: MiseEnPage = SANS_MISE_EN_PAGE) {
  return disposer(modele, ranger(modele, indice), catalogue);
}

/** La position d'un nœud sur le canevas entier : la sienne, plus celles de ses parents. */
function absolue(noeuds: readonly NoeudDuCanevas[], id: string): { x: number; y: number; largeur: number } {
  const parId = new Map(noeuds.map((noeud) => [noeud.id, noeud]));
  let noeud = parId.get(id);
  const largeur = noeud?.width ?? 0;
  let [x, y] = [0, 0];
  while (noeud) {
    x += noeud.position.x;
    y += noeud.position.y;
    noeud = noeud.parentId ? parId.get(noeud.parentId) : undefined;
  }
  return { x, y, largeur };
}

describe("le rangement automatique", () => {
  it("range toujours de la même façon le même modèle", () => {
    const premier = ranger(figer(brouillonDeReference.modele));
    const second = ranger(figer(brouillonDeReference.modele));
    expect(second).toEqual(premier);
    expect(Object.keys(premier.blocs).sort()).toEqual(["app-01", "sal-01", "svc-01", "svc-02", "zon-01", "zon-02", "zon-03"]);
  });

  it("met les zones dans le sens de la donnée : la liaison va de gauche à droite", () => {
    const { noeuds } = rangeEtDispose(brouillonDeReference.modele);
    // L'application web émet vers le robot : sa zone vient d'abord ; le serveur, sans liaison, en dernier.
    const zones = noeuds.filter((noeud) => noeud.type === "zone").sort((a, b) => a.position.x - b.position.x);
    expect(zones.map((zone) => zone.id)).toEqual(["zon-03", "zon-01", "zon-02"]);
    // La sortie de l'application (bord droit) est à gauche de l'entrée du service (bord gauche).
    const application = absolue(noeuds, "app-01");
    const service = absolue(noeuds, "svc-01");
    expect(application.x + application.largeur).toBeLessThan(service.x);
  });

  it("met les zones d'application à gauche, puis les machines, puis la zone Externe, même sans liaison", () => {
    const sansLiaison = figer({ ...brouillonDeReference.modele, liaisons: [], elements: [
      ...brouillonDeReference.modele.elements,
      { id: "zon-ext", sorte: "ZONE_ENVIRONNEMENT_EXECUTION", parent: null, code: "ZONE_ENVIRONNEMENT_EXECUTION_EXTERNE",
        nom: "Externe", type: { code: "TYPE_ENVIRONNEMENT_EXECUTION_EXTERNE", version: "1.0.0" },
        reglages: { exigence: "EXIGENCE_ACTIVATION_ENVIRONNEMENT_OBLIGATOIRE" } },
    ] } as ModeleBundle);
    // L'indice met l'Externe tout à gauche et la zone web tout à droite : le groupe l'emporte sur l'indice.
    const indice: MiseEnPage = { format: FORMAT_DE_LA_MISE_EN_PAGE, blocs: { "zon-ext": { x: 0, y: 0 }, "zon-03": { x: 5000, y: 0 } } };
    const range = ranger(sansLiaison, indice);
    const ordre = ["zon-01", "zon-02", "zon-03", "zon-ext"].sort((a, b) => (range.blocs[a]?.x ?? 0) - (range.blocs[b]?.x ?? 0));
    expect(ordre).toEqual(["zon-03", "zon-01", "zon-02", "zon-ext"]);
  });

  it("aligne les zones et leurs blocs sur une grille régulière, sans chevauchement", () => {
    for (const brouillon of [brouillonDeReference, brouillonRepris]) {
      const { noeuds } = rangeEtDispose(brouillon.modele, brouillon.mise_en_page);
      const zones = noeuds.filter((noeud) => noeud.type === "zone");
      expect(new Set(zones.map((zone) => zone.position.y))).toEqual(new Set([MESURES.hautDesZones]));
      for (const zone of zones) {
        const blocs = noeuds.filter((noeud) => noeud.parentId === zone.id);
        for (const bloc of blocs) {
          // Chaque bloc commence sur une colonne de la grille, sous l'en-tête de sa zone.
          expect((bloc.position.x - MESURES.margeDeZone) % (MESURES.largeurDuComposant + MESURES.espaceEntreComposants)).toBe(0);
          expect(bloc.position.y).toBeGreaterThanOrEqual(MESURES.enTeteDeZone);
        }
        for (const a of blocs) {
          for (const b of blocs) {
            if (a === b) continue;
            const separes = a.position.x + (a.width ?? 0) <= b.position.x || b.position.x + (b.width ?? 0) <= a.position.x
              || a.position.y + (a.height ?? 0) <= b.position.y || b.position.y + (b.height ?? 0) <= a.position.y;
            expect(separes, `${a.id} et ${b.id}`).toBe(true);
          }
        }
      }
      // Les zones se suivent, à espaces réguliers.
      const parGauche = [...zones].sort((a, b) => a.position.x - b.position.x);
      for (let rang = 1; rang < parGauche.length; rang += 1) {
        const avant = parGauche[rang - 1];
        expect(parGauche[rang]?.position.x).toBe((avant?.position.x ?? 0) + (avant?.width ?? 0) + MESURES.espaceEntreZones);
      }
    }
  });

  it("ne prend de l'ancienne mise en page que l'ordre, jamais les places", () => {
    const { modele, mise_en_page: ancienne } = brouillonRepris;
    const range = ranger(modele, ancienne);
    // Aucune place de l'ancien éditeur n'est gardée telle quelle pour un bloc de zone.
    const gardees = Object.entries(range.blocs).filter(([id, position]) => {
      const avant = ancienne.blocs[id];
      return avant !== undefined && avant.x === position.x && avant.y === position.y && avant.y > MESURES.enTeteDeZone * 2;
    });
    expect(gardees).toEqual([]);
    // L'ordre, lui, suit l'indice : deux blocs d'une même zone, inversés dans l'indice, s'inversent.
    const zoneAvecDeux = modele.elements.find((zone) => modele.elements
      .filter((element) => element.parent === zone.id && element.sorte.startsWith("INSTANCE_")).length >= 2);
    if (!zoneAvecDeux) throw new Error("la reprise de test devrait avoir une zone à deux blocs");
    const [premier, second] = modele.elements.filter((element) => element.parent === zoneAvecDeux.id
      && element.sorte.startsWith("INSTANCE_")).map((element) => element.id);
    if (!premier || !second) throw new Error("deux blocs attendus");
    const dansCetOrdre: MiseEnPage = { format: FORMAT_DE_LA_MISE_EN_PAGE, blocs: { [premier]: { x: 0, y: 0 }, [second]: { x: 0, y: 500 } } };
    const alEnvers: MiseEnPage = { format: FORMAT_DE_LA_MISE_EN_PAGE, blocs: { [premier]: { x: 0, y: 500 }, [second]: { x: 0, y: 0 } } };
    const haut = (mise: MiseEnPage, id: string) => mise.blocs[id]?.y ?? 0;
    const droit = ranger(modele, dansCetOrdre);
    const inverse = ranger(modele, alEnvers);
    expect(haut(droit, premier) < haut(droit, second) || (droit.blocs[premier]?.x ?? 0) < (droit.blocs[second]?.x ?? 0)).toBe(true);
    expect(haut(inverse, second) < haut(inverse, premier) || (inverse.blocs[second]?.x ?? 0) < (inverse.blocs[premier]?.x ?? 0)).toBe(true);
  });
});

describe("la mise en page à l'ouverture", () => {
  it("garde celle du serveur, sauf pour une reprise pas encore enregistrée ou une mise en page vide", () => {
    // Un brouillon enregistré garde la mise en page de la personne qui l'a composé.
    expect(miseEnPageALOuverture(brouillonDeReference)).toBe(brouillonDeReference.mise_en_page);
    // Une reprise de l'ancienne console s'ouvre rangée.
    expect(miseEnPageALOuverture(brouillonRepris)).toEqual(ranger(brouillonRepris.modele, brouillonRepris.mise_en_page));
    expect(miseEnPageALOuverture(brouillonRepris)).not.toEqual(brouillonRepris.mise_en_page);
    // Sans aucune mise en page (un bundle venu de l'API), aussi.
    const sansMiseEnPage = { ...brouillonDeReference, mise_en_page: SANS_MISE_EN_PAGE };
    expect(miseEnPageALOuverture(sansMiseEnPage)).toEqual(ranger(brouillonDeReference.modele));
  });
});
