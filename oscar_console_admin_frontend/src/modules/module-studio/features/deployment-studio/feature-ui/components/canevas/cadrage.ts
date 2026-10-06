/**
 * Le cadrage du canevas : à quel zoom et à quelle place montrer tout le
 * bundle, dans la place que la personne voit vraiment.
 *
 * Le canevas est déjà réduit par la palette, à gauche, et par le panneau des
 * propriétés, à droite : sa taille est celle qui reste entre les deux. Mais
 * des éléments flottent par-dessus : la mini-carte et le zoom en bas, la
 * légende, le conseil « Ranger » en haut. React Flow les ignore quand il
 * ajuste la vue (`fitView`, version 12.11.6) : le bundle peut finir dessous.
 * Ce cadrage, lui, les évite : il cherche la plus grande place libre, puis y
 * pose le bundle entier.
 *
 * Fonction pure : la même taille de canevas et les mêmes obstacles donnent
 * toujours la même vue.
 */

/** Un rectangle, en pixels de l'écran, mesuré depuis le coin haut gauche du canevas. */
export interface Rectangle {
  readonly x: number;
  readonly y: number;
  readonly largeur: number;
  readonly hauteur: number;
}

/** La vue de React Flow : le déplacement du dessin et son zoom. */
export interface Vue {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface OptionsDuCadrage {
  /** Le zoom le plus faible permis ; un bundle plus grand se cale alors en haut à gauche de la place libre. */
  readonly zoomMinimal: number;
  /** Le zoom le plus fort : on ne grossit jamais le bundle au-delà de sa taille réelle. */
  readonly zoomMaximal: number;
  /** L'espace laissé entre le bundle et les bords de la place libre. */
  readonly marge: number;
}

export const CADRAGE_PAR_DEFAUT: OptionsDuCadrage = { zoomMinimal: 0.2, zoomMaximal: 1, marge: 16 };

/**
 * Le plus grand intervalle libre de [0, longueur], quand des obstacles en
 * occupent des morceaux ; à longueur égale, le premier.
 */
function plusGrandIntervalleLibre(longueur: number, occupes: readonly (readonly [number, number])[]): readonly [number, number] {
  const tries = [...occupes].sort((a, b) => a[0] - b[0]);
  let meilleur: readonly [number, number] = [0, 0];
  let debut = 0;
  for (const [de, a] of tries) {
    if (de - debut > meilleur[1] - meilleur[0]) meilleur = [debut, de];
    debut = Math.max(debut, a);
  }
  if (longueur - debut > meilleur[1] - meilleur[0]) meilleur = [debut, longueur];
  return meilleur;
}

/**
 * Les deux places libres possibles, qui évitent tous les obstacles :
 * - la plus grande bande sur toute la largeur du canevas (entre ce qui flotte
 *   en haut et ce qui flotte en bas) ;
 * - la plus grande bande sur toute sa hauteur (entre ce qui flotte à gauche et
 *   ce qui flotte à droite).
 * Chaque obstacle bloque, dans la bande horizontale, toute sa hauteur, et dans
 * la bande verticale, toute sa largeur.
 */
export function placesLibres(canevas: { readonly largeur: number; readonly hauteur: number }, obstacles: readonly Rectangle[]): Rectangle[] {
  const { largeur, hauteur } = canevas;
  const visibles = obstacles.filter((obstacle) => obstacle.largeur > 0 && obstacle.hauteur > 0);
  const [haut, bas] = plusGrandIntervalleLibre(hauteur, visibles.map((o) => [o.y, o.y + o.hauteur] as const));
  const [gauche, droite] = plusGrandIntervalleLibre(largeur, visibles.map((o) => [o.x, o.x + o.largeur] as const));
  return [
    { x: 0, y: haut, largeur, hauteur: bas - haut },
    { x: gauche, y: 0, largeur: droite - gauche, hauteur },
  ].filter((place) => place.largeur > 0 && place.hauteur > 0);
}

/** Le zoom qui fait tenir une taille dans une place, marges comprises, borné par les options. */
function zoomPour(taille: { readonly largeur: number; readonly hauteur: number }, place: Rectangle, options: OptionsDuCadrage): number {
  const zoom = Math.min((place.largeur - 2 * options.marge) / taille.largeur, (place.hauteur - 2 * options.marge) / taille.hauteur);
  return Math.min(options.zoomMaximal, Math.max(options.zoomMinimal, zoom));
}

/**
 * La vue qui montre tout le bundle (sa taille au zoom 1) dans la plus grande
 * place libre du canevas. Le bundle y est centré ; s'il ne tient pas au zoom
 * le plus faible, il se cale en haut à gauche de cette place, et la mini-carte
 * montre le reste.
 */
export function cadrer(
  bundle: { readonly largeur: number; readonly hauteur: number },
  canevas: { readonly largeur: number; readonly hauteur: number },
  obstacles: readonly Rectangle[],
  options: OptionsDuCadrage = CADRAGE_PAR_DEFAUT,
): Vue | null {
  if (bundle.largeur <= 0 || bundle.hauteur <= 0 || canevas.largeur <= 0 || canevas.hauteur <= 0) return null;
  const places = placesLibres(canevas, obstacles);
  // Sans place libre (des obstacles partout), tout le canevas, comme si rien ne flottait dessus.
  const choix = places.length > 0 ? places : [{ x: 0, y: 0, largeur: canevas.largeur, hauteur: canevas.hauteur }];
  // La place qui donne le plus grand zoom ; à zoom égal, la première (la bande horizontale).
  let meilleure = choix[0] as Rectangle;
  let meilleurZoom = zoomPour(bundle, meilleure, options);
  for (const place of choix.slice(1)) {
    const zoom = zoomPour(bundle, place, options);
    if (zoom > meilleurZoom + 1e-9) {
      meilleure = place;
      meilleurZoom = zoom;
    }
  }
  // Centré s'il tient, sinon contre la marge du haut ou de la gauche.
  const placer = (debut: number, place: number, taille: number) => (taille * meilleurZoom <= place - 2 * options.marge
    ? debut + (place - taille * meilleurZoom) / 2
    : debut + options.marge);
  return {
    x: placer(meilleure.x, meilleure.largeur, bundle.largeur),
    y: placer(meilleure.y, meilleure.hauteur, bundle.hauteur),
    zoom: meilleurZoom,
  };
}
