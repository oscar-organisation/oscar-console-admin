import { REGLAGES_D_UN_CANAL_DE_RECEPTION, REGLAGES_D_UN_CANAL_D_EMISSION } from "./canaux";
import { PREFIXES_DES_IDENTIFIANTS, type NouvelIdentifiant } from "./identifiants";
import { EXIGENCE_OBLIGATOIRE, SORTES, type Element, type Sorte, type TypeCite } from "./types";

/**
 * Les fabriques des éléments, et ce qui naît avec eux (« création assistée »,
 * conception du lot L1, partie 3.4) :
 * - la première zone pose la salle temps réel ;
 * - un service ou une application arrive avec sa première unité ;
 * - une unité arrive avec son traitement, son interface, une bande et ses deux bus.
 *
 * Ces éléments sont de vrais objets du modèle, plus des chaînes de caractères
 * rangées dans l'unité comme dans l'ancien Studio. Les codes et les noms sont
 * ceux de la conception et des cas partagés (`tests/gestes_partages.py` du
 * serveur), pour que les deux côtés fabriquent le même document.
 */

/** La salle d'un bundle : son type et son code ne changent jamais. */
export const TYPE_DE_LA_SALLE: TypeCite = { code: "COMPOSANT_SALLE_TEMPS_REEL", version: "1.0.0" };
/** Le type de l'unité créée avec un service ou une application, avant le catalogue standard (L4). */
export const TYPE_DE_L_UNITE_STANDARD: TypeCite = { code: "TYPE_UNITE_STANDARD", version: "1.0.0" };

/** Le préfixe du code de chaque sorte (spécification 1.2). */
export const PREFIXES_DES_CODES: Readonly<Record<Sorte, string>> = {
  [SORTES.ZONE]: "ZONE_ENVIRONNEMENT_EXECUTION",
  [SORTES.SALLE]: "COMPOSANT_SALLE_TEMPS_REEL",
  [SORTES.SERVICE]: "INSTANCE_SERVICE_CONFIGUREE",
  [SORTES.APPLICATION]: "INSTANCE_APPLICATION_CONFIGUREE",
  [SORTES.UNITE]: "INSTANCE_UNITE_CONFIGUREE",
  [SORTES.TRAITEMENT]: "TRAITEMENT_METIER_UNITE",
  [SORTES.INTERFACE]: "INTERFACE_COMMUNICATION_UNITE",
  [SORTES.BANDE]: "BANDE_DONNEES",
  [SORTES.BUS_RECEPTION]: "BUS_RECEPTION",
  [SORTES.BUS_EMISSION]: "BUS_EMISSION",
  [SORTES.CANAL_RECEPTION]: "CANAL_RECEPTION",
  [SORTES.CANAL_EMISSION]: "CANAL_EMISSION",
};

/** Le nom proposé quand on ajoute un élément sans en donner. */
export const NOMS_PAR_DEFAUT: Readonly<Record<Sorte, string>> = {
  [SORTES.ZONE]: "Zone",
  [SORTES.SALLE]: "Salle temps réel",
  [SORTES.SERVICE]: "Service",
  [SORTES.APPLICATION]: "Application",
  [SORTES.UNITE]: "Unité",
  [SORTES.TRAITEMENT]: "Traitement",
  [SORTES.INTERFACE]: "Interface de communication",
  [SORTES.BANDE]: "Bande de données",
  [SORTES.BUS_RECEPTION]: "Réception",
  [SORTES.BUS_EMISSION]: "Émission",
  [SORTES.CANAL_RECEPTION]: "Entrée",
  [SORTES.CANAL_EMISSION]: "Sortie",
};

/** Ce que l'on peut donner à un élément neuf ; le reste se déduit. */
export interface ValeursDUnElement {
  readonly code?: string;
  readonly nom?: string;
  readonly description?: string;
  readonly reglages?: Readonly<Record<string, unknown>>;
}

/** Les réglages d'un élément neuf de cette sorte, s'il en a. */
export function reglagesParDefaut(sorte: Sorte): Readonly<Record<string, unknown>> | undefined {
  if (sorte === SORTES.ZONE) return { exigence: EXIGENCE_OBLIGATOIRE };
  if (sorte === SORTES.CANAL_RECEPTION) return { ...REGLAGES_D_UN_CANAL_DE_RECEPTION };
  if (sorte === SORTES.CANAL_EMISSION) return { ...REGLAGES_D_UN_CANAL_D_EMISSION };
  return undefined;
}

/**
 * Un élément, avec seulement les champs qui ont une valeur : le format refuse
 * un champ facultatif à `null`, on l'omet donc.
 */
export function fabriquerElement(champs: {
  readonly id: string;
  readonly sorte: Sorte;
  readonly parent: string | null;
  readonly code: string;
  readonly nom?: string | undefined;
  readonly description?: string | undefined;
  readonly type?: TypeCite | undefined;
  readonly reglages?: Readonly<Record<string, unknown>> | undefined;
}): Element {
  return {
    id: champs.id,
    sorte: champs.sorte,
    parent: champs.parent,
    code: champs.code,
    ...(champs.nom !== undefined ? { nom: champs.nom } : {}),
    ...(champs.description !== undefined ? { description: champs.description } : {}),
    ...(champs.type !== undefined ? { type: champs.type } : {}),
    ...(champs.reglages !== undefined ? { reglages: champs.reglages } : {}),
  };
}

/** La salle temps réel, posée avec la première zone. */
export function fabriquerSalle(nouvelIdentifiant: NouvelIdentifiant): Element {
  return fabriquerElement({
    id: nouvelIdentifiant(PREFIXES_DES_IDENTIFIANTS[SORTES.SALLE]),
    sorte: SORTES.SALLE,
    parent: null,
    code: "COMPOSANT_SALLE_TEMPS_REEL",
    nom: NOMS_PAR_DEFAUT[SORTES.SALLE],
    type: TYPE_DE_LA_SALLE,
  });
}

/** Ce qui naît avec une unité : son traitement, son interface, une bande et ses deux bus. */
export function fabriquerStructureDUneUnite(uniteId: string, nouvelIdentifiant: NouvelIdentifiant): Element[] {
  const traitement = nouvelIdentifiant(PREFIXES_DES_IDENTIFIANTS[SORTES.TRAITEMENT]);
  const interfaceId = nouvelIdentifiant(PREFIXES_DES_IDENTIFIANTS[SORTES.INTERFACE]);
  const bande = nouvelIdentifiant(PREFIXES_DES_IDENTIFIANTS[SORTES.BANDE]);
  return [
    fabriquerElement({ id: traitement, sorte: SORTES.TRAITEMENT, parent: uniteId,
                       code: "TRAITEMENT_METIER_UNITE_PRINCIPAL" }),
    fabriquerElement({ id: interfaceId, sorte: SORTES.INTERFACE, parent: uniteId,
                       code: "INTERFACE_COMMUNICATION_UNITE_PRINCIPALE" }),
    fabriquerElement({ id: bande, sorte: SORTES.BANDE, parent: interfaceId, code: "BANDE_DONNEES_PRINCIPALE",
                       nom: "Bande principale" }),
    fabriquerElement({ id: nouvelIdentifiant(PREFIXES_DES_IDENTIFIANTS[SORTES.BUS_RECEPTION]),
                       sorte: SORTES.BUS_RECEPTION, parent: bande, code: "BUS_RECEPTION_PRINCIPAL",
                       nom: NOMS_PAR_DEFAUT[SORTES.BUS_RECEPTION] }),
    fabriquerElement({ id: nouvelIdentifiant(PREFIXES_DES_IDENTIFIANTS[SORTES.BUS_EMISSION]),
                       sorte: SORTES.BUS_EMISSION, parent: bande, code: "BUS_EMISSION_PRINCIPAL",
                       nom: NOMS_PAR_DEFAUT[SORTES.BUS_EMISSION] }),
  ];
}

/**
 * La première unité d'un service ou d'une application : elle reprend son nom,
 * et son code reprend la fin du code du composant
 * (`INSTANCE_SERVICE_CONFIGUREE_ACTIONS_ROBOT` donne `INSTANCE_UNITE_CONFIGUREE_ACTIONS_ROBOT`).
 * `codeLibre` reçoit ce code et rend celui à employer, s'il était déjà pris.
 */
export function fabriquerPremiereUnite(composant: Element, nouvelIdentifiant: NouvelIdentifiant,
                                       codeLibre: (code: string) => string = (code) => code): Element[] {
  const morceaux = composant.code.split("_CONFIGUREE_");
  const suffixe = morceaux.length > 1 ? morceaux.slice(1).join("_CONFIGUREE_") : composant.code;
  const unite = fabriquerElement({
    id: nouvelIdentifiant(PREFIXES_DES_IDENTIFIANTS[SORTES.UNITE]),
    sorte: SORTES.UNITE,
    parent: composant.id,
    code: codeLibre(`${PREFIXES_DES_CODES[SORTES.UNITE]}_${suffixe}`),
    nom: composant.nom ?? suffixe,
    type: TYPE_DE_L_UNITE_STANDARD,
  });
  return [unite, ...fabriquerStructureDUneUnite(unite.id, nouvelIdentifiant)];
}
