import {
  NOMS_PAR_DEFAUT,
  PREFIXES_DES_CODES,
  TYPE_DE_L_UNITE_STANDARD,
  TYPE_DE_LA_SALLE,
  fabriquerElement,
  fabriquerPremiereUnite,
  fabriquerSalle,
  fabriquerStructureDUneUnite,
  reglagesParDefaut,
  type ValeursDUnElement,
} from "./fabriques";
import {
  PREFIXES_DES_IDENTIFIANTS,
  PREFIXE_DES_LIAISONS,
  codeDepuisNom,
  type NouvelIdentifiant,
} from "./identifiants";
import { SORTES_DE_STRUCTURE, typeDuCatalogue, verifierModele, type CatalogueIndexe } from "./regles";
import {
  SORTES,
  type EnTeteDuBundle,
  type Element,
  type EtatStudio,
  type Liaison,
  type ModeleBundle,
  type Position,
  type Refus,
  type Sorte,
  type TypeCite,
} from "./types";

/**
 * La bibliothèque des opérations du modèle (conception du lot L1, partie 4.2).
 *
 * C'est le seul chemin par lequel un bundle change dans le navigateur : le
 * canevas, la palette, l'arborescence, l'inspecteur, le menu « Ajouter » et le
 * clavier passent tous par ici. Aucune règle métier ne reste dans un composant
 * visuel.
 *
 * Chaque opération est une fonction pure : elle reçoit l'état (le modèle et sa
 * mise en page) et un geste, et rend soit le nouvel état et ce qui a changé,
 * soit un refus qui ne change rien. Elle ne modifie jamais l'état reçu : elle
 * en fabrique un nouveau, qui partage avec l'ancien tout ce qui n'a pas bougé.
 * C'est ce qui rend « annuler » exact (historique.ts).
 *
 * Après chaque geste, les règles du modèle (regles.ts) relisent l'état
 * proposé. Un geste est refusé s'il ajoute une faute que l'état de départ
 * n'avait pas : un brouillon déjà fautif (une reprise, par exemple) reste ainsi
 * modifiable, et c'est la vérification qui montre ce qu'il reste à corriger.
 */

/** Ce dont les opérations ont besoin en plus de l'état. */
export interface ContexteDesOperations {
  /** Le catalogue servi par le serveur, indexé (regles.ts). */
  readonly catalogue: CatalogueIndexe;
  /** La fabrique des identifiants neufs (identifiants.ts). */
  readonly nouvelIdentifiant: NouvelIdentifiant;
}

/** Les champs qu'un formulaire peut régler sur un élément. */
export interface ChampsReglables {
  readonly nom?: string;
  readonly code?: string;
  readonly description?: string;
  readonly type?: TypeCite;
  readonly reglages?: Readonly<Record<string, unknown>>;
}

/**
 * Un geste, sous la forme des cas partagés avec le serveur (le champ
 * `operation` dit lequel) : on peut ainsi jouer un cas tel qu'il est écrit.
 */
export type Geste =
  | {
    readonly operation: "ajouter";
    readonly sorte: Sorte;
    readonly type?: TypeCite;
    readonly parent: string | null;
    readonly valeurs?: ValeursDUnElement;
    readonly position?: Position;
  }
  | { readonly operation: "regler"; readonly id: string; readonly champs: ChampsReglables }
  | { readonly operation: "reglerBundle"; readonly champs: Partial<EnTeteDuBundle> }
  | { readonly operation: "placer"; readonly id: string; readonly position: Position }
  | { readonly operation: "mettreEnPage"; readonly blocs: Readonly<Record<string, Position>> }
  | { readonly operation: "emboiter"; readonly id: string; readonly parent: string | null; readonly rang?: number }
  | { readonly operation: "supprimer"; readonly id: string }
  | { readonly operation: "relier"; readonly source: string; readonly destination: string }
  | { readonly operation: "delier"; readonly liaison: string };

/** Ce qu'un geste a changé, pour l'afficher et pour le dire (« 3 éléments retirés »). */
export interface Changements {
  readonly ajoutes: readonly string[];
  readonly modifies: readonly string[];
  readonly retires: readonly string[];
  readonly liaisonsAjoutees: readonly string[];
  readonly liaisonsRetirees: readonly string[];
}

export type ResultatDUnGeste =
  | { readonly accepte: true; readonly etat: EtatStudio; readonly changements: Changements }
  | { readonly accepte: false; readonly refus: Refus; readonly tousLesRefus: readonly Refus[] };

const AUCUN_CHANGEMENT: Changements = { ajoutes: [], modifies: [], retires: [], liaisonsAjoutees: [], liaisonsRetirees: [] };

/** Les blocs qui ont une position à eux ; les unités et leurs canaux se placent seuls dans leur composant. */
export const SORTES_AVEC_POSITION: readonly Sorte[] = [SORTES.ZONE, SORTES.SALLE, SORTES.SERVICE, SORTES.APPLICATION];

/** Les sortes qui citent un type du catalogue ; les autres n'en portent jamais (format). */
export const SORTES_AVEC_TYPE: readonly Sorte[] = [SORTES.ZONE, SORTES.SALLE, SORTES.SERVICE, SORTES.APPLICATION, SORTES.UNITE];
/** Les sortes qui ont des réglages ; le format les refuse aux autres. */
const SORTES_AVEC_REGLAGES: readonly Sorte[] = [SORTES.ZONE, SORTES.CANAL_RECEPTION, SORTES.CANAL_EMISSION];

function changements(partiel: Partial<Changements>): Changements {
  return { ...AUCUN_CHANGEMENT, ...partiel };
}

function accepte(etat: EtatStudio, partiel: Partial<Changements>): ResultatDUnGeste {
  return { accepte: true, etat, changements: changements(partiel) };
}

/** Le geste ne change rien : on rend le même état, que l'historique n'enregistre pas. */
function inchange(etat: EtatStudio): ResultatDUnGeste {
  return { accepte: true, etat, changements: AUCUN_CHANGEMENT };
}

function cleDuRefus(refus: Refus): string {
  return `${refus.code}|${refus.element ?? ""}`;
}

/**
 * Relit l'état proposé : accepté s'il n'ajoute aucune faute à l'état de départ,
 * refusé sinon, avec la première faute ajoutée (celle que l'écran affiche).
 */
function controler(avant: EtatStudio, apres: EtatStudio, contexte: ContexteDesOperations,
                   partiel: Partial<Changements>): ResultatDUnGeste {
  const deja = new Set(verifierModele(avant.modele, contexte.catalogue).map(cleDuRefus));
  // Le modèle de départ dit quels codes sont figés : un geste ne peut pas les changer.
  const nouveaux = verifierModele(apres.modele, contexte.catalogue, { avant: avant.modele })
    .filter((refus) => !deja.has(cleDuRefus(refus)));
  const premier = nouveaux[0];
  if (premier) return { accepte: false, refus: premier, tousLesRefus: nouveaux };
  return accepte(apres, partiel);
}

function avecModele(etat: EtatStudio, modele: Partial<ModeleBundle>): EtatStudio {
  return { ...etat, modele: { ...etat.modele, ...modele } };
}

function trouver(etat: EtatStudio, id: string): Element | undefined {
  return etat.modele.elements.find((element) => element.id === id);
}

/** L'unité qui contient ce qui pend à `parent`, s'il y en a une : c'est la portée du code d'un élément de structure. */
function uniteQuiContient(parId: ReadonlyMap<string, Element>, parent: string | null): string | null {
  const vus = new Set<string>();
  let courant = parent ? parId.get(parent) : undefined;
  while (courant && !vus.has(courant.id)) {
    if (courant.sorte === SORTES.UNITE) return courant.id;
    vus.add(courant.id);
    courant = courant.parent ? parId.get(courant.parent) : undefined;
  }
  return null;
}

/**
 * Un code tiré du nom qui ne soit pas déjà pris dans sa portée : `_2`, `_3`...
 * s'ajoute au besoin. Un code donné explicitement n'est jamais changé : s'il
 * est pris, la règle CODE_EN_DOUBLE le refuse avec sa raison.
 */
function codeLibre(elements: readonly Element[], sorte: Sorte, parent: string | null, voulu: string): string {
  const parId = new Map(elements.map((element) => [element.id, element]));
  const structure = SORTES_DE_STRUCTURE.includes(sorte);
  const unite = structure ? uniteQuiContient(parId, parent) : null;
  const pris = new Set(elements
    .filter((element) => (structure
      ? SORTES_DE_STRUCTURE.includes(element.sorte) && uniteQuiContient(parId, element.parent) === unite
      : !SORTES_DE_STRUCTURE.includes(element.sorte)))
    .map((element) => element.code));
  if (!pris.has(voulu)) return voulu;
  let rang = 2;
  while (pris.has(`${voulu}_${rang}`)) rang += 1;
  return `${voulu}_${rang}`;
}

/** Le nom proposé d'un élément neuf : celui de son type au catalogue, sinon celui de sa sorte. */
function nomParDefaut(sorte: Sorte, type: TypeCite | undefined, contexte: ContexteDesOperations): string {
  const definition = type ? typeDuCatalogue(contexte.catalogue, type.code, type.version) : undefined;
  if (!definition) return NOMS_PAR_DEFAUT[sorte];
  // « Zone robot » devient « Robot » : le cadre dit déjà que c'est une zone.
  if (sorte === SORTES.ZONE && definition.nom.startsWith("Zone ")) {
    const reste = definition.nom.slice("Zone ".length);
    return reste.charAt(0).toUpperCase() + reste.slice(1);
  }
  return definition.nom;
}

/** Le type d'un élément neuf : celui du geste, ou celui que la sorte a toujours. */
function typeDUnElementNeuf(sorte: Sorte, type: TypeCite | undefined): TypeCite | undefined {
  if (!SORTES_AVEC_TYPE.includes(sorte)) return undefined;
  if (type) return type;
  if (sorte === SORTES.SALLE) return TYPE_DE_LA_SALLE;
  if (sorte === SORTES.UNITE) return TYPE_DE_L_UNITE_STANDARD;
  if (sorte === SORTES.ZONE) return undefined;
  // Un service ou une application se choisit toujours par son type dans la palette.
  throw new Error(`Ajouter un élément ${sorte} demande son type du catalogue.`);
}

/** Ajouter un élément, avec ce qui naît avec lui, en un seul geste. */
export function ajouter(etat: EtatStudio, geste: Extract<Geste, { operation: "ajouter" }>,
                        contexte: ContexteDesOperations): ResultatDUnGeste {
  const { sorte, parent, valeurs = {}, position } = geste;
  const type = typeDUnElementNeuf(sorte, geste.type);
  const nom = valeurs.nom ?? nomParDefaut(sorte, type, contexte);
  const elements = etat.modele.elements;
  const code = valeurs.code ?? codeLibre(elements, sorte, parent,
    sorte === SORTES.SALLE ? PREFIXES_DES_CODES[SORTES.SALLE] : codeDepuisNom(PREFIXES_DES_CODES[sorte], nom));
  const sansNom = sorte === SORTES.TRAITEMENT || sorte === SORTES.INTERFACE;
  const element = fabriquerElement({
    id: contexte.nouvelIdentifiant(PREFIXES_DES_IDENTIFIANTS[sorte]),
    sorte,
    parent,
    code,
    nom: sansNom && valeurs.nom === undefined ? undefined : nom,
    description: valeurs.description || undefined,
    type,
    reglages: SORTES_AVEC_REGLAGES.includes(sorte) ? valeurs.reglages ?? reglagesParDefaut(sorte) : undefined,
  });

  const crees: Element[] = [element];
  if (sorte === SORTES.ZONE && !elements.some((autre) => autre.sorte === SORTES.SALLE)) {
    // La première zone pose la salle : toutes les unités du bundle s'y retrouveront.
    crees.push(fabriquerSalle(contexte.nouvelIdentifiant));
  }
  if (sorte === SORTES.SERVICE || sorte === SORTES.APPLICATION) {
    // Le code de l'unité vient de celui du composant : comme lui, il ne double jamais un code pris.
    crees.push(...fabriquerPremiereUnite(element, contexte.nouvelIdentifiant,
      (voulu) => codeLibre([...elements, element], SORTES.UNITE, element.id, voulu)));
  }
  if (sorte === SORTES.UNITE) {
    crees.push(...fabriquerStructureDUneUnite(element.id, contexte.nouvelIdentifiant));
  }

  const blocs = position && SORTES_AVEC_POSITION.includes(sorte)
    ? { ...etat.miseEnPage.blocs, [element.id]: position }
    : etat.miseEnPage.blocs;
  const apres: EtatStudio = {
    modele: { ...etat.modele, elements: [...elements, ...crees] },
    miseEnPage: blocs === etat.miseEnPage.blocs ? etat.miseEnPage : { ...etat.miseEnPage, blocs },
  };
  return controler(etat, apres, contexte, { ajoutes: crees.map((cree) => cree.id) });
}

/** Une valeur écrite avec ses clés triées : deux objets égaux s'écrivent pareil, dans n'importe quel ordre. */
function canonique(valeur: unknown): string {
  return JSON.stringify(valeur, (_cle, contenu: unknown) => {
    if (contenu === null || typeof contenu !== "object" || Array.isArray(contenu)) return contenu;
    const objet = contenu as Record<string, unknown>;
    return Object.fromEntries(Object.keys(objet).sort().map((cle) => [cle, objet[cle]]));
  });
}

function memeValeur(a: unknown, b: unknown): boolean {
  return canonique(a) === canonique(b);
}

/** Régler le nom, le code, la description, le type ou les réglages d'un élément. */
export function regler(etat: EtatStudio, geste: Extract<Geste, { operation: "regler" }>,
                       contexte: ContexteDesOperations): ResultatDUnGeste {
  const element = trouver(etat, geste.id);
  if (!element) return inchange(etat);
  const { champs } = geste;
  const nom = champs.nom ?? element.nom;
  // Une description vidée disparaît du document plutôt que d'y rester vide.
  const description = champs.description !== undefined ? champs.description : element.description;
  const type = SORTES_AVEC_TYPE.includes(element.sorte) ? champs.type ?? element.type : undefined;
  const reglages = SORTES_AVEC_REGLAGES.includes(element.sorte) ? champs.reglages ?? element.reglages : undefined;
  // On repart de l'élément sans ses champs réglables, puis on pose ceux qui ont une valeur.
  const { nom: _nom, description: _description, type: _type, reglages: _reglages, ...fixe } = element;
  const suivant: Element = {
    ...fixe,
    code: champs.code ?? element.code,
    ...(nom !== undefined ? { nom } : {}),
    ...(description ? { description } : {}),
    ...(type ? { type } : {}),
    ...(reglages ? { reglages } : {}),
  };
  if (memeValeur(suivant, element)) return inchange(etat);
  const apres = avecModele(etat, {
    elements: etat.modele.elements.map((autre) => (autre === element ? suivant : autre)),
  });
  return controler(etat, apres, contexte, { modifies: [element.id] });
}

/** Régler l'en-tête du bundle : son nom, son code, sa description. */
export function reglerBundle(etat: EtatStudio, geste: Extract<Geste, { operation: "reglerBundle" }>): ResultatDUnGeste {
  const actuel = etat.modele.bundle;
  const description = geste.champs.description !== undefined ? geste.champs.description : actuel.description;
  const suivant: EnTeteDuBundle = {
    code: geste.champs.code ?? actuel.code,
    nom: geste.champs.nom ?? actuel.nom,
    ...(description ? { description } : {}),
  };
  if (memeValeur(suivant, actuel)) return inchange(etat);
  // L'en-tête n'a pas de règle de placement : le serveur contrôle sa forme à l'enregistrement.
  return accepte(avecModele(etat, { bundle: suivant }), { modifies: ["bundle"] });
}

/** Déplacer un bloc dans son parent : seule la mise en page change, jamais le modèle. */
export function placer(etat: EtatStudio, geste: Extract<Geste, { operation: "placer" }>): ResultatDUnGeste {
  const element = trouver(etat, geste.id);
  if (!element || !SORTES_AVEC_POSITION.includes(element.sorte)) return inchange(etat);
  const actuelle = etat.miseEnPage.blocs[geste.id];
  if (actuelle && actuelle.x === geste.position.x && actuelle.y === geste.position.y) return inchange(etat);
  return accepte({
    ...etat,
    miseEnPage: { ...etat.miseEnPage, blocs: { ...etat.miseEnPage.blocs, [geste.id]: geste.position } },
  }, { modifies: [geste.id] });
}

/**
 * Remplacer toute la mise en page d'un coup (le bouton « Ranger ») : un seul
 * geste, qu'on annule comme les autres. Le modèle ne change pas. Seuls les
 * blocs qui existent et qui ont une place à eux sont gardés.
 */
export function mettreEnPage(etat: EtatStudio, geste: Extract<Geste, { operation: "mettreEnPage" }>): ResultatDUnGeste {
  const places = new Set(etat.modele.elements
    .filter((element) => SORTES_AVEC_POSITION.includes(element.sorte))
    .map((element) => element.id));
  const blocs = Object.fromEntries(Object.entries(geste.blocs).filter(([id]) => places.has(id)));
  if (memeValeur(blocs, etat.miseEnPage.blocs)) return inchange(etat);
  const modifies = [...new Set([...Object.keys(blocs), ...Object.keys(etat.miseEnPage.blocs)])]
    .filter((id) => !memeValeur(blocs[id], etat.miseEnPage.blocs[id]));
  return accepte({ ...etat, miseEnPage: { ...etat.miseEnPage, blocs } }, { modifies });
}

/** Les identifiants d'un élément et de tous ses descendants. */
function sousArbre(elements: readonly Element[], id: string): Set<string> {
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

/** Les liaisons qui touchent un ensemble d'éléments. */
function liaisonsTouchees(liaisons: readonly Liaison[], ids: ReadonlySet<string>): Liaison[] {
  return liaisons.filter((liaison) => ids.has(liaison.source) || ids.has(liaison.destination));
}

export interface ApercuDEmboitement {
  readonly element: Element;
  readonly ancienParent: string | null;
  readonly nouveauParent: string | null;
  /** Les liaisons des canaux qui changent de place avec l'élément. En L1, elles restent valides. */
  readonly liaisonsConcernees: readonly Liaison[];
  /** Ce que donnerait le geste, sans rien appliquer. */
  readonly resultat: ResultatDUnGeste;
}

/** Changer de parent, en un seul geste ; `rang` dit sa place parmi ses nouveaux frères. */
export function emboiter(etat: EtatStudio, geste: Extract<Geste, { operation: "emboiter" }>,
                         contexte: ContexteDesOperations): ResultatDUnGeste {
  const element = trouver(etat, geste.id);
  if (!element || (element.parent === geste.parent && geste.rang === undefined)) return inchange(etat);
  const deplace: Element = { ...element, parent: geste.parent };
  const autres = etat.modele.elements.filter((autre) => autre !== element);
  let elements: Element[];
  if (geste.rang === undefined) {
    elements = etat.modele.elements.map((autre) => (autre === element ? deplace : autre));
  } else {
    // L'ordre des frères est l'ordre de la liste : on range l'élément devant
    // le frère qui occupe ce rang, ou après le dernier.
    const freres = autres.filter((autre) => autre.parent === geste.parent);
    const devant = freres[geste.rang];
    const dernier = freres[freres.length - 1];
    const index = devant ? autres.indexOf(devant) : dernier ? autres.indexOf(dernier) + 1 : autres.length;
    elements = [...autres.slice(0, index), deplace, ...autres.slice(index)];
  }
  // Sa position était relative à l'ancien parent : il prend une place calculée dans le nouveau.
  const { [element.id]: _ancienne, ...blocs } = etat.miseEnPage.blocs;
  const miseEnPage = element.id in etat.miseEnPage.blocs ? { ...etat.miseEnPage, blocs } : etat.miseEnPage;
  return controler(etat, { modele: { ...etat.modele, elements }, miseEnPage }, contexte, { modifies: [element.id] });
}

/** L'aperçu d'un changement de parent (spécification 11.7) : rien ne bouge avant la confirmation. */
export function apercuDEmboitement(etat: EtatStudio, id: string, parent: string | null,
                                   contexte: ContexteDesOperations): ApercuDEmboitement | null {
  const element = trouver(etat, id);
  if (!element) return null;
  return {
    element,
    ancienParent: element.parent,
    nouveauParent: parent,
    liaisonsConcernees: liaisonsTouchees(etat.modele.liaisons, sousArbre(etat.modele.elements, id)),
    resultat: emboiter(etat, { operation: "emboiter", id, parent }, contexte),
  };
}

export interface ConsequencesDUneSuppression {
  /** L'élément, ses descendants, et la salle si c'est la dernière zone qui part. */
  readonly elements: readonly Element[];
  readonly liaisons: readonly Liaison[];
}

/** Ce que retirerait la suppression d'un élément (spécification 12.7), avant toute confirmation. */
export function consequencesDUneSuppression(etat: EtatStudio, id: string): ConsequencesDUneSuppression {
  const { elements, liaisons } = etat.modele;
  if (!elements.some((element) => element.id === id)) return { elements: [], liaisons: [] };
  const retires = sousArbre(elements, id);
  const restantes = elements.filter((element) => !retires.has(element.id));
  if (!restantes.some((element) => element.sorte === SORTES.ZONE)) {
    // La dernière zone emporte la salle : elle ne reste que tant que le bundle a une zone.
    for (const salle of restantes.filter((element) => element.sorte === SORTES.SALLE)) retires.add(salle.id);
  }
  return {
    elements: elements.filter((element) => retires.has(element.id)),
    liaisons: liaisonsTouchees(liaisons, retires),
  };
}

/** Supprimer un élément, ses enfants et leurs liaisons, en un seul geste. */
export function supprimer(etat: EtatStudio, geste: Extract<Geste, { operation: "supprimer" }>,
                          contexte: ContexteDesOperations): ResultatDUnGeste {
  const consequences = consequencesDUneSuppression(etat, geste.id);
  if (consequences.elements.length === 0) return inchange(etat);
  const retires = new Set(consequences.elements.map((element) => element.id));
  const liaisonsRetirees = new Set(consequences.liaisons.map((liaison) => liaison.id));
  const blocs = Object.fromEntries(Object.entries(etat.miseEnPage.blocs).filter(([id]) => !retires.has(id)));
  const apres: EtatStudio = {
    modele: {
      ...etat.modele,
      elements: etat.modele.elements.filter((element) => !retires.has(element.id)),
      liaisons: consequences.liaisons.length > 0
        ? etat.modele.liaisons.filter((liaison) => !liaisonsRetirees.has(liaison.id))
        : etat.modele.liaisons,
    },
    miseEnPage: { ...etat.miseEnPage, blocs },
  };
  return controler(etat, apres, contexte, {
    retires: [...retires],
    liaisonsRetirees: [...liaisonsRetirees],
  });
}

/** Relier un canal d'émission à un canal de réception. */
export function relier(etat: EtatStudio, geste: Extract<Geste, { operation: "relier" }>,
                       contexte: ContexteDesOperations): ResultatDUnGeste {
  const liaison: Liaison = {
    id: contexte.nouvelIdentifiant(PREFIXE_DES_LIAISONS),
    source: geste.source,
    destination: geste.destination,
  };
  const apres = avecModele(etat, { liaisons: [...etat.modele.liaisons, liaison] });
  return controler(etat, apres, contexte, { liaisonsAjoutees: [liaison.id] });
}

/** Retirer une liaison seule, sans toucher aux canaux. */
export function delier(etat: EtatStudio, geste: Extract<Geste, { operation: "delier" }>): ResultatDUnGeste {
  if (!etat.modele.liaisons.some((liaison) => liaison.id === geste.liaison)) return inchange(etat);
  return accepte(avecModele(etat, {
    liaisons: etat.modele.liaisons.filter((liaison) => liaison.id !== geste.liaison),
  }), { liaisonsRetirees: [geste.liaison] });
}

/** Applique un geste, quel qu'il soit : le point d'entrée unique des écrans. */
export function appliquerGeste(etat: EtatStudio, geste: Geste, contexte: ContexteDesOperations): ResultatDUnGeste {
  switch (geste.operation) {
    case "ajouter": return ajouter(etat, geste, contexte);
    case "regler": return regler(etat, geste, contexte);
    case "reglerBundle": return reglerBundle(etat, geste);
    case "placer": return placer(etat, geste);
    case "mettreEnPage": return mettreEnPage(etat, geste);
    case "emboiter": return emboiter(etat, geste, contexte);
    case "supprimer": return supprimer(etat, geste, contexte);
    case "relier": return relier(etat, geste, contexte);
    case "delier": return delier(etat, geste);
  }
}
