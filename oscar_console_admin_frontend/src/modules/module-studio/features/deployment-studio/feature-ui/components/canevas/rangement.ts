import {
  FORMAT_DE_LA_MISE_EN_PAGE,
  SORTES,
  type Element,
  type MiseEnPage,
  type ModeleBundle,
  type Position,
} from "../../../feature-domain/modele/types";
import { TYPE_DE_LA_ZONE_EXTERNE } from "../../../feature-domain/modele/regles";
import { MESURES, tailleDuComposant } from "./disposition";

/**
 * La disposition automatique d'un bundle : une mise en page propre, régulière
 * et toujours la même pour le même modèle (le bouton « Ranger », et un bundle
 * repris de l'ancienne console ou venu sans mise en page).
 *
 * Les règles, pour que le canevas se lise sans deviner :
 * - les zones côte à côte, dans le sens où va la donnée (une sortie est à
 *   droite d'un bloc, une entrée à sa gauche) : d'abord les zones
 *   d'application (l'opérateur, qui commande), puis les zones de robot, de
 *   serveur, de simulateur ou à préciser, et la zone Externe à droite ; dans
 *   chaque groupe, les zones reliées avant les autres, et la zone qui envoie
 *   avant celle qui reçoit ;
 * - dans une zone, les services et les applications en grille, eux aussi dans
 *   le sens de la donnée, avec des espaces réguliers ;
 * - la salle en haut du cadre du bundle.
 *
 * Une mise en page déjà là (celle de l'ancien éditeur, par exemple) ne sert
 * que d'indice pour l'ordre, à rang égal : de gauche à droite pour les zones,
 * de haut en bas puis de gauche à droite pour les blocs d'une zone ; à défaut,
 * l'ordre de la liste.
 */

const AUCUNE: MiseEnPage = { format: FORMAT_DE_LA_MISE_EN_PAGE, blocs: {} };

/** Au plus trois colonnes de blocs dans une zone : au-delà, la zone deviendrait trop large pour l'écran. */
const COLONNES_AU_PLUS = 3;

/**
 * Le rang de chaque bloc dans le sens de la donnée : 0 pour un bloc dont
 * rien ne lui arrive, puis un de plus que le plus grand rang de ceux qui lui
 * envoient. Une boucle (A vers B vers A) s'arrête après autant de tours que de
 * blocs : le rang reste fini, et toujours le même.
 */
function rangs(ids: readonly string[], fleches: readonly (readonly [string, string])[]): Map<string, number> {
  const rang = new Map(ids.map((id) => [id, 0]));
  for (let tour = 0; tour < ids.length; tour += 1) {
    let change = false;
    for (const [de, vers] of fleches) {
      const suivant = (rang.get(de) ?? 0) + 1;
      if (suivant > (rang.get(vers) ?? 0) && suivant < ids.length) {
        rang.set(vers, suivant);
        change = true;
      }
    }
    if (!change) break;
  }
  return rang;
}

/** Trie des identifiants par rang, puis par l'indice d'ordre, puis par leur place dans la liste. */
function trier(ids: readonly string[], rang: ReadonlyMap<string, number>,
               indice: (id: string) => readonly number[]): string[] {
  const rangDansLaListe = new Map(ids.map((id, position) => [id, position]));
  return [...ids].sort((a, b) => {
    const parRang = (rang.get(a) ?? 0) - (rang.get(b) ?? 0);
    if (parRang !== 0) return parRang;
    const [ia, ib] = [indice(a), indice(b)];
    for (let rangDeLaCle = 0; rangDeLaCle < Math.max(ia.length, ib.length); rangDeLaCle += 1) {
      const ecart = (ia[rangDeLaCle] ?? Infinity) - (ib[rangDeLaCle] ?? Infinity);
      if (ecart !== 0 && !Number.isNaN(ecart)) return ecart;
    }
    return (rangDansLaListe.get(a) ?? 0) - (rangDansLaListe.get(b) ?? 0);
  });
}

/**
 * Les types de zone qui ne reçoivent que des applications (navigateur web,
 * ordinateur de bureau, appareil mobile, casque) : la personne qui commande y
 * travaille, elle se place à gauche. Ce sont les types de la partie 5.4 de la
 * spécification, écrits comme dans le catalogue.
 */
const TYPES_DE_ZONE_D_APPLICATION: readonly string[] = [
  "TYPE_ENVIRONNEMENT_EXECUTION_NAVIGATEUR_WEB",
  "TYPE_ENVIRONNEMENT_EXECUTION_ORDINATEUR_BUREAU",
  "TYPE_ENVIRONNEMENT_EXECUTION_APPAREIL_MOBILE",
  "TYPE_ENVIRONNEMENT_EXECUTION_CASQUE_REALITE_VIRTUELLE",
];

function recoitSeulementDesApplications(zone: Element): boolean {
  return zone.type !== undefined && TYPES_DE_ZONE_D_APPLICATION.includes(zone.type.code);
}

/** Range un bundle. `indice` est la mise en page d'avant, qui ne donne que l'ordre. */
export function ranger(modele: ModeleBundle, indice: MiseEnPage = AUCUNE): MiseEnPage {
  const { elements } = modele;
  const parId = new Map(elements.map((element) => [element.id, element]));
  const blocs: Record<string, Position> = {};

  // Le composant (service ou application) qui porte chaque élément, en remontant ses parents.
  const composantDe = (id: string): Element | undefined => {
    const vus = new Set<string>();
    let courant = parId.get(id);
    while (courant && !vus.has(courant.id)) {
      if (courant.sorte === SORTES.SERVICE || courant.sorte === SORTES.APPLICATION) return courant;
      vus.add(courant.id);
      courant = courant.parent ? parId.get(courant.parent) : undefined;
    }
    return undefined;
  };

  // Les liaisons, ramenées aux composants qui les portent, puis aux zones.
  const flechesEntreComposants: [Element, Element][] = [];
  for (const liaison of modele.liaisons) {
    const de = composantDe(liaison.source);
    const vers = composantDe(liaison.destination);
    if (de && vers && de.id !== vers.id) flechesEntreComposants.push([de, vers]);
  }

  const zones = elements.filter((element) => element.sorte === SORTES.ZONE && element.parent === null);
  const idsDesZones = zones.map((zone) => zone.id);
  const flechesEntreZones = flechesEntreComposants
    .filter(([de, vers]) => de.parent !== vers.parent && de.parent !== null && vers.parent !== null)
    .map(([de, vers]) => [de.parent, vers.parent] as [string, string]);
  const zonesReliees = new Set(flechesEntreZones.flat());
  const rangDesZones = rangs(idsDesZones, flechesEntreZones);
  const indiceDeZone = (id: string) => {
    const position = indice.blocs[id];
    return position ? [position.x, position.y] : [];
  };
  // Le groupe de chaque zone, de gauche à droite : les applications, puis les machines, puis l'Externe.
  const groupeDeLaZone = (id: string): number => {
    const zone = parId.get(id);
    if (zone?.type?.code === TYPE_DE_LA_ZONE_EXTERNE) return 2;
    return zone && recoitSeulementDesApplications(zone) ? 0 : 1;
  };
  // Dans chaque groupe : les zones reliées d'abord, dans le sens de la donnée ; les autres ensuite.
  const ordreDesZones = [0, 1, 2].flatMap((groupe) => {
    const duGroupe = idsDesZones.filter((id) => groupeDeLaZone(id) === groupe);
    return [
      ...trier(duGroupe.filter((id) => zonesReliees.has(id)), rangDesZones, indiceDeZone),
      ...trier(duGroupe.filter((id) => !zonesReliees.has(id)), new Map(), indiceDeZone),
    ];
  });

  let gaucheDeLaZone = MESURES.margeDuCadre;
  for (const idDeZone of ordreDesZones) {
    const composants = elements.filter((element) => element.parent === idDeZone
      && (element.sorte === SORTES.SERVICE || element.sorte === SORTES.APPLICATION));
    const ids = composants.map((composant) => composant.id);
    const fleches = flechesEntreComposants
      .filter(([de, vers]) => de.parent === idDeZone && vers.parent === idDeZone)
      .map(([de, vers]) => [de.id, vers.id] as [string, string]);
    const indiceDeBloc = (id: string) => {
      const position = indice.blocs[id];
      return position ? [position.y, position.x] : [];
    };
    const ordre = trier(ids, rangs(ids, fleches), indiceDeBloc);
    const colonnes = ordre.length <= 2 ? 1 : Math.min(COLONNES_AU_PLUS, Math.ceil(Math.sqrt(ordre.length)));

    // Une grille : chaque rangée prend la hauteur de son bloc le plus haut.
    let hautDeLaRangee = MESURES.enTeteDeZone;
    for (let debut = 0; debut < ordre.length; debut += colonnes) {
      const rangee = ordre.slice(debut, debut + colonnes);
      let hauteurDeLaRangee = 0;
      rangee.forEach((id, colonne) => {
        const composant = parId.get(id);
        if (!composant) return;
        blocs[id] = {
          x: MESURES.margeDeZone + colonne * (MESURES.largeurDuComposant + MESURES.espaceEntreComposants),
          y: hautDeLaRangee,
        };
        hauteurDeLaRangee = Math.max(hauteurDeLaRangee, tailleDuComposant(elements, composant).hauteur);
      });
      hautDeLaRangee += hauteurDeLaRangee + MESURES.espaceEntreComposants;
    }

    blocs[idDeZone] = { x: gaucheDeLaZone, y: MESURES.hautDesZones };
    const largeurDuContenu = colonnes * MESURES.largeurDuComposant + (colonnes - 1) * MESURES.espaceEntreComposants;
    const largeurDeLaZone = Math.max(MESURES.largeurMinimaleDeZone, largeurDuContenu + 2 * MESURES.margeDeZone);
    gaucheDeLaZone += largeurDeLaZone + MESURES.espaceEntreZones;
  }

  // La salle, en haut du cadre ; une salle en trop (un bundle fautif) se range à sa droite.
  elements.filter((element) => element.sorte === SORTES.SALLE && element.parent === null).forEach((salle, rang) => {
    blocs[salle.id] = {
      x: MESURES.positionDeLaSalle.x + rang * (MESURES.largeurDeLaSalle + MESURES.espaceEntreZones),
      y: MESURES.positionDeLaSalle.y,
    };
  });

  return { format: FORMAT_DE_LA_MISE_EN_PAGE, blocs };
}

/**
 * La mise en page montrée à l'ouverture d'un brouillon : celle du serveur,
 * sauf pour un bundle repris de l'ancienne console et pas encore enregistré,
 * ou venu sans aucune mise en page ; ceux-là s'ouvrent rangés, leur ancienne
 * mise en page ne donnant que l'ordre. Elle s'enregistre avec le premier geste.
 */
export function miseEnPageALOuverture(brouillon: {
  readonly modele: ModeleBundle;
  readonly mise_en_page: MiseEnPage;
  readonly origine: { readonly sorte?: unknown };
  readonly revision: number;
}): MiseEnPage {
  const reprise = brouillon.origine.sorte === "ANCIEN_FORMAT" && brouillon.revision === 0;
  const vide = Object.keys(brouillon.mise_en_page.blocs).length === 0;
  return reprise || vide ? ranger(brouillon.modele, brouillon.mise_en_page) : brouillon.mise_en_page;
}
