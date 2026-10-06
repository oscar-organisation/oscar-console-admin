import {
  SORTES_AVEC_TYPE,
  apercuDEmboitement,
  appliquerGeste,
  type ContexteDesOperations,
  type Geste,
} from "./operations";
import { NOMS_DES_SORTES, PARENTS_PERMIS } from "./regles";
import {
  SORTES,
  SORTE_DU_BUNDLE,
  type CatalogueStudio,
  type Element,
  type EtatStudio,
  type ModeleBundle,
  type Position,
  type Refus,
  type Sorte,
  type TypeDuCatalogue,
} from "./types";

/**
 * Ce que l'on peut faire à un endroit du bundle : ce qu'un élément peut
 * recevoir, où un élément peut aller, quel parent reçoit un dépôt.
 *
 * Les écrans (palette, menu « Ajouter », inspecteur, canevas) posent ces
 * questions ici. Aucune règle n'est réécrite : chaque réponse vient des
 * opérations du modèle, jouées « à blanc » sur l'état présent, sans rien
 * changer. Une règle qui change dans regles.ts change donc aussi ce que les
 * écrans proposent.
 */

/** Les sortes qu'on peut changer de parent à la souris ou par l'inspecteur (conception, partie 4.2). */
export const SORTES_QUI_CHANGENT_DE_PARENT: readonly Sorte[] = [
  SORTES.SERVICE, SORTES.APPLICATION, SORTES.UNITE, SORTES.CANAL_RECEPTION, SORTES.CANAL_EMISSION,
];

/** Le geste qui ajoute un type du catalogue dans un parent (`null` : le bundle). */
export function gesteDAjout(type: TypeDuCatalogue, parent: string | null, position?: Position): Geste {
  const sorte = type.sorte as Sorte;
  return {
    operation: "ajouter",
    sorte,
    // Bande, bus et canaux sont au catalogue pour la palette, mais le modèle ne leur donne pas de type.
    ...(SORTES_AVEC_TYPE.includes(sorte) ? { type: { code: type.code, version: type.version } } : {}),
    parent,
    ...(position ? { position } : {}),
  };
}

/** Le refus qu'essuierait cet ajout, ou `null` s'il serait accepté. Rien ne change. */
export function refusDUnAjout(etat: EtatStudio, type: TypeDuCatalogue, parent: string | null,
                              contexte: ContexteDesOperations): Refus | null {
  const resultat = appliquerGeste(etat, gesteDAjout(type, parent), contexte);
  return resultat.accepte ? null : resultat.refus;
}

/** Les types de la palette, dans l'ordre de leur famille, puis de leur rang dans la famille. */
export function typesDeLaPalette(catalogue: CatalogueStudio): TypeDuCatalogue[] {
  const rangDeLaFamille = new Map(catalogue.familles.map((famille) => [famille.code, famille.ordre]));
  return catalogue.types
    .filter((type) => type.dans_la_palette)
    .sort((a, b) => (rangDeLaFamille.get(a.famille) ?? 0) - (rangDeLaFamille.get(b.famille) ?? 0)
      || a.ordre - b.ordre);
}

/**
 * Ce que le menu « Ajouter » propose dans un parent : les types de la palette
 * dont ce parent est un parent autorisé, et que les règles acceptent ici, à
 * cet instant (conception, partie 4.2 : enfants permis seulement).
 */
export function enfantsPermis(etat: EtatStudio, parent: string | null, catalogue: CatalogueStudio,
                              contexte: ContexteDesOperations): TypeDuCatalogue[] {
  const element = parent === null ? null : etat.modele.elements.find((candidat) => candidat.id === parent);
  if (parent !== null && !element) return [];
  const sorteDuParent = element ? element.sorte : SORTE_DU_BUNDLE;
  return typesDeLaPalette(catalogue)
    .filter((type) => type.parents_autorises.includes(sorteDuParent))
    .filter((type) => refusDUnAjout(etat, type, parent, contexte) === null);
}

/**
 * Les parents qui accepteraient ce type, à cet instant (`null` : le bundle) :
 * pendant un glissement depuis la palette, ce sont eux qui s'éclairent.
 */
export function parentsQuiAcceptent(etat: EtatStudio, type: TypeDuCatalogue,
                                    contexte: ContexteDesOperations): (string | null)[] {
  const permis = PARENTS_PERMIS[type.sorte as Sorte] ?? [];
  const candidats: (string | null)[] = [
    ...(permis.includes(null) ? [null] : []),
    ...etat.modele.elements.filter((element) => permis.includes(element.sorte)).map((element) => element.id),
  ];
  return candidats.filter((parent) => refusDUnAjout(etat, type, parent, contexte) === null);
}

/** Le refus qu'essuierait la suppression de cet élément (la salle, la structure d'une unité), ou `null`. */
export function refusDUneSuppression(etat: EtatStudio, id: string, contexte: ContexteDesOperations): Refus | null {
  const resultat = appliquerGeste(etat, { operation: "supprimer", id }, contexte);
  return resultat.accepte ? null : resultat.refus;
}

/** Le refus qu'essuierait une liaison de cette sortie vers cette entrée, ou `null`. Rien ne change. */
export function refusDUneLiaison(etat: EtatStudio, source: string, destination: string,
                                 contexte: ContexteDesOperations): Refus | null {
  const resultat = appliquerGeste(etat, { operation: "relier", source, destination }, contexte);
  return resultat.accepte ? null : resultat.refus;
}

/**
 * Pendant qu'on tire une liaison depuis un canal : les canaux du sens opposé
 * qui l'accepteraient. Ce sont eux qui s'éclairent ; les autres s'estompent.
 */
export function canauxReliables(etat: EtatStudio, depuis: string, contexte: ContexteDesOperations): Set<string> {
  const canal = etat.modele.elements.find((element) => element.id === depuis);
  if (!canal || (canal.sorte !== SORTES.CANAL_EMISSION && canal.sorte !== SORTES.CANAL_RECEPTION)) return new Set();
  const sortie = canal.sorte === SORTES.CANAL_EMISSION;
  const opposes = etat.modele.elements.filter((element) => element.sorte === (sortie ? SORTES.CANAL_RECEPTION : SORTES.CANAL_EMISSION));
  return new Set(opposes
    .filter((autre) => (sortie
      ? refusDUneLiaison(etat, canal.id, autre.id, contexte)
      : refusDUneLiaison(etat, autre.id, canal.id, contexte)) === null)
    .map((autre) => autre.id));
}

/** Les identifiants d'un élément et de tout ce qu'il contient, lui compris. */
export function descendants(elements: readonly Element[], id: string): Set<string> {
  const retenus = new Set([id]);
  let ajoutes = true;
  while (ajoutes) {
    ajoutes = false;
    for (const element of elements) {
      if (element.parent !== null && retenus.has(element.parent) && !retenus.has(element.id)) {
        retenus.add(element.id);
        ajoutes = true;
      }
    }
  }
  return retenus;
}

/**
 * Les parents vers lesquels un élément peut aller, d'après les règles : chaque
 * candidat de la bonne sorte est essayé à blanc, et seuls ceux qui
 * l'acceptent restent. Vide pour une sorte qui ne change pas de parent.
 */
export function parentsPossibles(etat: EtatStudio, id: string, contexte: ContexteDesOperations): Element[] {
  const { elements } = etat.modele;
  const element = elements.find((candidat) => candidat.id === id);
  if (!element || !SORTES_QUI_CHANGENT_DE_PARENT.includes(element.sorte)) return [];
  const permis = PARENTS_PERMIS[element.sorte];
  const interdits = descendants(elements, id);
  return elements.filter((candidat) => permis.includes(candidat.sorte)
    && candidat.id !== element.parent
    && !interdits.has(candidat.id)
    && apercuDEmboitement(etat, id, candidat.id, contexte)?.resultat.accepte === true);
}

/**
 * Le parent d'un dépôt sur le canevas : il se lit SOUS LE POINTEUR, jamais
 * dans l'ordre de la liste (conception, partie 4.2).
 *
 * `pile` est la liste des éléments sous le pointeur, du plus profond au plus
 * large (une unité, son service, sa zone, puis le cadre du bundle, noté
 * `null`). Le parent est le premier de cette pile qui est d'une sorte pouvant
 * recevoir l'objet : une unité lâchée sur une autre unité va dans leur
 * service, un canal lâché sur une ligne de canal va dans son bus. Si aucun ne
 * l'est, c'est le plus profond : les règles refuseront alors le dépôt, avec la
 * raison qui convient à cet endroit (un canal de réception lâché dans un bus
 * d'émission, un service lâché hors de toute zone).
 */
export function parentDuDepot(pile: readonly (string | null)[], sorte: Sorte, modele: ModeleBundle): string | null {
  const parId = new Map(modele.elements.map((element) => [element.id, element]));
  const permis = PARENTS_PERMIS[sorte];
  const sorteDe = (id: string | null): Sorte | null | undefined => (id === null ? null : parId.get(id)?.sorte);
  const trouve = pile.find((id) => {
    const sorteDuCandidat = sorteDe(id);
    return sorteDuCandidat !== undefined && permis.includes(sorteDuCandidat);
  });
  if (trouve !== undefined) return trouve;
  const plusProfond = pile.find((id) => sorteDe(id) !== undefined);
  return plusProfond ?? null;
}

/** Le nom qu'un élément montre : son nom, sinon celui de sa sorte (un traitement n'a pas de nom). */
export function nomAffiche(element: Element): string {
  if (element.nom) return element.nom;
  const nom = NOMS_DES_SORTES[element.sorte][1];
  return nom.charAt(0).toUpperCase() + nom.slice(1);
}

/** Le chemin d'un élément, du bundle jusqu'à lui (spécification 12.6) : les noms, dans l'ordre. */
export function cheminDe(modele: ModeleBundle, id: string): string[] {
  const parId = new Map(modele.elements.map((element) => [element.id, element]));
  const noms: string[] = [];
  const vus = new Set<string>();
  let courant = parId.get(id);
  while (courant && !vus.has(courant.id)) {
    vus.add(courant.id);
    noms.unshift(nomAffiche(courant));
    courant = courant.parent ? parId.get(courant.parent) : undefined;
  }
  return [modele.bundle.nom, ...noms];
}
