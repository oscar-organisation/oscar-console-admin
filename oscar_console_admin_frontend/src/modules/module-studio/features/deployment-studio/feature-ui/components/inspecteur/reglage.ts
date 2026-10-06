import type { ChampsReglables } from "../../../feature-domain/modele/operations";
import type { LienDuChamp, ResultatDuChamp } from "./champs";

/**
 * Ce qu'un formulaire de l'inspecteur peut faire à son élément : régler des
 * champs (un geste), en montrer l'aperçu pendant la frappe, ou abandonner cet
 * aperçu. L'éditeur le fabrique à partir du magasin du brouillon.
 */
export interface Reglage<Champs = ChampsReglables> {
  readonly regler: (champs: Champs) => ResultatDuChamp;
  readonly apercu: (champs: Champs) => void;
  readonly abandonner: () => void;
}

/** Le lien d'un champ de texte avec un champ du modèle : nom, code, description. */
export function lienDuChamp<Champs>(reglage: Reglage<Champs>, versLesChamps: (valeur: string) => Champs): LienDuChamp {
  return {
    onValider: (valeur) => reglage.regler(versLesChamps(valeur)),
    onApercu: (valeur) => reglage.apercu(versLesChamps(valeur)),
    onAbandon: reglage.abandonner,
  };
}
