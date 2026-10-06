import { MarkerType, Position, type Edge, type Node } from "@xyflow/react";
import { libelleDuFormat, libelleDuTypeDeCanal } from "../../../feature-domain/modele/canaux";
import { TYPE_DE_LA_ZONE_EXTERNE, typeDuCatalogue, type CatalogueIndexe } from "../../../feature-domain/modele/regles";
import {
  EXIGENCE_FACULTATIVE,
  SORTES,
  type Element,
  type Liaison,
  type MiseEnPage,
  type ModeleBundle,
  type Position as PositionDuBloc,
  type Sorte,
} from "../../../feature-domain/modele/types";

/**
 * Du modèle et de sa mise en page aux nœuds et aux liaisons de React Flow
 * (conception du lot L1, partie 6.4).
 *
 * Le canevas emboîte les blocs comme le modèle : le cadre du bundle contient
 * les zones et la salle, une zone contient ses services et ses applications.
 * React Flow 12 le permet par `parentId` ; sa documentation (version
 * installée 12.11.6) dit que la position d'un enfant est relative à son
 * parent, et que les parents doivent précéder leurs enfants dans la liste des
 * nœuds. La mise en page du Studio range justement des positions relatives au
 * parent : elles passent telles quelles.
 *
 * Les unités et leurs canaux ne sont pas des nœuds : ils se rangent seuls dans
 * leur composant, entrées à gauche, sorties à droite. Chaque canal porte une
 * poignée de React Flow, que vise la liaison, la flèche du côté de l'entrée.
 *
 * Tout ce fichier est une fonction pure : le même modèle donne toujours les
 * mêmes nœuds, aux mêmes places. Un bloc sans position reçoit une place
 * calculée, la même à chaque fois (une reprise ou un document venu de l'API
 * s'affichent ainsi sans mise en page).
 */

/** L'identifiant du cadre du bundle : il commence par « _ », ce qu'aucun élément ne peut faire (format). */
export const ID_DU_CADRE = "__bundle";

/**
 * Les mesures du canevas, en pixels. Les tailles des blocs se calculent
 * depuis leur contenu (conception, partie 3.3 : pas de taille saisie en L1) ;
 * la feuille de style donne aux mêmes parties les mêmes hauteurs.
 */
export const MESURES = {
  largeurDuComposant: 320,
  enTeteDuComposant: 48,
  enTeteDUneUnite: 32,
  /** Une ligne : une entrée à gauche, une sortie à droite ; assez haute pour une poignée de 24 px. */
  ligneDeCanaux: 28,
  espaceEntreUnites: 8,
  basDuComposant: 8,
  sansUnite: 32,
  enTeteDeZone: 64,
  margeDeZone: 24,
  espaceEntreComposants: 16,
  largeurMinimaleDeZone: 368,
  hauteurMinimaleDeZone: 128,
  largeurDeLaSalle: 260,
  hauteurDeLaSalle: 56,
  positionDeLaSalle: { x: 40, y: 24 },
  hautDesZones: 120,
  margeDuCadre: 40,
  espaceEntreZones: 48,
} as const;

export type NomDuNoeud = "bundle" | "zone" | "salle" | "composant";

export interface DonneesDuCadre extends Record<string, unknown> {
  readonly nom: string;
  readonly code: string;
}

export interface DonneesDeZone extends Record<string, unknown> {
  readonly element: Element;
  /** Le type en mots : « robot », « application web »... ou « à préciser ». */
  readonly typeEnMots: string;
  readonly facultative: boolean;
  readonly externe: boolean;
  readonly aPreciser: boolean;
}

export interface DonneesDeSalle extends Record<string, unknown> {
  readonly element: Element;
}

/** Un canal affiché : son côté dit s'il est une entrée (à gauche) ou une sortie (à droite). */
export interface CanalAffiche {
  readonly element: Element;
  readonly cote: Position.Left | Position.Right;
  /** La poignée de React Flow : une entrée reçoit (« target »), une sortie émet (« source »). */
  readonly poignee: "target" | "source";
  readonly format: string;
  readonly typeEnMots: string;
}

export interface UniteAffichee {
  readonly element: Element;
  readonly entrees: readonly CanalAffiche[];
  readonly sorties: readonly CanalAffiche[];
}

export interface DonneesDeComposant extends Record<string, unknown> {
  readonly element: Element;
  readonly application: boolean;
  readonly unites: readonly UniteAffichee[];
}

export type NoeudDuCadre = Node<DonneesDuCadre, "bundle">;
export type NoeudDeZone = Node<DonneesDeZone, "zone">;
export type NoeudDeSalle = Node<DonneesDeSalle, "salle">;
export type NoeudDeComposant = Node<DonneesDeComposant, "composant">;
export type NoeudDuCanevas = NoeudDuCadre | NoeudDeZone | NoeudDeSalle | NoeudDeComposant;

export interface DonneesDeLiaison extends Record<string, unknown> {
  readonly liaison: Liaison;
}
export type LiaisonDuCanevas = Edge<DonneesDeLiaison>;

export interface Disposition {
  readonly noeuds: readonly NoeudDuCanevas[];
  readonly liaisons: readonly LiaisonDuCanevas[];
  /** Ce qui ne peut pas se dessiner (un parent absent, un canal disparu) : la vérification le dira. */
  readonly nonAffiches: readonly string[];
  readonly compteurs: { readonly zones: number; readonly composants: number; readonly unites: number; readonly liaisons: number };
}

interface Taille {
  readonly largeur: number;
  readonly hauteur: number;
}

/** Les enfants d'un élément, dans l'ordre de la liste (l'ordre des frères). */
function enfantsDe(elements: readonly Element[], parent: string | null, ...sortes: Sorte[]): Element[] {
  return elements.filter((element) => element.parent === parent && sortes.includes(element.sorte));
}

/** Tous les canaux d'une sorte sous une unité : son interface, ses bandes, leurs bus. */
function canauxDe(elements: readonly Element[], unite: Element, bus: Sorte, canal: Sorte): Element[] {
  const interfaces = enfantsDe(elements, unite.id, SORTES.INTERFACE);
  const bandes = interfaces.flatMap((itf) => enfantsDe(elements, itf.id, SORTES.BANDE));
  const lesBus = bandes.flatMap((bande) => enfantsDe(elements, bande.id, bus));
  return lesBus.flatMap((unBus) => enfantsDe(elements, unBus.id, canal));
}

function canalAffiche(element: Element, entree: boolean): CanalAffiche {
  const reglages = element.reglages ?? {};
  return {
    element,
    cote: entree ? Position.Left : Position.Right,
    poignee: entree ? "target" : "source",
    format: libelleDuFormat(reglages.format),
    typeEnMots: libelleDuTypeDeCanal(reglages.type),
  };
}

function uniteAffichee(elements: readonly Element[], unite: Element): UniteAffichee {
  return {
    element: unite,
    entrees: canauxDe(elements, unite, SORTES.BUS_RECEPTION, SORTES.CANAL_RECEPTION).map((c) => canalAffiche(c, true)),
    sorties: canauxDe(elements, unite, SORTES.BUS_EMISSION, SORTES.CANAL_EMISSION).map((c) => canalAffiche(c, false)),
  };
}

/** La hauteur d'un composant, depuis ses unités et leurs canaux. */
export function tailleDUnComposant(unites: readonly UniteAffichee[]): Taille {
  const corps = unites.length === 0
    ? MESURES.sansUnite
    : unites.reduce((total, unite) => total + MESURES.enTeteDUneUnite
        + Math.max(unite.entrees.length, unite.sorties.length) * MESURES.ligneDeCanaux, 0)
      + (unites.length - 1) * MESURES.espaceEntreUnites;
  return {
    largeur: MESURES.largeurDuComposant,
    hauteur: MESURES.enTeteDuComposant + corps + MESURES.basDuComposant,
  };
}

/**
 * Les positions des blocs d'un parent : celle de la mise en page si elle
 * existe ; sinon une place calculée après les blocs déjà placés, toujours la même.
 */
function placer<T extends { readonly element: Element; readonly taille: Taille }>(
  blocs: readonly T[],
  miseEnPage: MiseEnPage,
  suivante: (dejaPlaces: readonly { position: PositionDuBloc; taille: Taille }[], bloc: T) => PositionDuBloc,
): (T & { readonly position: PositionDuBloc })[] {
  const places: { position: PositionDuBloc; taille: Taille }[] = [];
  for (const bloc of blocs) {
    const donnee = miseEnPage.blocs[bloc.element.id];
    if (donnee) places.push({ position: donnee, taille: bloc.taille });
  }
  return blocs.map((bloc) => {
    const donnee = miseEnPage.blocs[bloc.element.id];
    if (donnee) return { ...bloc, position: donnee };
    const position = suivante(places, bloc);
    places.push({ position, taille: bloc.taille });
    return { ...bloc, position };
  });
}

function bordDroit(places: readonly { position: PositionDuBloc; taille: Taille }[]): number {
  return places.reduce((max, place) => Math.max(max, place.position.x + place.taille.largeur), 0);
}

function bordBas(places: readonly { position: PositionDuBloc; taille: Taille }[]): number {
  return places.reduce((max, place) => Math.max(max, place.position.y + place.taille.hauteur), 0);
}

/** Le type d'une zone, en mots : « Zone robot » au catalogue devient « robot ». */
function typeDeZoneEnMots(zone: Element, catalogue: CatalogueIndexe): string {
  if (!zone.type) return "à préciser";
  const nom = typeDuCatalogue(catalogue, zone.type.code, zone.type.version)?.nom ?? zone.type.code;
  return nom.startsWith("Zone ") ? nom.slice("Zone ".length) : nom;
}

/** Dispose un bundle sur le canevas. */
export function disposer(modele: ModeleBundle, miseEnPage: MiseEnPage, catalogue: CatalogueIndexe): Disposition {
  const { elements } = modele;
  const nonAffiches: string[] = [];

  // Les composants de chaque zone, avec leur taille.
  const zones = enfantsDe(elements, null, SORTES.ZONE);
  const idsDesZones = new Set(zones.map((zone) => zone.id));
  const composantsParZone = new Map<string, NoeudDeComposant[]>();
  for (const zone of zones) {
    const composants = enfantsDe(elements, zone.id, SORTES.SERVICE, SORTES.APPLICATION).map((element) => {
      const unites = enfantsDe(elements, element.id, SORTES.UNITE).map((unite) => uniteAffichee(elements, unite));
      return { element, unites, taille: tailleDUnComposant(unites) };
    });
    const places = placer(composants, miseEnPage, (dejaPlaces) => ({
      x: MESURES.margeDeZone,
      y: dejaPlaces.length > 0 ? bordBas(dejaPlaces) + MESURES.espaceEntreComposants : MESURES.enTeteDeZone,
    }));
    composantsParZone.set(zone.id, places.map(({ element, unites, taille, position }) => ({
      id: element.id,
      type: "composant",
      parentId: zone.id,
      extent: "parent",
      position,
      width: taille.largeur,
      height: taille.hauteur,
      data: { element, application: element.sorte === SORTES.APPLICATION, unites },
    })));
  }
  // Un service ou une application hors d'une zone ne se dessine pas : la vérification le signale.
  for (const element of elements) {
    if ((element.sorte === SORTES.SERVICE || element.sorte === SORTES.APPLICATION)
        && !(element.parent && idsDesZones.has(element.parent))) nonAffiches.push(element.id);
  }

  // Les zones, à la taille de leur contenu, puis la salle.
  const zonesAvecTaille = zones.map((zone) => {
    const enfants = composantsParZone.get(zone.id) ?? [];
    const occupes = enfants.map((noeud) => ({
      position: noeud.position, taille: { largeur: noeud.width ?? 0, hauteur: noeud.height ?? 0 },
    }));
    return {
      element: zone,
      taille: {
        largeur: Math.max(MESURES.largeurMinimaleDeZone, bordDroit(occupes) + MESURES.margeDeZone),
        hauteur: Math.max(MESURES.hauteurMinimaleDeZone, bordBas(occupes) + MESURES.margeDeZone),
      },
    };
  });
  const zonesPlacees = placer(zonesAvecTaille, miseEnPage, (dejaPlaces) => ({
    x: dejaPlaces.length > 0 ? bordDroit(dejaPlaces) + MESURES.espaceEntreZones : MESURES.margeDuCadre,
    y: MESURES.hautDesZones,
  }));
  const salles = enfantsDe(elements, null, SORTES.SALLE).map((element) => ({
    element, taille: { largeur: MESURES.largeurDeLaSalle, hauteur: MESURES.hauteurDeLaSalle },
  }));
  const sallesPlacees = placer(salles, miseEnPage, (dejaPlaces) => (dejaPlaces.length > 0
    ? { x: bordDroit(dejaPlaces) + MESURES.espaceEntreZones, y: MESURES.positionDeLaSalle.y }
    : MESURES.positionDeLaSalle));

  const tous = [...zonesPlacees, ...sallesPlacees].map(({ position, taille }) => ({ position, taille }));
  const cadre: NoeudDuCadre = {
    id: ID_DU_CADRE,
    type: "bundle",
    position: { x: 0, y: 0 },
    width: Math.max(640, bordDroit(tous) + MESURES.margeDuCadre),
    height: Math.max(400, bordBas(tous) + MESURES.margeDuCadre),
    data: { nom: modele.bundle.nom, code: modele.bundle.code },
    selectable: false,
  };

  // Les parents d'abord : le cadre, puis la salle et les zones, puis les composants.
  const noeuds: NoeudDuCanevas[] = [
    cadre,
    ...sallesPlacees.map(({ element, position, taille }): NoeudDeSalle => ({
      id: element.id, type: "salle", parentId: ID_DU_CADRE, extent: "parent", position,
      width: taille.largeur, height: taille.hauteur, data: { element },
    })),
    ...zonesPlacees.map(({ element, position, taille }): NoeudDeZone => ({
      id: element.id, type: "zone", parentId: ID_DU_CADRE, extent: "parent", position,
      width: taille.largeur, height: taille.hauteur,
      data: {
        element,
        typeEnMots: typeDeZoneEnMots(element, catalogue),
        facultative: (element.reglages ?? {}).exigence === EXIGENCE_FACULTATIVE,
        externe: element.type?.code === TYPE_DE_LA_ZONE_EXTERNE,
        aPreciser: !element.type,
      },
    })),
    ...zones.flatMap((zone) => composantsParZone.get(zone.id) ?? []),
  ];

  // Chaque liaison va du composant qui porte la sortie à celui qui porte
  // l'entrée, poignée contre poignée, la flèche à l'arrivée.
  const composantDuCanal = new Map<string, string>();
  for (const noeud of noeuds) {
    if (noeud.type !== "composant") continue;
    for (const unite of noeud.data.unites) {
      for (const canal of [...unite.entrees, ...unite.sorties]) composantDuCanal.set(canal.element.id, noeud.id);
    }
  }
  const liaisons: LiaisonDuCanevas[] = [];
  for (const liaison of modele.liaisons) {
    const source = composantDuCanal.get(liaison.source);
    const destination = composantDuCanal.get(liaison.destination);
    if (!source || !destination) {
      nonAffiches.push(liaison.id);
      continue;
    }
    liaisons.push({
      id: liaison.id,
      source,
      sourceHandle: liaison.source,
      target: destination,
      targetHandle: liaison.destination,
      type: "smoothstep",
      // Aucune animation permanente (spécification 10.11) : la flèche suffit à dire le sens.
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      data: { liaison },
    });
  }

  return {
    noeuds,
    liaisons,
    nonAffiches,
    compteurs: {
      zones: zones.length,
      composants: elements.filter((e) => e.sorte === SORTES.SERVICE || e.sorte === SORTES.APPLICATION).length,
      unites: elements.filter((e) => e.sorte === SORTES.UNITE).length,
      liaisons: modele.liaisons.length,
    },
  };
}
