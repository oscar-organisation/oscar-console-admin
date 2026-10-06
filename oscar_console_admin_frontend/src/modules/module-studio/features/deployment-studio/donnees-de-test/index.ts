import catalogueJson from "./reponses-du-serveur/catalogue.json";
import brouillonReferenceJson from "./reponses-du-serveur/brouillon-reference.json";
import brouillonRepriseJson from "./reponses-du-serveur/brouillon-reprise-ancien-format.json";
import { indexerCatalogue } from "../feature-domain/modele/regles";
import type { ContexteDesOperations } from "../feature-domain/modele/operations";
import type { NouvelIdentifiant } from "../feature-domain/modele/identifiants";
import type { CatalogueStudio, EtatStudio, MiseEnPage, ModeleBundle } from "../feature-domain/modele/types";

/**
 * Les données des tests du Studio, prêtes à l'emploi.
 *
 * Les fichiers JSON de ce dossier sont des réponses réelles du serveur (voir
 * `reponses-du-serveur/SOURCE.txt`) et une copie des formats OSCAR (voir
 * `formats_oscar_v1/SOURCE.txt`). Ce fichier ne sert qu'aux tests : rien de
 * l'application ne l'importe.
 */

/** La réponse de `GET /studio/brouillon`, telle que les tests la lisent. */
export interface BrouillonDeTest {
  readonly bundle_id: string;
  readonly format: string;
  readonly modele: ModeleBundle;
  readonly mise_en_page: MiseEnPage;
  readonly revision: number;
  readonly etat: string;
  readonly origine: Readonly<Record<string, unknown>>;
  readonly reprise: Readonly<Record<string, unknown>> | null;
  readonly modifie_le: string | null;
  readonly modifie_par: string | null;
}

// Les fichiers JSON sont lus comme du texte typé par TypeScript : on leur
// donne ici le type du format, qu'ils respectent (le serveur les a produits).
export const catalogueDeTest = catalogueJson as unknown as CatalogueStudio;
export const brouillonDeReference = brouillonReferenceJson as unknown as BrouillonDeTest;
export const brouillonRepris = brouillonRepriseJson as unknown as BrouillonDeTest;

/** Des identifiants prévisibles, « nouv-1 », « nouv-2 »... comme ceux des cas du serveur. */
export function identifiantsPrevisibles(): NouvelIdentifiant {
  let compteur = 0;
  return () => {
    compteur += 1;
    return `nouv-${compteur}`;
  };
}

export function contexteDeTest(nouvelIdentifiant: NouvelIdentifiant = identifiantsPrevisibles()): ContexteDesOperations {
  return { catalogue: indexerCatalogue(catalogueDeTest), nouvelIdentifiant };
}

export function etatDepuisBrouillon(brouillon: BrouillonDeTest): EtatStudio {
  return { modele: brouillon.modele, miseEnPage: brouillon.mise_en_page };
}

/**
 * Fige un objet et tout ce qu'il contient, sur place : toute tentative de le
 * modifier lève ensuite une erreur (les modules sont en mode strict).
 */
export function gelerSurPlace<T>(valeur: T): T {
  if (valeur === null || typeof valeur !== "object" || Object.isFrozen(valeur)) return valeur;
  Object.freeze(valeur);
  for (const enfant of Object.values(valeur)) gelerSurPlace(enfant);
  return valeur;
}

/** Une copie profonde, figée : toute tentative de la modifier lève une erreur. */
export function figer<T>(valeur: T): T {
  // Les données du Studio sont du JSON : une copie par JSON est complète.
  return gelerSurPlace(JSON.parse(JSON.stringify(valeur)) as T);
}

/** Un état figé du bundle de référence : un test qui le modifierait échouerait aussitôt. */
export function etatDeReference(): EtatStudio {
  return figer(etatDepuisBrouillon(brouillonDeReference));
}

/** Un bundle neuf, sans rien encore. */
export function etatVide(): EtatStudio {
  return figer({
    modele: {
      format: "oscar.bundle/1",
      bundle: { code: "BUNDLE_DEPLOIEMENT_ESSAI", nom: "Essai" },
      elements: [],
      liaisons: [],
    },
    miseEnPage: { format: "oscar.mise-en-page/1", blocs: {} },
  });
}
