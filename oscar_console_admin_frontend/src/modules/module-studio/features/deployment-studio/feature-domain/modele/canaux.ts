/**
 * Les réglages d'un canal : son type et le format de sa donnée.
 *
 * Ce sont les valeurs de l'ancien Studio, reprises telles quelles pour que rien
 * ne régresse (conception du lot L1, partie 3.2). Le lot L2 les remplace par
 * les types d'entrées et de sorties de la formalisation et par des formes de
 * données versionnées. D'ici là, ce fichier est le seul endroit où elles sont
 * écrites : l'ancien éditeur les lit ici lui aussi.
 */

interface Choix<Code extends string> {
  readonly code: Code;
  /** Le mot affiché dans une liste. */
  readonly libelle: string;
  /** Une phrase qui dit à quoi sert ce choix. */
  readonly aide: string;
}

export const TYPES_DE_RECEPTION = [
  {
    code: "TYPE_ENTREE_INJECTION_APPLICATION",
    libelle: "Donnée fournie par l’application",
    aide: "La logique de l’application appelle directement le canal.",
  },
  {
    code: "TYPE_ENTREE_ABONNEMENT_TEMPS_REEL",
    libelle: "Abonnement temps réel",
    aide: "Reçoit les données émises par une autre unité de la salle du robot.",
  },
  {
    code: "TYPE_ENTREE_SERVICE_LOCAL",
    libelle: "Service présent sur la même machine",
    aide: "Reçoit une donnée par communication locale.",
  },
  {
    code: "TYPE_ENTREE_CONSOMMATION_COURTIER_MESSAGES",
    libelle: "Courtier de messages",
    aide: "Consomme un sujet publié sur un système de messages.",
  },
  {
    code: "TYPE_ENTREE_ABONNEMENT_ROS_2",
    libelle: "Canal ROS 2 du robot",
    aide: "S’abonne à un sujet ROS 2, par exemple un capteur.",
  },
] as const satisfies readonly Choix<string>[];

export const TYPES_D_EMISSION = [
  {
    code: "TYPE_SORTIE_PUBLICATION_TEMPS_REEL_CANAL_UNITE",
    libelle: "Canal précis d’une unité",
    aide: "Envoie en temps réel vers un canal de réception précis.",
  },
  {
    code: "TYPE_SORTIE_PUBLICATION_TEMPS_REEL_PLUSIEURS_CANAUX",
    libelle: "Plusieurs canaux temps réel",
    aide: "Diffuse la même donnée à plusieurs destinations configurées.",
  },
  {
    code: "TYPE_SORTIE_RAPPEL_APPLICATION",
    libelle: "Rappel vers l’application",
    aide: "Déclenche une fonction fournie par l’application intégratrice.",
  },
  {
    code: "TYPE_SORTIE_SERVICE_LOCAL",
    libelle: "Service présent sur la même machine",
    aide: "Transmet par communication locale.",
  },
  {
    code: "TYPE_SORTIE_PUBLICATION_COURTIER_MESSAGES",
    libelle: "Publication vers un courtier de messages",
    aide: "Publie la donnée sur un sujet externe.",
  },
  {
    code: "TYPE_SORTIE_PUBLICATION_ROS_2",
    libelle: "Publication vers ROS 2",
    aide: "Publie vers un sujet ROS 2 du robot.",
  },
] as const satisfies readonly Choix<string>[];

/**
 * Les formats de donnée, dans l'ordre où une liste les propose : les deux les
 * plus courants d'abord. `libelle` est le mot court du canevas, `aide` la
 * phrase du formulaire.
 */
export const FORMATS_DE_DONNEES = [
  { code: "BINAIRE_COMPACT", libelle: "Binaire compact", aide: "Binaire compact, haute fréquence" },
  { code: "OBJET_JSON", libelle: "Objet structuré", aide: "Objet structuré, données métier" },
  { code: "NOMBRE", libelle: "Nombre", aide: "Nombre" },
  { code: "BOOLEEN", libelle: "Vrai / faux", aide: "Vrai / faux" },
  { code: "TEXTE", libelle: "Texte", aide: "Texte" },
  { code: "IMAGE", libelle: "Image", aide: "Image" },
] as const satisfies readonly Choix<string>[];

export type TypeDeReception = (typeof TYPES_DE_RECEPTION)[number]["code"];
export type TypeDEmission = (typeof TYPES_D_EMISSION)[number]["code"];
export type FormatDeDonnees = (typeof FORMATS_DE_DONNEES)[number]["code"];

/** Les réglages d'un canal neuf : ceux qu'avait déjà l'ancien Studio. */
export const REGLAGES_D_UN_CANAL_DE_RECEPTION = {
  type: "TYPE_ENTREE_ABONNEMENT_TEMPS_REEL",
  format: "OBJET_JSON",
} as const satisfies { type: TypeDeReception; format: FormatDeDonnees };

export const REGLAGES_D_UN_CANAL_D_EMISSION = {
  type: "TYPE_SORTIE_PUBLICATION_TEMPS_REEL_CANAL_UNITE",
  format: "OBJET_JSON",
} as const satisfies { type: TypeDEmission; format: FormatDeDonnees };

/** Le mot court d'un format ; le code lui-même s'il est inconnu (une reprise peut en porter un). */
export function libelleDuFormat(format: unknown): string {
  const trouve = FORMATS_DE_DONNEES.find((choix) => choix.code === format);
  return trouve ? trouve.libelle : String(format ?? "");
}

/** Le libellé du type d'un canal, de réception ou d'émission ; le code s'il est inconnu. */
export function libelleDuTypeDeCanal(type: unknown): string {
  const trouve = [...TYPES_DE_RECEPTION, ...TYPES_D_EMISSION].find((choix) => choix.code === type);
  return trouve ? trouve.libelle : String(type ?? "");
}
