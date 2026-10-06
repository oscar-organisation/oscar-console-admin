import type { Element, Liaison, ModeleBundle } from "./types";

/**
 * Ce qui a changé entre deux modèles d'un même bundle : les éléments ajoutés,
 * retirés, modifiés, et les liaisons ajoutées ou retirées. La fenêtre de
 * conflit s'en sert pour dire ce qui diffère « de chaque côté » : ce que j'ai
 * fait depuis la dernière version enregistrée, et ce que l'autre poste a fait
 * depuis la même version (conception du lot L1, partie 6.3). Rien n'est
 * fusionné : la personne choisit.
 */

export interface Differences {
  readonly ajoutes: readonly Element[];
  readonly retires: readonly Element[];
  readonly modifies: readonly Element[];
  readonly liaisonsAjoutees: readonly Liaison[];
  readonly liaisonsRetirees: readonly Liaison[];
  /** Le nom, le code ou la description du bundle ont changé. */
  readonly enTeteModifiee: boolean;
}

/** Une valeur écrite avec ses clés triées : deux objets égaux s'écrivent pareil, dans n'importe quel ordre. */
function canonique(valeur: unknown): string {
  return JSON.stringify(valeur, (_cle, contenu: unknown) => {
    if (contenu === null || typeof contenu !== "object" || Array.isArray(contenu)) return contenu;
    const objet = contenu as Record<string, unknown>;
    return Object.fromEntries(Object.keys(objet).sort().map((cle) => [cle, objet[cle]]));
  });
}

/** Ce qui a changé de `avant` à `apres`. */
export function differences(avant: ModeleBundle, apres: ModeleBundle): Differences {
  const avantParId = new Map(avant.elements.map((element) => [element.id, element]));
  const apresParId = new Map(apres.elements.map((element) => [element.id, element]));
  const liaisonsAvant = new Map(avant.liaisons.map((liaison) => [liaison.id, liaison]));
  const liaisonsApres = new Map(apres.liaisons.map((liaison) => [liaison.id, liaison]));
  return {
    ajoutes: apres.elements.filter((element) => !avantParId.has(element.id)),
    retires: avant.elements.filter((element) => !apresParId.has(element.id)),
    modifies: apres.elements.filter((element) => {
      const ancien = avantParId.get(element.id);
      return ancien !== undefined && canonique(ancien) !== canonique(element);
    }),
    liaisonsAjoutees: apres.liaisons.filter((liaison) => !liaisonsAvant.has(liaison.id)),
    liaisonsRetirees: avant.liaisons.filter((liaison) => !liaisonsApres.has(liaison.id)),
    enTeteModifiee: canonique(avant.bundle) !== canonique(apres.bundle),
  };
}

/** Vrai si rien n'a changé. */
export function aucuneDifference(ecarts: Differences): boolean {
  return ecarts.ajoutes.length + ecarts.retires.length + ecarts.modifies.length
    + ecarts.liaisonsAjoutees.length + ecarts.liaisonsRetirees.length === 0 && !ecarts.enTeteModifiee;
}
