/**
 * Les réglages d'affichage propres à une personne, gardés dans son
 * navigateur : la légende repliée ou ouverte, le guide déjà vu. Ce ne sont
 * pas des données du bundle (conception du lot L1, partie 3.3) : s'ils se
 * perdent (navigation privée, stockage refusé), l'écran reprend ses valeurs
 * par défaut, sans gêner personne.
 */

/** La clé du guide est celle de l'ancien éditeur : quelqu'un qui l'a déjà fermé ne le revoit pas. */
const CLE_DU_GUIDE = "oscar.studio.guide.dismissed";
const CLE_DE_LA_LEGENDE = "oscar.studio.affichage.v1:legende";

function lire(cle: string): string | null {
  try {
    return window.localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrire(cle: string, valeur: string): void {
  try {
    window.localStorage.setItem(cle, valeur);
  } catch {
    // Stockage refusé : le choix vaut pour cette page seulement.
  }
}

export function guideDejaVu(): boolean {
  return lire(CLE_DU_GUIDE) === "true";
}

export function retenirLeGuideVu(): void {
  ecrire(CLE_DU_GUIDE, "true");
}

/**
 * La légende est repliée tant que la personne ne l'a pas ouverte : ouverte,
 * elle couvrirait le bas du canevas (étape I7). Une fois ouverte, elle le
 * reste aux visites suivantes, jusqu'à ce qu'on la replie.
 */
export function legendeOuverte(): boolean {
  return lire(CLE_DE_LA_LEGENDE) === "ouverte";
}

export function retenirLaLegende(ouverte: boolean): void {
  ecrire(CLE_DE_LA_LEGENDE, ouverte ? "ouverte" : "repliee");
}
