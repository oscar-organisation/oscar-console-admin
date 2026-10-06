import { appliquerGeste, type ContexteDesOperations, type Geste, type ResultatDUnGeste } from "./operations";
import type { EtatStudio } from "./types";

/**
 * Annuler et rétablir, par instantanés (conception du lot L1, partie 4.4).
 *
 * L'historique garde les états eux-mêmes, pas une liste d'opérations avec
 * leurs inverses : revenir en arrière, c'est reprendre l'état d'avant, tel
 * quel. On retombe donc exactement sur chaque état, par construction. La
 * mémoire reste petite parce qu'un geste ne recopie que ce qu'il change : le
 * reste est partagé entre deux états (operations.ts ne modifie jamais un état).
 *
 * Les règles :
 * - un geste, une entrée ; un geste refusé, ou qui ne change rien, n'entre pas ;
 * - un geste qui dure (un glissement, une saisie dans un champ) se montre au
 *   fur et à mesure (`previsualiser`) mais ne compte qu'une fois, quand il se
 *   termine (`conclure`) : quand on lâche le bloc, quand on quitte le champ ;
 * - cent gestes au plus ; au-delà, le plus ancien sort ;
 * - annuler n'appelle pas le serveur : l'état revenu s'enregistre ensuite
 *   comme toute modification. L'historique vit le temps de la page.
 */

export const LIMITE_DE_L_HISTORIQUE = 100;

export interface Historique {
  readonly passe: readonly EtatStudio[];
  readonly present: EtatStudio;
  readonly futur: readonly EtatStudio[];
  /** Pendant un geste qui dure : l'état d'avant ce geste, où « annuler » ramènera. */
  readonly origineDuGesteEnCours: EtatStudio | null;
}

export function creerHistorique(etat: EtatStudio): Historique {
  return { passe: [], present: etat, futur: [], origineDuGesteEnCours: null };
}

/** Termine le geste en cours, s'il y en a un : il devient une seule entrée. */
export function conclure(historique: Historique): Historique {
  const origine = historique.origineDuGesteEnCours;
  if (origine === null) return historique;
  if (origine === historique.present) return { ...historique, origineDuGesteEnCours: null };
  return {
    passe: [...historique.passe, origine].slice(-LIMITE_DE_L_HISTORIQUE),
    present: historique.present,
    futur: [],
    origineDuGesteEnCours: null,
  };
}

/** Un geste terminé : l'état d'avant entre dans le passé, le futur s'efface. */
export function pousser(historique: Historique, etat: EtatStudio): Historique {
  const termine = conclure(historique);
  if (etat === termine.present) return termine;
  return {
    passe: [...termine.passe, termine.present].slice(-LIMITE_DE_L_HISTORIQUE),
    present: etat,
    futur: [],
    origineDuGesteEnCours: null,
  };
}

/** Un geste qui dure : l'état se montre, mais n'entre dans le passé qu'à `conclure`. */
export function previsualiser(historique: Historique, etat: EtatStudio): Historique {
  return {
    ...historique,
    present: etat,
    origineDuGesteEnCours: historique.origineDuGesteEnCours ?? historique.present,
  };
}

export function peutAnnuler(historique: Historique): boolean {
  return historique.passe.length > 0
    || (historique.origineDuGesteEnCours !== null && historique.origineDuGesteEnCours !== historique.present);
}

export function peutRetablir(historique: Historique): boolean {
  return historique.futur.length > 0;
}

export function annuler(historique: Historique): Historique {
  const termine = conclure(historique);
  const precedent = termine.passe[termine.passe.length - 1];
  if (!precedent) return termine;
  return {
    passe: termine.passe.slice(0, -1),
    present: precedent,
    futur: [termine.present, ...termine.futur],
    origineDuGesteEnCours: null,
  };
}

export function retablir(historique: Historique): Historique {
  const termine = conclure(historique);
  const [suivant, ...reste] = termine.futur;
  if (!suivant) return termine;
  return {
    passe: [...termine.passe, termine.present].slice(-LIMITE_DE_L_HISTORIQUE),
    present: suivant,
    futur: reste,
    origineDuGesteEnCours: null,
  };
}

/**
 * Applique un geste à l'état présent et l'enregistre s'il est accepté et
 * change quelque chose ; un refus laisse l'historique tel quel (le même objet).
 */
export function jouerGeste(historique: Historique, geste: Geste, contexte: ContexteDesOperations):
  { readonly historique: Historique; readonly resultat: ResultatDUnGeste } {
  const resultat = appliquerGeste(historique.present, geste, contexte);
  if (!resultat.accepte) return { historique, resultat };
  return { historique: pousser(historique, resultat.etat), resultat };
}
