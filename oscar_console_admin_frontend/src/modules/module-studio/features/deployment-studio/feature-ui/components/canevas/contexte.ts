import { createContext, useContext } from "react";
import type { Sorte } from "../../../feature-domain/modele/types";
import { memeSelection, type Selection } from "../../selection";
import { ID_DU_CADRE } from "./disposition";

/**
 * Ce que les blocs du canevas ont besoin de savoir pour se dessiner et pour
 * répondre aux gestes : ce qui est sélectionné, les parents compatibles à
 * éclairer pendant un glissement, celui qui recevra l'objet (encadré), les
 * canaux qu'on peut relier pendant qu'on tire une liaison. React Flow dessine
 * les blocs lui-même : ce contexte leur donne ces informations sans les
 * recopier dans chaque nœud.
 */
export interface EtatDuCanevas {
  readonly selection: Selection | null;
  /** Les éléments à éclairer : ceux qui peuvent recevoir l'objet glissé, ou que propose un refus. */
  readonly compatibles: ReadonlySet<string>;
  /** L'élément sous le pointeur, qui recevra l'objet si on le lâche ici. */
  readonly cible: string | null;
  /** Pendant qu'on tire une liaison : les canaux qui l'accepteraient (les autres s'estompent). */
  readonly canauxReliables: ReadonlySet<string> | null;
  /** Le nombre de problèmes de chaque élément, après « Vérifier » ou la reprise. */
  readonly problemes: ReadonlyMap<string, number>;
  /** Les éléments qui viennent d'apparaître : ils s'animent brièvement. */
  readonly nouveaux: ReadonlySet<string>;
  readonly onSelectionner: (selection: Selection) => void;
  /** Un bouton du canevas ajoute un élément de cette sorte dans ce parent (« Ajouter une unité », « Entrée »...). */
  readonly onAjouter: (sorte: Sorte, parent: string) => void;
  /** Le bouton d'une liaison choisie la retire. */
  readonly onRetirerUneLiaison: (id: string) => void;
}

export const ContexteDuCanevas = createContext<EtatDuCanevas>({
  selection: null,
  compatibles: new Set(),
  cible: null,
  canauxReliables: null,
  problemes: new Map(),
  nouveaux: new Set(),
  onSelectionner: () => undefined,
  onAjouter: () => undefined,
  onRetirerUneLiaison: () => undefined,
});

export function useCanevas(): EtatDuCanevas {
  return useContext(ContexteDuCanevas);
}

/** Les marques d'un élément, en classes : sélectionné, compatible, cible, nouveau. */
export function useMarques(selection: Selection): string {
  const etat = useContext(ContexteDuCanevas);
  const id = selection.sorte === "bundle" ? ID_DU_CADRE : selection.id;
  return [
    memeSelection(selection, etat.selection) ? "ec-selectionne" : "",
    etat.compatibles.has(id) ? "ec-compatible" : "",
    etat.cible === id ? "ec-cible" : "",
    etat.nouveaux.has(id) ? "ec-nouveau" : "",
  ].filter(Boolean).join(" ");
}

/**
 * La marque des éléments qui peuvent recevoir un dépôt : le canevas lit la
 * pile des éléments sous le pointeur par cet attribut. Le cadre du bundle la
 * porte avec son identifiant de nœud, ID_DU_CADRE.
 */
export const ATTRIBUT_DE_CIBLE = "data-cible-id";
