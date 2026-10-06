import {
  EXIGENCE_FACULTATIVE,
  SORTES,
  type CatalogueStudio,
  type CodeDeRefus,
  type Element,
  type ModeleBundle,
  type Refus,
  type Sorte,
  type TypeDuCatalogue,
} from "./types";

/**
 * Les règles du modèle d'un bundle (conception du lot L1, partie 3.4).
 *
 * Un document peut être bien formé et pourtant faux : un service posé hors
 * d'une zone, deux salles, un canal de réception dans un bus d'émission...
 * `verifierModele` relit TOUT le document et rend la liste de ses refus, chacun
 * avec son code, sa phrase en français (qui dit quoi faire), l'élément en cause
 * et, pour un placement, les parents où il pourrait aller. Une liste vide veut
 * dire : accepté.
 *
 * Le serveur joue les mêmes règles à chaque enregistrement
 * (`app/studio_modele/regles.py`) et c'est lui qui fait foi. Ce fichier en est
 * la traduction fidèle, dans le même ordre et avec les mêmes phrases : un même
 * fichier de cas, pris aux formats OSCAR, vérifie que les deux rendent le même
 * verdict (`regles-partagees.test.ts` ici, `test_studio_regles_du_modele.py`
 * sur le serveur). Une règle qui change change donc des deux côtés.
 */

/** Les dix-neuf règles, dans l'ordre de la table 3.4 (et du fichier des cas). */
export const INVARIANTS: readonly CodeDeRefus[] = [
  "SERVICE_HORS_ZONE", "ZONE_INCOMPATIBLE", "ZONE_DANS_UNE_ZONE", "SALLE_EN_DOUBLE", "SALLE_SANS_ZONE",
  "ZONE_EXTERNE_EN_DOUBLE", "ZONE_EXTERNE_RESERVEE", "UNITE_HORS_COMPOSANT", "STRUCTURE_FIXE",
  "CANAL_MAUVAIS_BUS", "PARENT_INCOMPATIBLE", "PARENT_ABSENT", "JUSTIFICATION_ABSENTE",
  "IDENTIFIANT_EN_DOUBLE", "CODE_EN_DOUBLE", "CODE_FIGE", "TYPE_INCONNU_DU_CATALOGUE",
  "LIAISON_SENS_INVERSE", "LIAISON_EXTREMITE_ABSENTE",
];

export const TYPE_DE_LA_ZONE_EXTERNE = "TYPE_ENVIRONNEMENT_EXECUTION_EXTERNE";

/**
 * Le parent permis de chaque sorte ; `null` veut dire « directement dans le
 * bundle ». Un service et une application vont dans une zone, puis le type de
 * la zone dit s'il les reçoit (le champ `recoit` du catalogue).
 */
export const PARENTS_PERMIS: Readonly<Record<Sorte, readonly (Sorte | null)[]>> = {
  [SORTES.ZONE]: [null],
  [SORTES.SALLE]: [null],
  [SORTES.SERVICE]: [SORTES.ZONE],
  [SORTES.APPLICATION]: [SORTES.ZONE],
  [SORTES.UNITE]: [SORTES.SERVICE, SORTES.APPLICATION],
  [SORTES.TRAITEMENT]: [SORTES.UNITE],
  [SORTES.INTERFACE]: [SORTES.UNITE],
  [SORTES.BANDE]: [SORTES.INTERFACE],
  [SORTES.BUS_RECEPTION]: [SORTES.BANDE],
  [SORTES.BUS_EMISSION]: [SORTES.BANDE],
  [SORTES.CANAL_RECEPTION]: [SORTES.BUS_RECEPTION],
  [SORTES.CANAL_EMISSION]: [SORTES.BUS_EMISSION],
};

/** La structure d'une unité : son code est unique dans l'unité, pas dans le bundle. */
export const SORTES_DE_STRUCTURE: readonly Sorte[] = [
  SORTES.TRAITEMENT, SORTES.INTERFACE, SORTES.BANDE, SORTES.BUS_RECEPTION, SORTES.BUS_EMISSION,
  SORTES.CANAL_RECEPTION, SORTES.CANAL_EMISSION,
];

/** Le nom de chaque sorte dans une phrase, avec son article. */
export const NOMS_DES_SORTES: Readonly<Record<Sorte, readonly [article: "un" | "une", nom: string]>> = {
  [SORTES.ZONE]: ["une", "zone d'environnement"],
  [SORTES.SALLE]: ["une", "salle temps réel"],
  [SORTES.SERVICE]: ["un", "service"],
  [SORTES.APPLICATION]: ["une", "application"],
  [SORTES.UNITE]: ["une", "unité"],
  [SORTES.TRAITEMENT]: ["un", "traitement"],
  [SORTES.INTERFACE]: ["une", "interface de communication"],
  [SORTES.BANDE]: ["une", "bande de données"],
  [SORTES.BUS_RECEPTION]: ["un", "bus de réception"],
  [SORTES.BUS_EMISSION]: ["un", "bus d'émission"],
  [SORTES.CANAL_RECEPTION]: ["un", "canal de réception"],
  [SORTES.CANAL_EMISSION]: ["un", "canal d'émission"],
};

/** Quand aucun parent possible n'existe encore dans le bundle. */
const A_AJOUTER_D_ABORD = "un parent à ajouter d'abord";

/** Le catalogue rangé par code et version, pour retrouver un type d'un seul accès. */
export type CatalogueIndexe = ReadonlyMap<string, TypeDuCatalogue>;

function cleDuType(code: string, version: string): string {
  return `${code}@${version}`;
}

export function indexerCatalogue(catalogue: CatalogueStudio): CatalogueIndexe {
  return new Map(catalogue.types.map((type) => [cleDuType(type.code, type.version), type]));
}

/** La définition d'un type cité, s'il est au catalogue. */
export function typeDuCatalogue(catalogue: CatalogueIndexe, code: string, version: string): TypeDuCatalogue | undefined {
  return catalogue.get(cleDuType(code, version));
}

function refus(code: CodeDeRefus, message: string, element: string | null = null,
               parentsCompatibles: readonly string[] = []): Refus {
  return { code, message, element, parentsCompatibles };
}

function estFeminin(sorte: Sorte): boolean {
  return NOMS_DES_SORTES[sorte][0] === "une";
}

/** Les noms des éléments, sans doublon, dans leur ordre ; `aDefaut` s'il n'y en a aucun. */
function liste(elements: readonly Element[], aDefaut: string): string {
  const noms = [...new Set(elements.map((element) => element.nom || element.code))];
  return noms.length > 0 ? noms.join(", ") : aDefaut;
}

/** Le document, indexé une fois pour toutes les règles. */
class Lecture {
  readonly parId = new Map<string, Element>();
  readonly enDouble: Element[] = [];
  readonly elements: Element[];

  constructor(modele: ModeleBundle, readonly catalogue: CatalogueIndexe) {
    for (const element of modele.elements) {
      if (this.parId.has(element.id)) this.enDouble.push(element);
      else this.parId.set(element.id, element);
    }
    // Un identifiant en double est signalé ; les autres règles lisent la
    // première occurrence seulement, pour ne pas compter deux fois la même faute.
    this.elements = [...this.parId.values()];
  }

  deSorte(...sortes: Sorte[]): Element[] {
    return this.elements.filter((element) => sortes.includes(element.sorte));
  }

  parent(element: Element): Element | undefined {
    return element.parent ? this.parId.get(element.parent) : undefined;
  }

  /** La définition du type cité, s'il est au catalogue pour cette sorte. */
  definition(element: Element): TypeDuCatalogue | undefined {
    if (!element.type) return undefined;
    const definition = typeDuCatalogue(this.catalogue, element.type.code, element.type.version);
    return definition && definition.sorte === element.sorte ? definition : undefined;
  }

  estExterne(zone: Element): boolean {
    return zone.type?.code === TYPE_DE_LA_ZONE_EXTERNE;
  }

  /** Ce que reçoit une zone ; `undefined` si son type est inconnu (signalé à part). */
  recues(zone: Element): readonly string[] | undefined {
    // Une zone « à préciser », sans type : la vérification demandera son vrai type.
    if (!zone.type) return [SORTES.SERVICE, SORTES.APPLICATION];
    return this.definition(zone)?.recoit;
  }

  zonesQuiRecoivent(sorte: Sorte): Element[] {
    return this.deSorte(SORTES.ZONE)
      .filter((zone) => !this.estExterne(zone) && (this.recues(zone) ?? []).includes(sorte));
  }

  /** L'unité qui contient cet élément, en remontant ses parents. */
  uniteDe(element: Element): Element | undefined {
    const vus = new Set([element.id]);
    let courant = this.parent(element);
    while (courant && !vus.has(courant.id)) {
      if (courant.sorte === SORTES.UNITE) return courant;
      vus.add(courant.id);
      courant = this.parent(courant);
    }
    return undefined;
  }

  /** Les parents possibles d'un élément de structure : ceux de son unité
   *  d'abord, ceux de tout le bundle si son unité n'en a pas. */
  parentsProches(element: Element, sortes: readonly (Sorte | null)[]): Element[] {
    const possibles = this.elements.filter((candidat) => sortes.includes(candidat.sorte));
    const unite = this.uniteDe(element);
    if (unite) {
      const proches = possibles.filter((candidat) => candidat.id === unite.id || this.uniteDe(candidat) === unite);
      if (proches.length > 0) return proches;
    }
    return possibles;
  }
}

function typeLisible(lecture: Lecture, zone: Element): string {
  const nom = lecture.definition(zone)?.nom ?? "à préciser";
  return nom.startsWith("Zone ") ? nom.slice("Zone ".length) : nom;
}

function recuesLisibles(recues: readonly string[]): string {
  const noms = recues
    .filter((sorte) => sorte === SORTES.SERVICE || sorte === SORTES.APPLICATION)
    .map((sorte) => (sorte === SORTES.SERVICE ? "services" : "applications"));
  return noms.length > 0 ? noms.join(" et ") : "connexions";
}

/** Le refus du placement de cet élément sous son parent, s'il y en a un. */
function placement(lecture: Lecture, element: Element): Refus | null {
  if (element.parent !== null && !lecture.parId.has(element.parent)) {
    return refus("PARENT_ABSENT",
      `L'élément parent ${element.parent} n'existe pas dans ce brouillon. Rechargez le Studio.`, element.id);
  }
  const parent = lecture.parent(element);
  const sorteDuParent = parent ? parent.sorte : null;
  const sorte = element.sorte;

  if (sorte === SORTES.ZONE || sorte === SORTES.SALLE) {
    if (parent) {
      return refus("ZONE_DANS_UNE_ZONE",
        "Une zone se place directement dans le bundle, jamais dans une autre zone.", element.id);
    }
    return null;
  }

  if (sorte === SORTES.SERVICE || sorte === SORTES.APPLICATION) {
    const compatibles = lecture.zonesQuiRecoivent(sorte);
    const ids = compatibles.map((zone) => zone.id);
    const zones = liste(compatibles, "une zone à ajouter d'abord");
    const estService = sorte === SORTES.SERVICE;
    if (sorteDuParent !== SORTES.ZONE || !parent) {
      return refus("SERVICE_HORS_ZONE",
        `${estService ? "Un service" : "Une application"} se place dans une zone d'environnement, `
        + `jamais directement dans le bundle. ${estService ? "Déposez-le" : "Déposez-la"} dans : ${zones}.`,
        element.id, ids);
    }
    if (lecture.estExterne(parent)) {
      const ou = estService
        ? "Placez ce service dans une zone robot ou serveur."
        : "Placez cette application dans une zone application web, ordinateur de bureau, "
          + "appareil mobile ou casque.";
      return refus("ZONE_EXTERNE_RESERVEE",
        "La zone Externe ne reçoit que des connexions vers des serveurs hors de vos machines. " + ou,
        element.id, ids);
    }
    const recues = lecture.recues(parent);
    if (recues !== undefined && !recues.includes(sorte)) {
      return refus("ZONE_INCOMPATIBLE",
        `La zone « ${parent.nom ?? ""} » est une zone ${typeLisible(lecture, parent)} : `
        + `elle reçoit des ${recuesLisibles(recues)}. `
        + `Placez ${estService ? "ce service" : "cette application"} dans : ${zones}.`,
        element.id, ids);
    }
    return null;
  }

  if (sorte === SORTES.UNITE) {
    if (sorteDuParent !== SORTES.SERVICE && sorteDuParent !== SORTES.APPLICATION) {
      const compatibles = lecture.deSorte(SORTES.SERVICE, SORTES.APPLICATION);
      return refus("UNITE_HORS_COMPOSANT",
        "Une unité se place dans un service ou une application. Choisissez-en un, puis "
        + "« Ajouter une unité ».", element.id, compatibles.map((composant) => composant.id));
    }
    return null;
  }

  const permis = PARENTS_PERMIS[sorte];
  if (permis.includes(sorteDuParent)) return null;
  const compatibles = lecture.parentsProches(element, permis);
  const ids = compatibles.map((candidat) => candidat.id);
  if ((sorte === SORTES.CANAL_RECEPTION || sorte === SORTES.CANAL_EMISSION)
      && (sorteDuParent === SORTES.BUS_RECEPTION || sorteDuParent === SORTES.BUS_EMISSION)) {
    const message = sorte === SORTES.CANAL_RECEPTION
      ? "Ce canal de réception ne peut pas être placé dans un bus d'émission. Placez-le dans un bus de réception."
      : "Ce canal d'émission ne peut pas être placé dans un bus de réception. Placez-le dans un bus d'émission.";
    return refus("CANAL_MAUVAIS_BUS", message, element.id, ids);
  }
  const [article, nom] = NOMS_DES_SORTES[sorte];
  const dans = parent ? NOMS_DES_SORTES[parent.sorte].join(" ") : "le bundle";
  const placez = estFeminin(sorte) ? "Placez-la" : "Placez-le";
  return refus("PARENT_INCOMPATIBLE",
    `${article.charAt(0).toUpperCase()}${article.slice(1)} ${nom} ne se place pas dans ${dans}. `
    + `${placez} dans : ${liste(compatibles, A_AJOUTER_D_ABORD)}.`,
    element.id, ids);
}

export interface OptionsDeVerification {
  /** Le document d'avant, s'il y en a un : il dit quels codes sont figés. */
  readonly avant?: ModeleBundle;
  /** Pour chaque code figé, le numéro de la première version publiée qui le contient. */
  readonly publications?: ReadonlyMap<string, number>;
}

/** Tous les refus du document ; une liste vide veut dire « accepté ». */
export function verifierModele(modele: ModeleBundle, catalogue: CatalogueIndexe,
                               options: OptionsDeVerification = {}): Refus[] {
  const lecture = new Lecture(modele, catalogue);
  const refusTrouves: Refus[] = [];
  const messageDoublon = "Deux éléments portent le même identifiant interne. Rechargez le Studio ; "
    + "si cela se reproduit, signalez-le.";

  // Les identifiants, des éléments puis des liaisons.
  for (const element of lecture.enDouble) {
    refusTrouves.push(refus("IDENTIFIANT_EN_DOUBLE", messageDoublon, element.id));
  }
  const liaisonsVues = new Set<string>();
  for (const liaison of modele.liaisons) {
    if (liaisonsVues.has(liaison.id)) refusTrouves.push(refus("IDENTIFIANT_EN_DOUBLE", messageDoublon, liaison.id));
    liaisonsVues.add(liaison.id);
  }

  // Chaque type cité est au catalogue, pour la bonne sorte.
  for (const element of lecture.elements) {
    if (element.type && !lecture.definition(element)) {
      refusTrouves.push(refus("TYPE_INCONNU_DU_CATALOGUE",
        `Le type ${element.type.code} en version ${element.type.version} n'est pas au catalogue. `
        + "Choisissez un type proposé par la palette.", element.id));
    }
  }

  // Chaque élément est à sa place.
  for (const element of lecture.elements) {
    const refusDuPlacement = placement(lecture, element);
    if (refusDuPlacement) refusTrouves.push(refusDuPlacement);
  }

  // La salle : une seule, présente si et seulement si une zone existe.
  const salles = lecture.deSorte(SORTES.SALLE);
  const zones = lecture.deSorte(SORTES.ZONE);
  for (const salle of salles.slice(1)) {
    refusTrouves.push(refus("SALLE_EN_DOUBLE", "Ce bundle a déjà sa salle temps réel. Il n'en a qu'une : "
      + "toutes ses unités s'y retrouvent.", salle.id));
  }
  const premiereSalle = salles[0];
  if (premiereSalle && zones.length === 0) {
    refusTrouves.push(refus("SALLE_SANS_ZONE", "La salle temps réel se pose seule avec la première zone. "
      + "Ajoutez d'abord une zone.", premiereSalle.id));
  }
  if (zones.length > 0 && salles.length === 0) {
    refusTrouves.push(refus("SALLE_SANS_ZONE", "La salle temps réel reste tant que le bundle a une zone. "
      + "Elle part avec la dernière."));
  }

  // Une seule zone Externe.
  for (const externe of zones.filter((zone) => lecture.estExterne(zone)).slice(1)) {
    refusTrouves.push(refus("ZONE_EXTERNE_EN_DOUBLE", "Ce bundle a déjà sa zone Externe. Posez-y tous les "
      + "serveurs qui ne sont pas chez vous.", externe.id));
  }

  // Une unité a exactement un traitement et une interface.
  for (const unite of lecture.deSorte(SORTES.UNITE)) {
    const enfants = lecture.elements.filter((element) => element.parent === unite.id).map((element) => element.sorte);
    const compter = (sorte: Sorte) => enfants.filter((enfant) => enfant === sorte).length;
    if (compter(SORTES.TRAITEMENT) !== 1 || compter(SORTES.INTERFACE) !== 1) {
      refusTrouves.push(refus("STRUCTURE_FIXE", "Une unité a toujours un traitement de base et une interface "
        + "de communication : ils naissent et partent avec elle.", unite.id));
    }
  }

  // Une zone facultative dit pourquoi le bundle fonctionne sans elle.
  for (const zone of zones) {
    const reglages = zone.reglages ?? {};
    if (reglages.exigence === EXIGENCE_FACULTATIVE && !String(reglages.justification || "").trim()) {
      refusTrouves.push(refus("JUSTIFICATION_ABSENTE", "Une zone facultative demande une justification : "
        + "dites pourquoi le bundle fonctionne sans elle.", zone.id));
    }
  }

  // Un code est unique dans sa portée : le bundle, ou l'unité pour la structure.
  const pris = new Set<string>();
  for (const element of lecture.elements) {
    let portee = "";
    let ou = "dans ce bundle";
    if (SORTES_DE_STRUCTURE.includes(element.sorte)) {
      const unite = lecture.uniteDe(element);
      if (!unite) continue; // hors d'une unité : déjà refusé pour son placement
      portee = unite.id;
      ou = "dans cette unité";
    }
    const cle = `${portee}\u0000${element.code}`;
    if (pris.has(cle)) {
      refusTrouves.push(refus("CODE_EN_DOUBLE", `Le code ${element.code} est déjà pris ${ou}. `
        + "Choisissez-en un autre.", element.id));
    }
    pris.add(cle);
  }

  // Un code figé ne change plus, et sa marque ne se retire pas.
  if (options.avant) {
    for (const ancien of options.avant.elements) {
      const actuel = lecture.parId.get(ancien.id);
      if (!ancien.code_fige || !actuel) continue;
      if (actuel.code !== ancien.code || !actuel.code_fige) {
        const version = options.publications?.get(ancien.code);
        const publie = version !== undefined ? `publié (version ${version})` : "publié";
        refusTrouves.push(refus("CODE_FIGE", `Ce code a déjà été ${publie} : il ne change plus. `
          + "Renommez plutôt le nom affiché.", actuel.id));
      }
    }
  }

  // Une liaison va d'un canal d'émission vers un canal de réception, qui existent.
  for (const liaison of modele.liaisons) {
    const source = lecture.parId.get(liaison.source);
    const destination = lecture.parId.get(liaison.destination);
    if (!source || !destination) {
      refusTrouves.push(refus("LIAISON_EXTREMITE_ABSENTE", "Une extrémité de cette liaison n'existe plus.",
        liaison.id));
    } else if (source.sorte !== SORTES.CANAL_EMISSION || destination.sorte !== SORTES.CANAL_RECEPTION) {
      refusTrouves.push(refus("LIAISON_SENS_INVERSE", "Une liaison va toujours d'une sortie vers une entrée.",
        liaison.id));
    }
  }
  return refusTrouves;
}
