import { SORTES, type Sorte } from "./types";

/**
 * Les identifiants et les codes des éléments.
 *
 * Trois choses distinctes (spécification 1.3) : l'identifiant, stable et
 * jamais saisi ; le code technique, réglable jusqu'à sa première publication ;
 * le nom, libre. Ce fichier fabrique les deux premiers.
 */

/** Le préfixe de l'identifiant de chaque sorte : on reconnaît un élément à le lire. */
export const PREFIXES_DES_IDENTIFIANTS: Readonly<Record<Sorte, string>> = {
  [SORTES.ZONE]: "zon",
  [SORTES.SALLE]: "sal",
  [SORTES.SERVICE]: "svc",
  [SORTES.APPLICATION]: "app",
  [SORTES.UNITE]: "uni",
  [SORTES.TRAITEMENT]: "trt",
  [SORTES.INTERFACE]: "itf",
  [SORTES.BANDE]: "bnd",
  [SORTES.BUS_RECEPTION]: "bre",
  [SORTES.BUS_EMISSION]: "bem",
  [SORTES.CANAL_RECEPTION]: "can",
  [SORTES.CANAL_EMISSION]: "can",
};

export const PREFIXE_DES_LIAISONS = "lia";

/** Fabrique d'identifiants : les opérations la reçoivent, pour que les tests en donnent une prévisible. */
export type NouvelIdentifiant = (prefixe: string) => string;

/**
 * Un identifiant neuf : le préfixe, puis douze chiffres hexadécimaux tirés au
 * hasard par le navigateur (conception, partie 3.2). Le tirage cryptographique
 * rend une collision pratiquement impossible, sans compteur à tenir.
 */
export const identifiantAleatoire: NouvelIdentifiant = (prefixe) => {
  const octets = new Uint8Array(6);
  crypto.getRandomValues(octets);
  const chiffres = Array.from(octets, (octet) => octet.toString(16).padStart(2, "0")).join("");
  return `${prefixe}-${chiffres}`;
};

/** Longueur maximale d'un code, celle du format (`schemas/bundle.schema.json`). */
export const LONGUEUR_DU_CODE = 128;

/**
 * Un code tiré d'un nom : majuscules sans accent, mots séparés par « _ »,
 * précédé du préfixe de sa sorte. « Téléopération du M3 » devient
 * `BUNDLE_DEPLOIEMENT_TELEOPERATION_DU_M3`.
 *
 * C'est la même règle que le serveur (`code_depuis_nom`, dans
 * `app/studio_modele/brouillons.py`) : un même nom donne le même code des deux côtés.
 */
export function codeDepuisNom(prefixe: string, nom: string): string {
  // La décomposition sépare chaque lettre de son accent ; on ne garde ensuite
  // que les caractères ASCII, comme le serveur.
  const sansAccents = Array.from((nom || "").normalize("NFKD"))
    .filter((caractere) => caractere.charCodeAt(0) < 128)
    .join("");
  const mots = sansAccents.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
  const code = mots ? `${prefixe}_${mots}` : prefixe;
  return code.slice(0, LONGUEUR_DU_CODE).replace(/_+$/, "");
}
