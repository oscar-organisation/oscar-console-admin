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
  // Un service ou une application : le dessin de l'ancien éditeur, à hauteurs fixes.
  largeurDuComposant: 380,
  /** Le liseré coloré du haut (3 px) et le bord du bas (1 px). */
  bordsDuComposant: 4,
  /** L'icône, le genre en petites capitales, le nom. */
  enTeteDuComposant: 52,
  /** Le code et la zone. */
  metaDuComposant: 26,
  /** Une ligne de description, quand le composant en a une. */
  descriptionDuComposant: 24,
  /** La marge autour de la liste des unités. */
  margeDesUnites: 9,
  bordsDUneUnite: 2,
  /** L'icône, le nom et le code de l'unité. */
  enTeteDUneUnite: 38,
  /** Les puces de la structure créée avec l'unité : traitement, interface, bande. */
  structureDUneUnite: 26,
  /** Le trait, la marge et les titres des deux colonnes : « Réception » et « Émission », avec leurs nombres. */
  titresDesColonnes: 28,
  /** Une ligne de canal ; une poignée s'y saisit sur 20 px. */
  ligneDeCanaux: 35,
  basDUneUnite: 8,
  espaceEntreUnites: 8,
  /** « Déposez une unité ici », dans un composant sans unité. */
  uniteVide: 71,
  /** Le bouton « Ajouter une unité », en bas du bloc. */
  boutonAjouterUneUnite: 30,
  enTeteDeZone: 64,
  margeDeZone: 24,
  espaceEntreComposants: 16,
  largeurMinimaleDeZone: 428,
  hauteurMinimaleDeZone: 150,
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
  /** Ce que la zone reçoit (services, applications), d'après son type au catalogue : l'état vide propose de l'ajouter. */
  readonly recoit: readonly Sorte[];
  /** Vrai si la zone ne contient encore rien : elle dit alors le geste suivant. */
  readonly vide: boolean;
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

/** Un bus et ses canaux : la colonne des entrées montre les bus de réception, celle des sorties les bus d'émission. */
export interface GroupeDeCanaux {
  readonly bus: Element;
  readonly canaux: readonly CanalAffiche[];
}

export interface UniteAffichee {
  readonly element: Element;
  /** La structure créée avec l'unité, montrée en puces. */
  readonly traitement: Element | undefined;
  readonly interfaceDeLUnite: Element | undefined;
  readonly bandes: readonly Element[];
  readonly entrees: readonly CanalAffiche[];
  readonly sorties: readonly CanalAffiche[];
  /** Les bus de réception et leurs canaux : c'est là qu'une entrée se dépose. */
  readonly groupesDEntrees: readonly GroupeDeCanaux[];
  /** Les bus d'émission et leurs canaux : c'est là qu'une sortie se dépose. */
  readonly groupesDeSorties: readonly GroupeDeCanaux[];
}

export interface DonneesDeComposant extends Record<string, unknown> {
  readonly element: Element;
  readonly application: boolean;
  /** Le nom de la zone qui le contient. */
  readonly nomDeLaZone: string;
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
  /** Les blocs qui en recouvrent un autre dans le même parent (une mise en page faite pour d'autres tailles) : « Ranger » les remet en ordre. */
  readonly chevauchements: readonly string[];
}

export interface Taille {
  readonly largeur: number;
  readonly hauteur: number;
}

/** Les enfants d'un élément, dans l'ordre de la liste (l'ordre des frères). */
function enfantsDe(elements: readonly Element[], parent: string | null, ...sortes: Sorte[]): Element[] {
  return elements.filter((element) => element.parent === parent && sortes.includes(element.sorte));
}

/** Les bus d'une sorte sous une unité (son interface, ses bandes), chacun avec ses canaux. */
function groupesDe(elements: readonly Element[], unite: Element, bus: Sorte, canal: Sorte, entree: boolean): GroupeDeCanaux[] {
  const interfaces = enfantsDe(elements, unite.id, SORTES.INTERFACE);
  const bandes = interfaces.flatMap((itf) => enfantsDe(elements, itf.id, SORTES.BANDE));
  return bandes.flatMap((bande) => enfantsDe(elements, bande.id, bus)).map((unBus) => ({
    bus: unBus,
    canaux: enfantsDe(elements, unBus.id, canal).map((c) => canalAffiche(c, entree)),
  }));
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
  const groupesDEntrees = groupesDe(elements, unite, SORTES.BUS_RECEPTION, SORTES.CANAL_RECEPTION, true);
  const groupesDeSorties = groupesDe(elements, unite, SORTES.BUS_EMISSION, SORTES.CANAL_EMISSION, false);
  const interfaces = enfantsDe(elements, unite.id, SORTES.INTERFACE);
  return {
    element: unite,
    traitement: enfantsDe(elements, unite.id, SORTES.TRAITEMENT)[0],
    interfaceDeLUnite: interfaces[0],
    bandes: interfaces.flatMap((itf) => enfantsDe(elements, itf.id, SORTES.BANDE)),
    entrees: groupesDEntrees.flatMap((groupe) => groupe.canaux),
    sorties: groupesDeSorties.flatMap((groupe) => groupe.canaux),
    groupesDEntrees,
    groupesDeSorties,
  };
}

/**
 * Le nombre de lignes d'une colonne de canaux. Un bus vide garde une ligne
 * (« Aucune entrée ») : c'est là qu'on dépose son premier canal. Quand une
 * unité a plusieurs bus du même sens, chacun a aussi une ligne pour son nom.
 */
export function lignesDUneColonne(groupes: readonly GroupeDeCanaux[]): number {
  if (groupes.length === 0) return 1;
  const titres = groupes.length > 1 ? groupes.length : 0;
  return titres + groupes.reduce((total, groupe) => total + Math.max(1, groupe.canaux.length), 0);
}

/** La hauteur d'une unité : son en-tête, sa structure, les titres des colonnes, puis ses lignes de canaux. */
export function hauteurDUneUnite(unite: UniteAffichee): number {
  return MESURES.bordsDUneUnite + MESURES.enTeteDUneUnite + MESURES.structureDUneUnite + MESURES.titresDesColonnes
    + Math.max(lignesDUneColonne(unite.groupesDEntrees), lignesDUneColonne(unite.groupesDeSorties)) * MESURES.ligneDeCanaux
    + MESURES.basDUneUnite;
}

/** La taille d'un composant, depuis ses unités et leurs canaux. */
export function tailleDUnComposant(unites: readonly UniteAffichee[], aUneDescription = false): Taille {
  const corps = unites.length === 0
    ? MESURES.uniteVide
    : unites.reduce((total, unite) => total + hauteurDUneUnite(unite) + MESURES.espaceEntreUnites, 0);
  return {
    largeur: MESURES.largeurDuComposant,
    hauteur: MESURES.bordsDuComposant + MESURES.enTeteDuComposant + MESURES.metaDuComposant
      + (aUneDescription ? MESURES.descriptionDuComposant : 0)
      + 2 * MESURES.margeDesUnites + corps + MESURES.boutonAjouterUneUnite,
  };
}

/** La taille d'un service ou d'une application, telle que le canevas la dessine. */
export function tailleDuComposant(elements: readonly Element[], composant: Element): Taille {
  const unites = enfantsDe(elements, composant.id, SORTES.UNITE).map((unite) => uniteAffichee(elements, unite));
  return tailleDUnComposant(unites, Boolean(composant.description));
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

/** Ce que reçoit une zone : son type au catalogue le dit ; une zone « à préciser » reçoit les deux. */
function recuesParLaZone(zone: Element, catalogue: CatalogueIndexe): Sorte[] {
  if (!zone.type) return [SORTES.SERVICE, SORTES.APPLICATION];
  const recoit = typeDuCatalogue(catalogue, zone.type.code, zone.type.version)?.recoit ?? [];
  return [SORTES.SERVICE, SORTES.APPLICATION].filter((sorte) => recoit.includes(sorte));
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
      return { element, unites, taille: tailleDUnComposant(unites, Boolean(element.description)) };
    });
    const places = placer(composants, miseEnPage, (dejaPlaces) => ({
      x: MESURES.margeDeZone,
      y: dejaPlaces.length > 0 ? bordBas(dejaPlaces) + MESURES.espaceEntreComposants : MESURES.enTeteDeZone,
    }));
    composantsParZone.set(zone.id, places.map(({ element, unites, taille, position }) => ({
      id: element.id,
      type: "composant",
      parentId: zone.id,
      // Ni « extent » ni « expandParent » : un service se glisse hors de sa zone, vers une autre
      // (le changement de parent se décide au lâcher, par les opérations du modèle).
      position,
      width: taille.largeur,
      height: taille.hauteur,
      data: { element, application: element.sorte === SORTES.APPLICATION, unites, nomDeLaZone: zone.nom ?? zone.code },
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
    // Le cadre ne bouge pas : c'est le contenant de tout le bundle.
    draggable: false,
  };

  // Les parents d'abord : le cadre, puis la salle et les zones, puis les composants.
  const noeuds: NoeudDuCanevas[] = [
    cadre,
    // Une zone ou la salle glissée ne passe ni à gauche ni au-dessus du cadre, qui grandit
    // vers la droite et vers le bas pour la garder (« expandParent » de React Flow).
    ...sallesPlacees.map(({ element, position, taille }): NoeudDeSalle => ({
      id: element.id, type: "salle", parentId: ID_DU_CADRE, expandParent: true, position,
      width: taille.largeur, height: taille.hauteur, data: { element },
    })),
    ...zonesPlacees.map(({ element, position, taille }): NoeudDeZone => ({
      id: element.id, type: "zone", parentId: ID_DU_CADRE, expandParent: true, position,
      width: taille.largeur, height: taille.hauteur,
      data: {
        element,
        typeEnMots: typeDeZoneEnMots(element, catalogue),
        facultative: (element.reglages ?? {}).exigence === EXIGENCE_FACULTATIVE,
        externe: element.type?.code === TYPE_DE_LA_ZONE_EXTERNE,
        aPreciser: !element.type,
        recoit: recuesParLaZone(element, catalogue),
        vide: (composantsParZone.get(element.id) ?? []).length === 0,
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
      // Dessinée par canevas/LiaisonDeDonnees.tsx : un coude doux, une flèche à l'arrivée.
      type: "liaison",
      // Aucune animation permanente (spécification 10.11) : la flèche suffit à dire le sens.
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      data: { liaison },
    });
  }

  // Deux blocs du même parent qui se recouvrent : l'écran le signale, sans rien déplacer de lui-même.
  const chevauchements = new Set<string>();
  const freres = new Map<string, NoeudDuCanevas[]>();
  for (const noeud of noeuds) {
    if (!noeud.parentId) continue;
    freres.set(noeud.parentId, [...(freres.get(noeud.parentId) ?? []), noeud]);
  }
  for (const groupe of freres.values()) {
    groupe.forEach((a, rang) => {
      for (const b of groupe.slice(rang + 1)) {
        const separes = a.position.x + (a.width ?? 0) <= b.position.x || b.position.x + (b.width ?? 0) <= a.position.x
          || a.position.y + (a.height ?? 0) <= b.position.y || b.position.y + (b.height ?? 0) <= a.position.y;
        if (!separes) {
          chevauchements.add(a.id);
          chevauchements.add(b.id);
        }
      }
    });
  }

  return {
    noeuds,
    liaisons,
    nonAffiches,
    chevauchements: [...chevauchements],
    compteurs: {
      zones: zones.length,
      composants: elements.filter((e) => e.sorte === SORTES.SERVICE || e.sorte === SORTES.APPLICATION).length,
      unites: elements.filter((e) => e.sorte === SORTES.UNITE).length,
      liaisons: modele.liaisons.length,
    },
  };
}
