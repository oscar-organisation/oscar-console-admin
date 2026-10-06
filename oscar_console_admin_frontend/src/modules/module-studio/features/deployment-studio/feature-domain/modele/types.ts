/**
 * Le modèle d'un bundle au nouveau Studio, tel que le navigateur le manipule.
 *
 * Deux documents, comme sur le serveur (conception du lot L1, partie 3) :
 * - le modèle, format `oscar.bundle/1` : l'en-tête du bundle, ses éléments
 *   rangés à plat avec leur parent, et ses liaisons ;
 * - la mise en page, format `oscar.mise-en-page/1` : la position de chaque
 *   bloc. Déplacer un bloc ne change pas le modèle.
 *
 * Tout est en lecture seule (`readonly`) : un geste ne modifie jamais un état,
 * il en fabrique un nouveau. C'est ce qui permet d'annuler et de rétablir en
 * gardant simplement les états successifs (historique.ts).
 *
 * Les noms des champs sont ceux du format, écrits comme le serveur les envoie
 * et les attend (`code_fige`, `donnees_reprises`) : le document part tel quel.
 */

export const FORMAT_DU_BUNDLE = "oscar.bundle/1";
export const FORMAT_DE_LA_MISE_EN_PAGE = "oscar.mise-en-page/1";

/** Les sortes d'éléments, écrites comme dans la spécification. */
export const SORTES = {
  ZONE: "ZONE_ENVIRONNEMENT_EXECUTION",
  SALLE: "COMPOSANT_SALLE_TEMPS_REEL",
  SERVICE: "INSTANCE_SERVICE_CONFIGUREE",
  APPLICATION: "INSTANCE_APPLICATION_CONFIGUREE",
  UNITE: "INSTANCE_UNITE_CONFIGUREE",
  TRAITEMENT: "TRAITEMENT_METIER_UNITE",
  INTERFACE: "INTERFACE_COMMUNICATION_UNITE",
  BANDE: "BANDE_DONNEES",
  BUS_RECEPTION: "BUS_RECEPTION",
  BUS_EMISSION: "BUS_EMISSION",
  CANAL_RECEPTION: "CANAL_RECEPTION",
  CANAL_EMISSION: "CANAL_EMISSION",
} as const;

export type Sorte = (typeof SORTES)[keyof typeof SORTES];

/** Le bundle lui-même n'est pas un élément : c'est le cadre qui les contient. */
export const SORTE_DU_BUNDLE = "BUNDLE_DEPLOIEMENT";

/** Les deux exigences d'activation d'une zone. */
export const EXIGENCE_OBLIGATOIRE = "EXIGENCE_ACTIVATION_ENVIRONNEMENT_OBLIGATOIRE";
export const EXIGENCE_FACULTATIVE = "EXIGENCE_ACTIVATION_ENVIRONNEMENT_FACULTATIVE";

/** Un type du catalogue, cité par son code et sa version, sans être recopié. */
export interface TypeCite {
  readonly code: string;
  readonly version: string;
}

export interface Element {
  /** Identifiant stable, jamais saisi ni affiché en saisie. */
  readonly id: string;
  readonly sorte: Sorte;
  /** Le parent ; `null` pour un enfant direct du bundle. */
  readonly parent: string | null;
  /** Code technique préfixé, unique dans sa portée (le bundle, ou l'unité). */
  readonly code: string;
  readonly nom?: string;
  readonly description?: string;
  readonly type?: TypeCite;
  /** Zone : exigence et justification. Canal : type et format repris jusqu'au lot L2. */
  readonly reglages?: Readonly<Record<string, unknown>>;
  /** Vrai si ce code figure déjà dans une version publiée : il ne change plus. */
  readonly code_fige?: boolean;
  /** Ce que la reprise d'un ancien bundle a lu et qui n'a pas encore sa place. */
  readonly donnees_reprises?: Readonly<Record<string, unknown>>;
}

/** Une liaison de données, d'un canal d'émission vers un canal de réception. */
export interface Liaison {
  readonly id: string;
  readonly source: string;
  readonly destination: string;
}

export interface EnTeteDuBundle {
  readonly code: string;
  readonly nom: string;
  readonly description?: string;
}

export interface ModeleBundle {
  readonly format: typeof FORMAT_DU_BUNDLE;
  readonly bundle: EnTeteDuBundle;
  readonly elements: readonly Element[];
  readonly liaisons: readonly Liaison[];
}

/** Une position, relative au parent du bloc (le cadre du bundle, ou sa zone). */
export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface MiseEnPage {
  readonly format: typeof FORMAT_DE_LA_MISE_EN_PAGE;
  readonly blocs: Readonly<Record<string, Position>>;
}

/** Ce que l'historique garde à chaque geste : les deux documents ensemble. */
export interface EtatStudio {
  readonly modele: ModeleBundle;
  readonly miseEnPage: MiseEnPage;
}

/** Un type du catalogue, tel que le sert `GET /studio/catalogue`. */
export interface TypeDuCatalogue {
  readonly code: string;
  readonly version: string;
  readonly sorte: string;
  readonly famille: string;
  readonly nom: string;
  readonly description: string;
  readonly exemple: string;
  readonly parents_autorises: readonly string[];
  readonly recoit: readonly string[];
  readonly contenu_cree: readonly string[];
  readonly ordre: number;
  readonly dans_la_palette: boolean;
}

export interface FamilleDuCatalogue {
  readonly code: string;
  readonly nom: string;
  readonly ordre: number;
}

/** La réponse de `GET /studio/catalogue`. */
export interface CatalogueStudio {
  readonly familles: readonly FamilleDuCatalogue[];
  readonly types: readonly TypeDuCatalogue[];
}

/** Les codes des refus, ceux de la table 3.4 de la conception. */
export type CodeDeRefus =
  | "SERVICE_HORS_ZONE"
  | "ZONE_INCOMPATIBLE"
  | "ZONE_DANS_UNE_ZONE"
  | "SALLE_EN_DOUBLE"
  | "SALLE_SANS_ZONE"
  | "ZONE_EXTERNE_EN_DOUBLE"
  | "ZONE_EXTERNE_RESERVEE"
  | "UNITE_HORS_COMPOSANT"
  | "STRUCTURE_FIXE"
  | "CANAL_MAUVAIS_BUS"
  | "PARENT_INCOMPATIBLE"
  | "PARENT_ABSENT"
  | "JUSTIFICATION_ABSENTE"
  | "IDENTIFIANT_EN_DOUBLE"
  | "CODE_EN_DOUBLE"
  | "CODE_FIGE"
  | "TYPE_INCONNU_DU_CATALOGUE"
  | "LIAISON_SENS_INVERSE"
  | "LIAISON_EXTREMITE_ABSENTE";

/** Une règle enfreinte : son code, ce qu'il faut faire, et où. */
export interface Refus {
  readonly code: CodeDeRefus;
  /** La phrase affichée, en français, qui dit quoi faire. */
  readonly message: string;
  /** L'élément ou la liaison en cause, s'il y en a un. */
  readonly element: string | null;
  /** Pour un placement refusé : les parents où l'élément pourrait aller. */
  readonly parentsCompatibles: readonly string[];
}
