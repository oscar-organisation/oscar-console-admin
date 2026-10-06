import type { ModeleBundle } from "../feature-domain/modele/types";

/**
 * Ce qui est sélectionné dans l'éditeur : le bundle lui-même, un élément, ou
 * une liaison. Le canevas, l'arborescence, l'inspecteur et le clavier
 * partagent cette même sélection : choisir un élément d'un côté le montre de
 * l'autre.
 *
 * Une liaison et un élément ont chacun leur propre liste d'identifiants : on
 * dit donc toujours de quelle sorte est la chose sélectionnée.
 */
export type Selection =
  | { readonly sorte: "bundle" }
  | { readonly sorte: "element"; readonly id: string }
  | { readonly sorte: "liaison"; readonly id: string };

export const SELECTION_DU_BUNDLE: Selection = { sorte: "bundle" };

export function selectionDeLElement(id: string): Selection {
  return { sorte: "element", id };
}

export function memeSelection(a: Selection | null, b: Selection | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.sorte === "bundle" || b.sorte === "bundle") return a.sorte === b.sorte;
  return a.sorte === b.sorte && a.id === b.id;
}

/** L'élément sélectionné, s'il y en a un. */
export function idDeLElementSelectionne(selection: Selection | null): string | null {
  return selection?.sorte === "element" ? selection.id : null;
}

/** Une sélection qui vise une chose qui n'existe plus (annulée, supprimée ailleurs) revient au bundle. */
export function selectionValide(selection: Selection | null, modele: ModeleBundle): Selection | null {
  if (selection === null || selection.sorte === "bundle") return selection;
  const existe = selection.sorte === "element"
    ? modele.elements.some((element) => element.id === selection.id)
    : modele.liaisons.some((liaison) => liaison.id === selection.id);
  return existe ? selection : SELECTION_DU_BUNDLE;
}

/** La clé d'une sélection, pour la retrouver dans une liste : « bundle », « element:zon-01 », « liaison:lia-01 ». */
export function cleDeLaSelection(selection: Selection): string {
  return selection.sorte === "bundle" ? "bundle" : `${selection.sorte}:${selection.id}`;
}

/** La clé du groupe « Liaisons » de l'arborescence : il se replie, mais ne se sélectionne pas. */
export const CLE_DU_GROUPE_DES_LIAISONS = "groupe:liaisons";
