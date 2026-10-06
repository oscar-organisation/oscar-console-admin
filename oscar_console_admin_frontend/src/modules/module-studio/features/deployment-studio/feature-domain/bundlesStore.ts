import { useLayoutEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/auth/AuthContext.jsx";
import { normalizeError } from "@/shared/kernel/errors";
import {
  archiverBundle,
  creerBundle,
  listerBundles,
  supprimerBundle,
  type BundleServeur,
  type DepartDUnBundle,
} from "../feature-data/studioApi";

/**
 * La liste des bundles du nouveau Studio (conception du lot L1, parties 6.1 et 6.3).
 *
 * Le serveur fait foi, et lui seul : la liste vient de lui, un bundle se crée
 * chez lui. Si le serveur ne répond pas, l'écran montre « erreur de
 * chargement », sa cause et « Réessayer », jamais une liste gardée dans le
 * navigateur : l'ancien Studio en affichait une, qui pouvait mentir.
 * Ce module n'écrit donc rien dans le navigateur.
 */

export type EtatDeLaListe = "INACTIF" | "CHARGEMENT" | "PRET" | "ERREUR";

export interface EtatDesBundles {
  readonly bundles: readonly BundleServeur[];
  readonly chargement: EtatDeLaListe;
  /** La cause d'une erreur de chargement, en mots. */
  readonly erreur: string | null;
}

const ETAT_INITIAL: EtatDesBundles = { bundles: [], chargement: "INACTIF", erreur: null };

let etat: EtatDesBundles = ETAT_INITIAL;
let perimetre = "";
/** Monte à chaque changement d'organisation : une réponse d'avant est ignorée. */
let generation = 0;
const abonnes = new Set<() => void>();

function publier(suivant: Partial<EtatDesBundles>): void {
  etat = { ...etat, ...suivant };
  for (const abonne of abonnes) abonne();
}

export function configurerPerimetre(utilisateur: string | null, organisation: string | null): void {
  const suivant = utilisateur ? `${utilisateur}:${organisation ?? "global"}` : "";
  if (suivant === perimetre) return;
  perimetre = suivant;
  generation += 1;
  etat = ETAT_INITIAL;
  for (const abonne of abonnes) abonne();
}

/** Relit la liste sur le serveur. */
export async function rafraichir(): Promise<void> {
  const contexte = generation;
  publier({ chargement: "CHARGEMENT", erreur: null });
  try {
    const bundles = await listerBundles();
    if (contexte !== generation) return;
    publier({ bundles, chargement: "PRET" });
  } catch (erreur) {
    if (contexte !== generation) return;
    // Pas de liste de repli : la liste d'avant s'efface, la cause s'affiche.
    publier({ bundles: [], chargement: "ERREUR", erreur: normalizeError(erreur).userMessage });
  }
}

/** Crée un bundle sur le serveur, avec son point de départ, et le range en tête de liste. */
export async function creer(entree: { nom: string; description: string; depart: DepartDUnBundle }): Promise<BundleServeur> {
  const contexte = generation;
  const bundle = await creerBundle(entree);
  if (contexte === generation) publier({ bundles: [bundle, ...etat.bundles] });
  return bundle;
}

/** Range un bundle hors du plan de travail, ou l'en ressort ; rien n'est effacé. */
export async function archiver(bundle: BundleServeur, archive: boolean): Promise<void> {
  const contexte = generation;
  const suivant = await archiverBundle(bundle.id, bundle.nom, archive);
  if (contexte !== generation) return;
  publier({ bundles: etat.bundles.map((item) => (item.id === bundle.id ? suivant : item)) });
}

/** Supprime un bundle ; il ne quitte la liste qu'une fois la suppression confirmée par le serveur. */
export async function supprimer(bundle: BundleServeur): Promise<void> {
  const contexte = generation;
  await supprimerBundle(bundle.id);
  if (contexte !== generation) return;
  publier({ bundles: etat.bundles.filter((item) => item.id !== bundle.id) });
}

function abonner(abonne: () => void): () => void {
  abonnes.add(abonne);
  return () => abonnes.delete(abonne);
}

export function lireEtat(): EtatDesBundles {
  return etat;
}

export function useBundles(): EtatDesBundles {
  return useSyncExternalStore(abonner, lireEtat, lireEtat);
}

/** Tient le périmètre (utilisateur, organisation) à jour pendant que la liste est affichée. */
export function useBundlesPerimetre(): string {
  const { user, activeOrganisationId } = useAuth();
  const utilisateur = user?.id ?? null;
  useLayoutEffect(() => {
    configurerPerimetre(utilisateur, activeOrganisationId);
    return () => configurerPerimetre(null, null);
  }, [utilisateur, activeOrganisationId]);
  return `${utilisateur ?? ""}:${activeOrganisationId ?? ""}`;
}
