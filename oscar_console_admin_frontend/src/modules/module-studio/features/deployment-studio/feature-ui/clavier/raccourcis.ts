import { useEffect, useRef, type RefObject } from "react";
import type { ModeleBundle } from "../../feature-domain/modele/types";
import { cleDeLaSelection, SELECTION_DU_BUNDLE, type Selection } from "../selection";

/**
 * Le clavier du Studio (conception du lot L1, partie 6.5 ; recette R1.7) :
 * un seul jeu de règles pour le canevas et l'arborescence.
 *
 * | Touche                    | Effet                                                    |
 * |---------------------------|----------------------------------------------------------|
 * | flèches haut et bas       | élément précédent ou suivant, au même niveau             |
 * | flèche gauche, droite     | le parent ; le premier enfant                            |
 * | Entrée                    | les propriétés de l'élément, sur leur premier champ      |
 * | Échap                     | ferme ce qui est ouvert, puis libère la sélection        |
 * | A                         | le menu « Ajouter » de l'élément (enfants permis)        |
 * | Suppr (ou Retour arrière) | la confirmation de suppression, la même qu'à la souris   |
 * | Ctrl+Z (Cmd+Z)            | annuler                                                  |
 * | Ctrl+Maj+Z, Ctrl+Y        | rétablir                                                 |
 * | Maj+flèches               | déplace le bloc choisi de 8 px (un geste par appui)      |
 *
 * Les touches de navigation n'agissent que quand le canevas ou l'arborescence
 * a le focus ; annuler, rétablir et Échap agissent partout dans l'éditeur.
 * Dans un champ de saisie, toutes les touches gardent leur rôle de saisie ;
 * une fenêtre ouverte mène elle-même les siennes.
 */

/** Le pas d'un déplacement au clavier, en pixels. */
export const PAS_DU_CLAVIER = 8;

export type DirectionDeNavigation = "precedent" | "suivant" | "parent" | "enfant";

export type ActionDuClavier =
  | { readonly sorte: "annuler" }
  | { readonly sorte: "retablir" }
  | { readonly sorte: "naviguer"; readonly direction: DirectionDeNavigation }
  | { readonly sorte: "ouvrir" }
  | { readonly sorte: "fermer" }
  | { readonly sorte: "ajouter" }
  | { readonly sorte: "supprimer" }
  | { readonly sorte: "deplacer"; readonly dx: number; readonly dy: number };

/** Où se trouve le focus : là où les touches de navigation agissent, ou dans un champ. */
export type ZoneDuClavier = "canevas" | "arbre" | "champ" | "ailleurs";

export interface Touche {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/** La marque d'une zone qui reçoit les touches de navigation : `data-zone-clavier="canevas"` ou `"arbre"`. */
export const ATTRIBUT_DE_ZONE = "data-zone-clavier";

const FLECHES: Readonly<Record<string, { readonly direction: DirectionDeNavigation; readonly dx: number; readonly dy: number }>> = {
  ArrowUp: { direction: "precedent", dx: 0, dy: -1 },
  ArrowDown: { direction: "suivant", dx: 0, dy: 1 },
  ArrowLeft: { direction: "parent", dx: -1, dy: 0 },
  ArrowRight: { direction: "enfant", dx: 1, dy: 0 },
};

/** L'action d'une touche, selon l'endroit du focus ; `null` : la touche garde son rôle ordinaire. */
export function actionDeLaTouche(touche: Touche, zone: ZoneDuClavier): ActionDuClavier | null {
  if (zone === "champ") return null;
  const commande = touche.ctrlKey || touche.metaKey;
  const lettre = touche.key.toLowerCase();
  if (commande && !touche.altKey && lettre === "z") return { sorte: touche.shiftKey ? "retablir" : "annuler" };
  if (commande && !touche.altKey && lettre === "y") return { sorte: "retablir" };
  if (touche.key === "Escape") return { sorte: "fermer" };
  if (zone !== "canevas" && zone !== "arbre") return null;
  if (commande || touche.altKey) return null;
  const fleche = FLECHES[touche.key];
  if (fleche) {
    return touche.shiftKey
      ? { sorte: "deplacer", dx: fleche.dx * PAS_DU_CLAVIER, dy: fleche.dy * PAS_DU_CLAVIER }
      : { sorte: "naviguer", direction: fleche.direction };
  }
  if (touche.shiftKey) return null;
  if (touche.key === "Enter") return { sorte: "ouvrir" };
  if (lettre === "a") return { sorte: "ajouter" };
  if (touche.key === "Delete" || touche.key === "Backspace") return { sorte: "supprimer" };
  return null;
}

/** La zone d'un élément de la page : un champ de saisie, le canevas, l'arborescence, ou ailleurs. */
export function zoneDe(cible: EventTarget | null): ZoneDuClavier {
  if (!(cible instanceof Element)) return "ailleurs";
  if (cible instanceof HTMLInputElement || cible instanceof HTMLTextAreaElement || cible instanceof HTMLSelectElement
      || (cible instanceof HTMLElement && cible.isContentEditable)) return "champ";
  // Un bouton ou un lien posé dans le canevas (le zoom, la légende, « Ajouter une unité ») garde ses touches.
  if (cible.closest('button, a, [role="button"], [role="menuitem"]')) return "ailleurs";
  const zone = cible.closest(`[${ATTRIBUT_DE_ZONE}]`)?.getAttribute(ATTRIBUT_DE_ZONE);
  return zone === "canevas" || zone === "arbre" ? zone : "ailleurs";
}

/**
 * La sélection voisine dans une direction : le frère précédent ou suivant
 * (dans l'ordre de la liste, qui est l'ordre des frères), le parent, le
 * premier enfant. Au premier niveau, après les zones et la salle, viennent
 * les liaisons. `null` : il n'y a rien dans cette direction.
 */
export function voisin(modele: ModeleBundle, selection: Selection, direction: DirectionDeNavigation): Selection | null {
  const premierNiveau: Selection[] = [
    ...modele.elements.filter((element) => element.parent === null).map((element): Selection => ({ sorte: "element", id: element.id })),
    ...modele.liaisons.map((liaison): Selection => ({ sorte: "liaison", id: liaison.id })),
  ];
  if (selection.sorte === "bundle") return direction === "enfant" ? premierNiveau[0] ?? null : null;

  let freres: Selection[];
  let parent: Selection;
  if (selection.sorte === "liaison") {
    freres = premierNiveau;
    parent = SELECTION_DU_BUNDLE;
  } else {
    const element = modele.elements.find((candidat) => candidat.id === selection.id);
    if (!element) return null;
    freres = element.parent === null
      ? premierNiveau
      : modele.elements.filter((candidat) => candidat.parent === element.parent).map((candidat): Selection => ({ sorte: "element", id: candidat.id }));
    parent = element.parent === null ? SELECTION_DU_BUNDLE : { sorte: "element", id: element.parent };
  }

  if (direction === "parent") return parent;
  if (direction === "enfant") {
    if (selection.sorte !== "element") return null;
    const enfant = modele.elements.find((candidat) => candidat.parent === selection.id);
    return enfant ? { sorte: "element", id: enfant.id } : null;
  }
  // Ici, la sélection est un élément ou une liaison : on la retrouve parmi ses frères par sa clé.
  const cle = cleDeLaSelection(selection);
  const rang = freres.findIndex((frere) => cleDeLaSelection(frere) === cle);
  const suivant = freres[direction === "suivant" ? rang + 1 : rang - 1];
  return rang >= 0 && suivant ? suivant : null;
}

/**
 * Écoute le clavier dans l'éditeur (`racine`) et transmet chaque action
 * reconnue ; la touche ne fait alors rien d'autre. Une action vient de la zone
 * qui a le focus (zoneDe).
 */
export function useRaccourcis(racine: RefObject<HTMLElement | null>, agir: (action: ActionDuClavier, zone: ZoneDuClavier) => void): void {
  // La dernière fonction reçue sert toujours, sans réattacher l'écouteur à chaque rendu.
  const agirMaintenant = useRef(agir);
  useEffect(() => {
    agirMaintenant.current = agir;
  });
  useEffect(() => {
    const element = racine.current;
    if (!element) return undefined;
    const auClavier = (evenement: KeyboardEvent) => {
      // Une fenêtre ouverte (menu, aperçu, confirmation) mène elle-même ses touches.
      if (evenement.defaultPrevented || (evenement.target instanceof Element && evenement.target.closest('[role="dialog"]'))) return;
      const zone = zoneDe(evenement.target);
      const action = actionDeLaTouche(evenement, zone);
      if (!action) return;
      evenement.preventDefault();
      agirMaintenant.current(action, zone);
    };
    element.addEventListener("keydown", auClavier);
    return () => element.removeEventListener("keydown", auClavier);
  }, [racine]);
}
