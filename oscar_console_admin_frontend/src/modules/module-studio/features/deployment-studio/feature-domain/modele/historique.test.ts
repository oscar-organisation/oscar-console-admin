import { describe, expect, it } from "vitest";
import { contexteDeTest, etatDeReference, gelerSurPlace } from "../../donnees-de-test";
import {
  LIMITE_DE_L_HISTORIQUE,
  annuler,
  conclure,
  creerHistorique,
  jouerGeste,
  peutAnnuler,
  peutRetablir,
  pousser,
  previsualiser,
  retablir,
  type Historique,
} from "./historique";
import { appliquerGeste, type Geste } from "./operations";
import { typeDuCatalogue } from "./regles";
import { SORTES, type Element, type EtatStudio, type Sorte } from "./types";

/**
 * Annuler et rétablir (recette R1.4 : cinquante gestes, tout annuler, tout
 * rétablir, et l'on retombe exactement sur chaque état).
 */

/** Un tirage pseudo-aléatoire à graine fixe (mulberry32) : la même graine rejoue la même suite. */
function tirage(graine: number): () => number {
  let etat = graine >>> 0;
  return () => {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OPERATIONS = ["ajouter", "regler", "placer", "emboiter", "supprimer", "relier", "delier"] as const;
const TYPES_DE_ZONE = ["ROBOT", "SERVEUR", "NAVIGATEUR_WEB", "SIMULATEUR"]
  .map((nom) => ({ code: `TYPE_ENVIRONNEMENT_EXECUTION_${nom}`, version: "1.0.0" }));

/** Un geste tiré au hasard parmi ceux qui ont un sens sur cet état ; il peut être refusé. */
function gesteAuHasard(etat: EtatStudio, hasard: () => number, rang: number): Geste | null {
  const choisir = <T>(liste: readonly T[]): T | undefined => liste[Math.floor(hasard() * liste.length)];
  const deSorte = (...sortes: Sorte[]): Element[] => etat.modele.elements.filter((e) => sortes.includes(e.sorte));
  const contexte = contexteDeTest();
  const recoit = (zone: Element, sorte: Sorte): boolean => Boolean(zone.type
    && typeDuCatalogue(contexte.catalogue, zone.type.code, zone.type.version)?.recoit.includes(sorte));
  const operation = choisir(OPERATIONS);
  switch (operation) {
    case "ajouter": {
      const quoi = choisir(["zone", "service", "application", "unite", "entree", "sortie"] as const);
      if (quoi === "zone") {
        const type = choisir(TYPES_DE_ZONE);
        return type ? { operation, sorte: SORTES.ZONE, type, parent: null } : null;
      }
      if (quoi === "service" || quoi === "application") {
        const sorte = quoi === "service" ? SORTES.SERVICE : SORTES.APPLICATION;
        const zone = choisir(deSorte(SORTES.ZONE).filter((z) => recoit(z, sorte)));
        const type = { code: quoi === "service" ? "TYPE_SERVICE_GENERIQUE" : "TYPE_APPLICATION_GENERIQUE", version: "1.0.0" };
        return zone ? { operation, sorte, type, parent: zone.id, valeurs: { nom: `${quoi} ${rang}` } } : null;
      }
      if (quoi === "unite") {
        const composant = choisir(deSorte(SORTES.SERVICE, SORTES.APPLICATION));
        return composant ? { operation, sorte: SORTES.UNITE, parent: composant.id, valeurs: { nom: `Unité ${rang}` } } : null;
      }
      const sorte = quoi === "entree" ? SORTES.CANAL_RECEPTION : SORTES.CANAL_EMISSION;
      const bus = choisir(deSorte(quoi === "entree" ? SORTES.BUS_RECEPTION : SORTES.BUS_EMISSION));
      return bus ? { operation, sorte, parent: bus.id, valeurs: { nom: `Canal ${rang}` } } : null;
    }
    case "regler": {
      const cible = choisir(deSorte(SORTES.ZONE, SORTES.SERVICE, SORTES.APPLICATION, SORTES.UNITE,
        SORTES.CANAL_RECEPTION, SORTES.CANAL_EMISSION));
      if (!cible) return null;
      return hasard() < 0.5
        ? { operation, id: cible.id, champs: { nom: `Nom ${rang}` } }
        : { operation, id: cible.id, champs: { description: `Réglé au geste ${rang}` } };
    }
    case "placer": {
      const bloc = choisir(deSorte(SORTES.ZONE, SORTES.SALLE, SORTES.SERVICE, SORTES.APPLICATION));
      return bloc ? { operation, id: bloc.id, position: { x: Math.round(hasard() * 900), y: Math.round(hasard() * 700) } } : null;
    }
    case "emboiter": {
      const cible = choisir(deSorte(SORTES.SERVICE, SORTES.UNITE, SORTES.CANAL_RECEPTION, SORTES.CANAL_EMISSION));
      if (!cible) return null;
      const parents = cible.sorte === SORTES.SERVICE ? deSorte(SORTES.ZONE)
        : cible.sorte === SORTES.UNITE ? deSorte(SORTES.SERVICE, SORTES.APPLICATION)
          : deSorte(cible.sorte === SORTES.CANAL_RECEPTION ? SORTES.BUS_RECEPTION : SORTES.BUS_EMISSION);
      const parent = choisir(parents.filter((p) => p.id !== cible.parent));
      return parent ? { operation, id: cible.id, parent: parent.id } : null;
    }
    case "supprimer": {
      const cible = choisir(deSorte(SORTES.ZONE, SORTES.SERVICE, SORTES.APPLICATION, SORTES.UNITE,
        SORTES.CANAL_RECEPTION, SORTES.CANAL_EMISSION));
      return cible ? { operation, id: cible.id } : null;
    }
    case "relier": {
      const source = choisir(deSorte(SORTES.CANAL_EMISSION));
      const destination = choisir(deSorte(SORTES.CANAL_RECEPTION));
      return source && destination ? { operation, source: source.id, destination: destination.id } : null;
    }
    case "delier": {
      const liaison = choisir(etat.modele.liaisons);
      return liaison ? { operation, liaison: liaison.id } : null;
    }
    default:
      return null;
  }
}

describe("annuler et rétablir", () => {
  it("cinquante gestes tirés d'une graine fixe, tout annuler puis tout rétablir : chaque état revient à l'identique, dans les deux sens", () => {
    const hasard = tirage(20261006);
    const contexte = contexteDeTest();
    let historique = creerHistorique(etatDeReference());
    // Chaque état est gardé deux fois : l'objet lui-même, et son texte au
    // moment où il est né. Revenir à l'identique, c'est retrouver les deux.
    const etats: EtatStudio[] = [historique.present];
    const textes: string[] = [JSON.stringify(historique.present)];
    const employees = new Set<string>();
    let essais = 0;
    while (etats.length <= 50 && essais < 2000) {
      essais += 1;
      const geste = gesteAuHasard(historique.present, hasard, etats.length);
      if (!geste) continue;
      const { historique: suivant, resultat } = jouerGeste(historique, geste, contexte);
      if (!resultat.accepte || suivant === historique) continue;
      // Un état figé : si un geste suivant le modifiait au lieu d'en fabriquer un nouveau, il lèverait une erreur.
      gelerSurPlace(suivant.present);
      historique = suivant;
      etats.push(historique.present);
      textes.push(JSON.stringify(historique.present));
      employees.add(geste.operation);
    }
    expect(etats).toHaveLength(51);
    // La suite couvre chaque opération.
    expect([...employees].sort()).toEqual([...OPERATIONS].sort());

    for (let rang = 50; rang >= 1; rang -= 1) {
      expect(peutAnnuler(historique)).toBe(true);
      historique = annuler(historique);
      expect(historique.present).toBe(etats[rang - 1]);
      expect(JSON.stringify(historique.present)).toBe(textes[rang - 1]);
    }
    expect(peutAnnuler(historique)).toBe(false);
    expect(annuler(historique)).toBe(historique);

    for (let rang = 1; rang <= 50; rang += 1) {
      expect(peutRetablir(historique)).toBe(true);
      historique = retablir(historique);
      expect(historique.present).toBe(etats[rang]);
      expect(JSON.stringify(historique.present)).toBe(textes[rang]);
    }
    expect(peutRetablir(historique)).toBe(false);
    expect(retablir(historique)).toBe(historique);
  });

  it("un geste refusé n'entre pas dans l'historique", () => {
    const historique = creerHistorique(etatDeReference());
    const { historique: apres, resultat } = jouerGeste(historique, {
      operation: "ajouter", sorte: SORTES.SALLE, type: { code: "COMPOSANT_SALLE_TEMPS_REEL", version: "1.0.0" }, parent: null,
    }, contexteDeTest());
    expect(resultat.accepte).toBe(false);
    expect(apres).toBe(historique);
    expect(peutAnnuler(apres)).toBe(false);
  });

  it("un geste qui ne change rien n'entre pas non plus", () => {
    const historique = creerHistorique(etatDeReference());
    const { historique: apres } = jouerGeste(historique,
      { operation: "placer", id: "zon-01", position: { x: 40, y: 120 } }, contexteDeTest());
    expect(apres).toBe(historique);
  });

  it("un glissement compte pour un geste", () => {
    const contexte = contexteDeTest();
    const depart = creerHistorique(etatDeReference());
    let historique: Historique = depart;
    // Le bloc suit le pointeur : chaque position se montre, aucune n'entre dans l'historique.
    for (const y of [130, 160, 200, 260]) {
      const resultat = appliquerGeste(historique.present, { operation: "placer", id: "zon-01", position: { x: 40, y } }, contexte);
      if (resultat.accepte) historique = previsualiser(historique, resultat.etat);
    }
    expect(historique.passe).toHaveLength(0);
    // On lâche le bloc : le glissement entier devient une seule entrée.
    historique = conclure(historique);
    expect(historique.passe).toHaveLength(1);
    expect(historique.present.miseEnPage.blocs["zon-01"]).toEqual({ x: 40, y: 260 });
    historique = annuler(historique);
    expect(historique.present).toBe(depart.present);
  });

  it("un champ compte quand on le quitte", () => {
    const contexte = contexteDeTest();
    const depart = creerHistorique(etatDeReference());
    let historique: Historique = depart;
    for (const nom of ["R", "Ro", "Robot", "Robot d'accueil"]) {
      const resultat = appliquerGeste(historique.present, { operation: "regler", id: "zon-01", champs: { nom } }, contexte);
      if (resultat.accepte) historique = previsualiser(historique, resultat.etat);
    }
    // Quitter le champ, c'est terminer le geste ; annuler ramène le nom d'avant la saisie.
    historique = conclure(historique);
    expect(historique.passe).toHaveLength(1);
    historique = annuler(historique);
    expect(historique.present.modele.elements.find((e) => e.id === "zon-01")?.nom).toBe("Robot M3 Pro");
    historique = retablir(historique);
    expect(historique.present.modele.elements.find((e) => e.id === "zon-01")?.nom).toBe("Robot d'accueil");
  });

  it("au-delà de cent gestes, le plus ancien sort", () => {
    const contexte = contexteDeTest();
    let historique = creerHistorique(etatDeReference());
    const etats = [historique.present];
    for (let rang = 1; rang <= LIMITE_DE_L_HISTORIQUE + 5; rang += 1) {
      const resultat = appliquerGeste(historique.present,
        { operation: "placer", id: "zon-01", position: { x: rang, y: rang } }, contexte);
      if (!resultat.accepte) throw new Error("placer ne se refuse pas");
      historique = pousser(historique, resultat.etat);
      etats.push(historique.present);
    }
    expect(historique.passe).toHaveLength(LIMITE_DE_L_HISTORIQUE);
    let annulations = 0;
    while (peutAnnuler(historique)) {
      historique = annuler(historique);
      annulations += 1;
    }
    expect(annulations).toBe(LIMITE_DE_L_HISTORIQUE);
    // Les cinq plus anciens sont sortis : on s'arrête au cinquième geste.
    expect(historique.present).toBe(etats[5]);
  });
});
