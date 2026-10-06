import { NOMS_DES_SORTES } from "../feature-domain/modele/regles";
import type { EtatDEnregistrement } from "../feature-domain/brouillonStore";
import type { Sorte, TypeDuCatalogue } from "../feature-domain/modele/types";

/**
 * Les petites règles d'écriture des écrans du Studio : chercher sans tenir
 * compte des accents, compter avec le bon pluriel. Elles vivent ici pour que
 * deux écrans écrivent la même chose de la même façon.
 */

/** Un texte sans accents ni majuscules : « Téléopération » et « teleoperation » se trouvent pareil. */
export function sansAccents(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Le type répond-il à la recherche ? Son nom, sa description, son exemple ou son code. */
export function correspond(type: TypeDuCatalogue, recherche: string): boolean {
  const mot = sansAccents(recherche.trim());
  if (!mot) return true;
  return [type.nom, type.description, type.exemple, type.code].some((texte) => sansAccents(texte).includes(mot));
}

/** « 1 zone », « 3 zones ». */
export function pluriel(nombre: number, mot: string): string {
  return `${nombre} ${mot}${nombre > 1 ? "s" : ""}`;
}

/** « une unité, 2 bus de réception » : des éléments comptés par sorte, dans l'ordre où ils viennent. */
export function compterParSorte(sortes: readonly Sorte[]): string[] {
  const comptes = new Map<Sorte, number>();
  for (const sorte of sortes) comptes.set(sorte, (comptes.get(sorte) ?? 0) + 1);
  return [...comptes].map(([sorte, nombre]) => {
    const [article, nom] = NOMS_DES_SORTES[sorte];
    if (nombre === 1) return `${article} ${nom}`;
    // Le pluriel d'un nom composé porte sur son premier mot ; « bus » et « canal » ont le leur.
    const [premier = "", ...reste] = nom.split(" ");
    const auPluriel = premier === "bus" ? "bus" : premier === "canal" ? "canaux" : `${premier}s`;
    return `${nombre} ${[auPluriel, ...reste].join(" ")}`;
  });
}

/** Ce que disent les mots de l'enregistrement, dans la barre du haut et la barre d'état (conception, partie 6.1). */
export const MOTS_DE_L_ENREGISTREMENT: Readonly<Record<EtatDEnregistrement, string>> = {
  JAMAIS_ENREGISTRE: "Pas encore enregistré",
  ENREGISTRE: "Enregistré",
  MODIFIE: "Modifications en cours",
  EN_COURS: "Enregistrement...",
  CONFLIT: "Conflit avec un autre poste",
  ECHEC: "Non enregistré",
  REFUSE: "Refusé par le serveur",
};
