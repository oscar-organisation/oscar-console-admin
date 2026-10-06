import { describe, expect, it } from "vitest";
import { cadrer, placesLibres, type Rectangle, type Vue } from "./cadrage";

/**
 * Le cadrage du canevas (étape I7) : tout le bundle se voit, dans la place que
 * laissent la mini-carte, le zoom, la légende et le conseil du haut.
 *
 * Les mesures sont celles de l'écran de 1 440 × 900 avec la palette et le
 * panneau des propriétés ouverts : un canevas de 588 × 814, la mini-carte de
 * 200 × 150 en bas à droite, le zoom et la légende repliée en bas à gauche ;
 * et le bundle de référence rangé, trois zones côte à côte.
 */
const CANEVAS = { largeur: 588, hauteur: 814 };
const MINI_CARTE: Rectangle = { x: 373, y: 649, largeur: 200, hauteur: 150 };
const ZOOM: Rectangle = { x: 15, y: 718, largeur: 32, hauteur: 81 };
const LEGENDE_REPLIEE: Rectangle = { x: 56, y: 771, largeur: 92, hauteur: 28 };
const OBSTACLES = [MINI_CARTE, ZOOM, LEGENDE_REPLIEE];
const BUNDLE_DE_REFERENCE = { largeur: 1360, hauteur: 860 };

/** Le rectangle qu'occupe le bundle à l'écran avec cette vue. */
function occupe(vue: Vue, bundle: { largeur: number; hauteur: number }): Rectangle {
  return { x: vue.x, y: vue.y, largeur: bundle.largeur * vue.zoom, hauteur: bundle.hauteur * vue.zoom };
}

function seCroisent(a: Rectangle, b: Rectangle): boolean {
  return a.x < b.x + b.largeur && b.x < a.x + a.largeur && a.y < b.y + b.hauteur && b.y < a.y + a.hauteur;
}

describe("cadrer", () => {
  it("à 1 440 px, panneaux ouverts, le bundle entier se voit et ne passe sous rien", () => {
    const vue = cadrer(BUNDLE_DE_REFERENCE, CANEVAS, OBSTACLES);
    if (!vue) throw new Error("aucune vue");
    const rectangle = occupe(vue, BUNDLE_DE_REFERENCE);
    // Tout le bundle dans le canevas : la troisième zone, à droite, comprise.
    expect(rectangle.x).toBeGreaterThanOrEqual(0);
    expect(rectangle.y).toBeGreaterThanOrEqual(0);
    expect(rectangle.x + rectangle.largeur).toBeLessThanOrEqual(CANEVAS.largeur);
    expect(rectangle.y + rectangle.hauteur).toBeLessThanOrEqual(CANEVAS.hauteur);
    for (const obstacle of OBSTACLES) expect(seCroisent(rectangle, obstacle)).toBe(false);
  });

  it("un conseil en haut du canevas repousse le bundle sous lui, même un bundle haut", () => {
    const conseil: Rectangle = { x: 40, y: 12, largeur: 508, hauteur: 40 };
    for (const bundle of [BUNDLE_DE_REFERENCE, { largeur: 600, hauteur: 1500 }]) {
      const vue = cadrer(bundle, CANEVAS, [...OBSTACLES, conseil]);
      if (!vue) throw new Error("aucune vue");
      const rectangle = occupe(vue, bundle);
      expect(seCroisent(rectangle, conseil)).toBe(false);
      expect(vue.y).toBeGreaterThanOrEqual(conseil.y + conseil.hauteur);
      for (const obstacle of OBSTACLES) expect(seCroisent(rectangle, obstacle)).toBe(false);
    }
  });

  it("un petit bundle n'est jamais grossi au-delà de sa taille réelle, et se centre dans la place libre", () => {
    const petit = { largeur: 300, hauteur: 200 };
    const vue = cadrer(petit, CANEVAS, OBSTACLES);
    expect(vue?.zoom).toBe(1);
    // Centré dans la bande au-dessus des obstacles du bas (de 0 à 649 px).
    expect(vue?.x).toBeCloseTo((CANEVAS.largeur - 300) / 2);
    expect(vue?.y).toBeCloseTo((MINI_CARTE.y - 200) / 2);
  });

  it("un bundle haut et étroit prend la bande verticale, entre le zoom et la mini-carte, si elle lui donne un plus grand zoom", () => {
    const haut = { largeur: 200, hauteur: 2000 };
    const vue = cadrer(haut, CANEVAS, OBSTACLES);
    if (!vue) throw new Error("aucune vue");
    const rectangle = occupe(vue, haut);
    for (const obstacle of OBSTACLES) expect(seCroisent(rectangle, obstacle)).toBe(false);
    // Entier dans le canevas, de haut en bas.
    expect(rectangle.y).toBeGreaterThanOrEqual(0);
    expect(rectangle.y + rectangle.hauteur).toBeLessThanOrEqual(CANEVAS.hauteur);
    // Dans la bande horizontale (649 px de haut), le zoom serait au plus 617 / 2000.
    expect(vue.zoom).toBeGreaterThan(617 / 2000);
  });

  it("un bundle trop grand pour le zoom le plus faible se cale en haut à gauche de la place libre", () => {
    const immense = { largeur: 10000, hauteur: 6000 };
    const vue = cadrer(immense, CANEVAS, OBSTACLES);
    expect(vue).toEqual({ x: 16, y: 16, zoom: 0.2 });
  });

  it("rien à cadrer tant que le canevas ou le bundle n'a pas de taille", () => {
    expect(cadrer(BUNDLE_DE_REFERENCE, { largeur: 0, hauteur: 814 }, OBSTACLES)).toBeNull();
    expect(cadrer({ largeur: 0, hauteur: 0 }, CANEVAS, OBSTACLES)).toBeNull();
  });
});

describe("placesLibres", () => {
  it("sans obstacle, la place libre est tout le canevas", () => {
    expect(placesLibres(CANEVAS, [])).toEqual([
      { x: 0, y: 0, largeur: 588, hauteur: 814 },
      { x: 0, y: 0, largeur: 588, hauteur: 814 },
    ]);
  });

  it("les obstacles du bas bornent la bande horizontale ; ceux des côtés, la bande verticale", () => {
    const [horizontale, verticale] = placesLibres(CANEVAS, OBSTACLES);
    expect(horizontale).toEqual({ x: 0, y: 0, largeur: 588, hauteur: MINI_CARTE.y });
    expect(verticale).toEqual({ x: LEGENDE_REPLIEE.x + LEGENDE_REPLIEE.largeur, y: 0, largeur: MINI_CARTE.x - 148, hauteur: 814 });
  });
});
