/**
 * La forme des champs que l'inspecteur fait saisir : celle du format
 * `oscar.bundle/1` (schémas des formats OSCAR, `codes-stables.schema.json`,
 * `types-communs.schema.json` ; côté serveur, `app/studio_modele/formats.py`).
 *
 * Ce ne sont pas des règles du modèle (elles sont dans regles.ts) : c'est la
 * forme d'une valeur saisie. Le serveur refuserait un document mal formé et
 * l'enregistrement s'arrêterait ; l'inspecteur le dit donc avant, sous le
 * champ, avec ce qu'il faut écrire.
 */

export const MOTIF_DU_CODE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;
export const LONGUEUR_DU_CODE = 128;
export const LONGUEUR_DU_NOM = 120;
export const LONGUEUR_DE_LA_DESCRIPTION = 1000;
export const LONGUEUR_DE_LA_JUSTIFICATION = 500;

export type SorteDeChamp = "code" | "nom" | "description" | "justification";

/** Ce qui ne va pas dans la valeur saisie, en une phrase qui dit quoi faire ; `null` si elle convient. */
export function problemeDeForme(champ: SorteDeChamp, valeur: string): string | null {
  if (champ === "code") {
    if (!valeur) return "Le code ne peut pas être vide.";
    if (valeur.length > LONGUEUR_DU_CODE) return `Le code tient en ${LONGUEUR_DU_CODE} caractères au plus.`;
    if (!MOTIF_DU_CODE.test(valeur)) {
      return "Un code s'écrit en majuscules sans accent, les mots séparés par _, "
        + "par exemple ZONE_ENVIRONNEMENT_EXECUTION_ROBOT.";
    }
    return null;
  }
  if (champ === "nom") {
    if (!valeur) return "Le nom ne peut pas être vide.";
    if (valeur.length > LONGUEUR_DU_NOM) return `Le nom tient en ${LONGUEUR_DU_NOM} caractères au plus.`;
    return null;
  }
  if (champ === "justification") {
    if (valeur.length > LONGUEUR_DE_LA_JUSTIFICATION) {
      return `La justification tient en ${LONGUEUR_DE_LA_JUSTIFICATION} caractères au plus.`;
    }
    return null;
  }
  if (valeur.length > LONGUEUR_DE_LA_DESCRIPTION) {
    return `La description tient en ${LONGUEUR_DE_LA_DESCRIPTION} caractères au plus.`;
  }
  return null;
}
