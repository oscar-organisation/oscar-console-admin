import { useLayoutEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/auth/AuthContext.jsx";
import { normalizeError } from "@/shared/kernel/errors";
import {
  enregistrerBrouillon,
  lireBrouillon,
  lireCatalogue,
  verifierBrouillon,
  type BrouillonServeur,
  type VerificationDuBrouillon,
} from "../feature-data/studioApi";
import {
  abandonner,
  annuler as annulerDansLHistorique,
  conclure,
  creerHistorique,
  jouerGeste,
  previsualiser as previsualiserDansLHistorique,
  pousser,
  retablir as retablirDansLHistorique,
  type Historique,
} from "./modele/historique";
import { identifiantAleatoire } from "./modele/identifiants";
import { appliquerGeste, type ContexteDesOperations, type Geste, type ResultatDUnGeste } from "./modele/operations";
import { indexerCatalogue } from "./modele/regles";
import type { CatalogueStudio, EtatStudio, MiseEnPage, ModeleBundle } from "./modele/types";

/**
 * Le brouillon ouvert dans l'éditeur du nouveau Studio : le lire, le modifier
 * geste par geste, l'enregistrer (conception du lot L1, partie 6.3).
 *
 * Le serveur fait foi. À l'ouverture, l'éditeur lit le brouillon du serveur ;
 * chaque enregistrement envoie le document entier avec la révision dont il
 * part, et le serveur refuse sans rien écraser si quelqu'un a enregistré
 * entre-temps : le conflit se montre, et la personne choisit.
 *
 * Le navigateur garde une copie locale de secours, écrite après chaque geste
 * et effacée dès que le serveur a confirmé le même contenu. Elle sert si la
 * page se ferme avant l'enregistrement : à la réouverture, elle est PROPOSÉE,
 * jamais appliquée seule, et ne prime jamais sur le serveur.
 *
 * Ce module suit la façon de faire de la console : un état unique, des
 * fonctions qui le changent, et `useSyncExternalStore` pour que React relise
 * l'état à chaque changement.
 */

/** Ce que l'écran dit de l'enregistrement, en mots (conception, partie 6.1). */
export type EtatDEnregistrement =
  /** Rien n'a encore été enregistré : un bundle neuf, ou la reprise d'un ancien. */
  | "JAMAIS_ENREGISTRE"
  /** « Enregistré » : le serveur a le même contenu que l'écran. */
  | "ENREGISTRE"
  /** « Modifications en cours » : l'enregistrement partira sous peu. */
  | "MODIFIE"
  /** « Enregistrement... » */
  | "EN_COURS"
  /** « Conflit avec un autre poste » : rien ne part tant que la personne n'a pas choisi. */
  | "CONFLIT"
  /** « Non enregistré » : le serveur n'a pas répondu ; un nouvel essai suit. */
  | "ECHEC"
  /** Le serveur a refusé le contenu (une règle, un droit) : sa raison est dans le message. */
  | "REFUSE";

export type EtatDeChargement = "INACTIF" | "CHARGEMENT" | "PRET" | "ERREUR";

/** La copie de secours d'un brouillon, gardée dans ce navigateur. */
export interface CopieLocale {
  readonly revision_de_base: number;
  readonly modele: ModeleBundle;
  readonly mise_en_page: MiseEnPage;
  readonly ecrit_le: string;
}

/** Ce que l'éditeur propose à l'ouverture quand une copie locale diffère du serveur. */
export type PropositionDeReprise =
  /** Partie de la même révision : « Des modifications faites sur ce poste n'ont pas été enregistrées. » */
  | { readonly sorte: "MEME_REVISION"; readonly copie: CopieLocale }
  /** Le serveur a changé depuis : « Ce bundle a été modifié ailleurs depuis vos modifications... » */
  | { readonly sorte: "REVISION_DEPASSEE"; readonly copie: CopieLocale; readonly revisionDuServeur: number };

export interface EtatDuBrouillon {
  readonly bundleId: string | null;
  readonly chargement: EtatDeChargement;
  readonly erreurDeChargement: string | null;
  readonly catalogue: CatalogueStudio | null;
  /** Le dernier brouillon lu sur le serveur : son origine, son rapport de reprise. */
  readonly serveur: BrouillonServeur | null;
  /** La révision dont part le prochain enregistrement. */
  readonly revision: number;
  readonly historique: Historique | null;
  readonly enregistrement: EtatDEnregistrement;
  /** La raison d'un refus, d'un conflit ou d'un échec, telle que le serveur ou le réseau l'a dite. */
  readonly messageDEnregistrement: string | null;
  /** Le prochain essai automatique, en secondes, après un échec ; null s'il n'y en a plus. */
  readonly prochainEssaiDans: number | null;
  readonly propositionDeReprise: PropositionDeReprise | null;
  /** Les problèmes rendus par le serveur à la dernière vérification (« Vérifier »). */
  readonly verification: VerificationDuBrouillon | null;
  /** Vrai si le brouillon a changé depuis la dernière vérification : elle date. */
  readonly verificationPerimee: boolean;
  readonly verificationEnCours: boolean;
  /** Pourquoi la vérification n'a pas pu se faire, en mots. */
  readonly messageDeVerification: string | null;
}

/** Le délai entre le dernier geste et l'enregistrement : pas une écriture par pixel déplacé. */
export const DELAI_D_ENREGISTREMENT_MS = 1200;
/** Les nouveaux essais après un échec du réseau, puis plus rien : la personne choisit « Réessayer ». */
export const DELAIS_DES_NOUVEAUX_ESSAIS_S: readonly number[] = [5, 15, 30];

const ETAT_INITIAL: EtatDuBrouillon = {
  bundleId: null,
  chargement: "INACTIF",
  erreurDeChargement: null,
  catalogue: null,
  serveur: null,
  revision: 0,
  historique: null,
  enregistrement: "JAMAIS_ENREGISTRE",
  messageDEnregistrement: null,
  prochainEssaiDans: null,
  propositionDeReprise: null,
  verification: null,
  verificationPerimee: false,
  verificationEnCours: false,
  messageDeVerification: null,
};

let etat: EtatDuBrouillon = ETAT_INITIAL;
/** Utilisateur et organisation : la copie locale de l'un ne se mélange jamais à celle d'un autre. */
let perimetre: { utilisateur: string; organisation: string } | null = null;
/** Monte à chaque changement de bundle ou d'organisation : une réponse d'avant est ignorée. */
let generation = 0;
let contexte: ContexteDesOperations | null = null;
let minuterie: number | null = null;
/** Un envoi est en route : le suivant attend sa réponse, pour partir de la bonne révision. */
let enVol = false;
/** La réponse attendue de l'envoi en route : « Vérifier » l'attend, pour vérifier ce qu'on voit. */
let envoiEnVol: Promise<unknown> | null = null;
let echecsDeSuite = 0;
const abonnes = new Set<() => void>();

function publier(suivant: Partial<EtatDuBrouillon>): void {
  etat = { ...etat, ...suivant };
  for (const abonne of abonnes) abonne();
}

function arreterLaMinuterie(): void {
  if (minuterie !== null) window.clearTimeout(minuterie);
  minuterie = null;
}

function reinitialiser(): void {
  arreterLaMinuterie();
  generation += 1;
  contexte = null;
  enVol = false;
  envoiEnVol = null;
  echecsDeSuite = 0;
  etat = ETAT_INITIAL;
}

/* --------------------------------------------------------------------- *
 *  La copie locale
 * --------------------------------------------------------------------- */

function cleDeLaCopie(bundleId: string): string | null {
  if (!perimetre) return null;
  return `oscar.studio.brouillon-local.v1:${perimetre.utilisateur}:${perimetre.organisation}:${bundleId}`;
}

function lireLaCopie(bundleId: string): CopieLocale | null {
  const cle = cleDeLaCopie(bundleId);
  if (!cle) return null;
  try {
    const texte = localStorage.getItem(cle);
    if (!texte) return null;
    const copie = JSON.parse(texte) as Partial<CopieLocale>;
    // Une copie illisible ne se devine pas : on l'ignore, sans l'effacer.
    if (typeof copie.revision_de_base !== "number" || !copie.modele || !copie.mise_en_page) return null;
    return copie as CopieLocale;
  } catch {
    return null;
  }
}

function ecrireLaCopie(bundleId: string, present: EtatStudio, revisionDeBase: number): void {
  const cle = cleDeLaCopie(bundleId);
  if (!cle) return;
  const copie: CopieLocale = {
    revision_de_base: revisionDeBase,
    modele: present.modele,
    mise_en_page: present.miseEnPage,
    ecrit_le: new Date().toISOString(),
  };
  try {
    localStorage.setItem(cle, JSON.stringify(copie));
  } catch {
    // Stockage plein ou refusé : l'édition continue, et l'écran ne dit jamais
    // « Enregistré » tant que le serveur ne l'a pas confirmé.
  }
}

function effacerLaCopie(bundleId: string): void {
  const cle = cleDeLaCopie(bundleId);
  if (!cle) return;
  try {
    localStorage.removeItem(cle);
  } catch {
    // Rien à effacer si le stockage est indisponible.
  }
}

/** Les deux documents écrits avec leurs clés triées : égaux s'ils disent la même chose. */
function memeContenu(a: { modele: unknown; miseEnPage: unknown }, b: { modele: unknown; miseEnPage: unknown }): boolean {
  const canonique = (valeur: unknown) => JSON.stringify(valeur, (_cle, contenu: unknown) => {
    if (contenu === null || typeof contenu !== "object" || Array.isArray(contenu)) return contenu;
    const objet = contenu as Record<string, unknown>;
    return Object.fromEntries(Object.keys(objet).sort().map((cle) => [cle, objet[cle]]));
  });
  return canonique(a.modele) === canonique(b.modele) && canonique(a.miseEnPage) === canonique(b.miseEnPage);
}

/* --------------------------------------------------------------------- *
 *  Le périmètre, l'ouverture
 * --------------------------------------------------------------------- */

/** Change d'utilisateur ou d'organisation : le brouillon ouvert se ferme, une réponse d'avant est ignorée. */
export function configurerPerimetre(utilisateur: string | null, organisation: string | null): void {
  const suivant = utilisateur ? { utilisateur, organisation: organisation ?? "global" } : null;
  if (suivant?.utilisateur === perimetre?.utilisateur && suivant?.organisation === perimetre?.organisation) return;
  perimetre = suivant;
  reinitialiser();
  for (const abonne of abonnes) abonne();
}

/**
 * La mise en page à montrer à l'ouverture, depuis celle du serveur : l'écran
 * la fournit (un bundle repris de l'ancienne console, ou venu sans mise en
 * page, s'ouvre rangé). Elle n'est enregistrée qu'avec le premier geste.
 */
export type PreparationDeLaMiseEnPage = (brouillon: BrouillonServeur) => MiseEnPage;

/** Ouvre le brouillon d'un bundle : le serveur d'abord ; une copie locale qui diffère est seulement proposée. */
export async function ouvrir(bundleId: string, preparer?: PreparationDeLaMiseEnPage): Promise<void> {
  reinitialiser();
  const contexteDeLOuverture = generation;
  publier({ bundleId, chargement: "CHARGEMENT" });
  try {
    const [catalogue, serveur] = await Promise.all([lireCatalogue(), lireBrouillon(bundleId)]);
    if (contexteDeLOuverture !== generation) return;
    contexte = { catalogue: indexerCatalogue(catalogue), nouvelIdentifiant: identifiantAleatoire };
    const present: EtatStudio = {
      modele: serveur.modele,
      miseEnPage: preparer ? preparer(serveur) : serveur.mise_en_page,
    };
    let propositionDeReprise: PropositionDeReprise | null = null;
    const copie = lireLaCopie(bundleId);
    if (copie && memeContenu({ modele: copie.modele, miseEnPage: copie.mise_en_page }, present)) {
      // Le serveur a déjà ce contenu : la copie ne sert plus à rien.
      effacerLaCopie(bundleId);
    } else if (copie) {
      propositionDeReprise = copie.revision_de_base === serveur.revision
        ? { sorte: "MEME_REVISION", copie }
        : { sorte: "REVISION_DEPASSEE", copie, revisionDuServeur: serveur.revision };
    }
    publier({
      chargement: "PRET",
      catalogue,
      serveur,
      revision: serveur.revision,
      historique: creerHistorique(present),
      enregistrement: serveur.revision === 0 ? "JAMAIS_ENREGISTRE" : "ENREGISTRE",
      propositionDeReprise,
    });
  } catch (erreur) {
    if (contexteDeLOuverture !== generation) return;
    publier({ chargement: "ERREUR", erreurDeChargement: normalizeError(erreur).userMessage });
  }
}

/** Ferme le brouillon (on quitte l'éditeur) : plus rien ne part, la copie locale reste. */
export function fermer(): void {
  reinitialiser();
  for (const abonne of abonnes) abonne();
}

/* --------------------------------------------------------------------- *
 *  L'enregistrement
 * --------------------------------------------------------------------- */

function programmer(delaiMs: number): void {
  arreterLaMinuterie();
  const contexteDuProgramme = generation;
  minuterie = window.setTimeout(() => {
    minuterie = null;
    if (contexteDuProgramme === generation) void enregistrer();
  }, delaiMs);
}

/** Envoie le présent au serveur, avec la révision dont il part. Un seul envoi à la fois. */
async function enregistrer(): Promise<void> {
  const { bundleId, historique, enregistrement } = etat;
  if (!bundleId || !historique || enregistrement === "CONFLIT") return;
  // Un envoi est déjà en route : à sa réponse, ce qui a changé depuis partira.
  if (enVol) return;
  const contexteDeLEnvoi = generation;
  const envoye = historique.present;
  enVol = true;
  publier({ enregistrement: "EN_COURS", prochainEssaiDans: null });
  try {
    const requete = enregistrerBrouillon(bundleId, {
      modele: envoye.modele,
      miseEnPage: envoye.miseEnPage,
      revisionAttendue: etat.revision,
    });
    envoiEnVol = requete.catch(() => undefined);
    const reponse = await requete;
    envoiEnVol = null;
    if (contexteDeLEnvoi !== generation) return;
    enVol = false;
    echecsDeSuite = 0;
    const aJour = etat.historique?.present === envoye;
    if (aJour) effacerLaCopie(bundleId);
    else if (etat.historique) ecrireLaCopie(bundleId, etat.historique.present, reponse.revision);
    publier({
      revision: reponse.revision,
      enregistrement: aJour ? "ENREGISTRE" : "MODIFIE",
      messageDEnregistrement: null,
    });
    // Des gestes sont arrivés pendant l'envoi : ils partent à leur tour.
    if (!aJour) programmer(DELAI_D_ENREGISTREMENT_MS);
  } catch (erreur) {
    if (contexteDeLEnvoi !== generation) return;
    enVol = false;
    envoiEnVol = null;
    const probleme = normalizeError(erreur);
    if (probleme.status === 409) {
      // Quelqu'un a enregistré depuis : rien n'est écrasé, la personne choisit.
      publier({ enregistrement: "CONFLIT", messageDEnregistrement: probleme.userMessage, prochainEssaiDans: null });
      return;
    }
    if (!probleme.retryable) {
      // Une règle ou un droit : réessayer ne changerait rien.
      publier({ enregistrement: "REFUSE", messageDEnregistrement: probleme.userMessage, prochainEssaiDans: null });
      return;
    }
    echecsDeSuite += 1;
    const delai = DELAIS_DES_NOUVEAUX_ESSAIS_S[echecsDeSuite - 1] ?? null;
    publier({ enregistrement: "ECHEC", messageDEnregistrement: probleme.userMessage, prochainEssaiDans: delai });
    if (delai !== null) programmer(delai * 1000);
  }
}

/** « Réessayer » : un envoi tout de suite, et la suite des nouveaux essais repart du début. */
export function reessayer(): Promise<void> {
  arreterLaMinuterie();
  echecsDeSuite = 0;
  if (etat.enregistrement === "REFUSE" || etat.enregistrement === "ECHEC") publier({ enregistrement: "MODIFIE" });
  return enregistrer();
}

/** Après un changement : la copie de secours, puis l'enregistrement sous peu. */
function apresUnChangement(historique: Historique): void {
  const { bundleId } = etat;
  if (!bundleId) return;
  ecrireLaCopie(bundleId, historique.present, etat.revision);
  const enAttenteDUnEssai = etat.enregistrement === "ECHEC" && minuterie !== null;
  const suivant: EtatDEnregistrement = etat.enregistrement === "CONFLIT" || etat.enregistrement === "ECHEC"
    ? etat.enregistrement
    : "MODIFIE";
  publier({ historique, enregistrement: suivant, verificationPerimee: etat.verification !== null });
  // Pendant un conflit, rien ne part ; après un échec, l'essai prévu emportera ce geste.
  if (suivant === "CONFLIT" || enAttenteDUnEssai) return;
  programmer(DELAI_D_ENREGISTREMENT_MS);
}

/**
 * « Vérifier » : le serveur relit le brouillon enregistré et rend ses
 * problèmes, sans rien écrire (recette R1.6). Ce qu'on vérifie, c'est ce
 * qu'on voit : ce qui attend d'être enregistré part d'abord. Un brouillon
 * jamais enregistré (la reprise d'un ancien bundle, pas encore touchée) ne
 * s'écrit pas pour autant : l'écran le dit.
 */
export async function verifier(): Promise<void> {
  const { bundleId } = etat;
  if (!bundleId || !etat.historique) return;
  const contexteDeLaVerification = generation;
  publier({ verificationEnCours: true, messageDeVerification: null });
  if (envoiEnVol) await envoiEnVol;
  if (contexteDeLaVerification !== generation) return;
  if (etat.enregistrement === "MODIFIE" || etat.enregistrement === "ECHEC") {
    arreterLaMinuterie();
    await enregistrer();
  }
  if (contexteDeLaVerification !== generation) return;
  if (etat.revision === 0) {
    publier({
      verificationEnCours: false,
      messageDeVerification: "Ce brouillon n’est pas encore enregistré : le serveur le vérifiera dès votre premier changement.",
    });
    return;
  }
  if (etat.enregistrement !== "ENREGISTRE") {
    publier({
      verificationEnCours: false,
      messageDeVerification: "Le brouillon n’a pas pu être enregistré : la vérification porterait sur une version d’avant. "
        + "Réessayez l’enregistrement, puis vérifiez.",
    });
    return;
  }
  try {
    const verification = await verifierBrouillon(bundleId);
    if (contexteDeLaVerification !== generation) return;
    publier({ verification, verificationPerimee: false, verificationEnCours: false });
  } catch (erreur) {
    if (contexteDeLaVerification !== generation) return;
    publier({ verificationEnCours: false, messageDeVerification: normalizeError(erreur).userMessage });
  }
}

/* --------------------------------------------------------------------- *
 *  Les gestes
 * --------------------------------------------------------------------- */

/** Joue un geste terminé ; un refus ne change rien et revient avec sa raison. */
export function jouer(geste: Geste): ResultatDUnGeste | null {
  if (!etat.historique || !contexte) return null;
  const { historique, resultat } = jouerGeste(etat.historique, geste, contexte);
  if (historique !== etat.historique) apresUnChangement(historique);
  return resultat;
}

/** Montre un geste qui dure (un glissement, une saisie) sans l'enregistrer encore. */
export function previsualiser(geste: Geste): ResultatDUnGeste | null {
  if (!etat.historique || !contexte) return null;
  const resultat = appliquerGeste(etat.historique.present, geste, contexte);
  if (resultat.accepte && resultat.etat !== etat.historique.present) {
    publier({ historique: previsualiserDansLHistorique(etat.historique, resultat.etat) });
  }
  return resultat;
}

/** Termine le geste qui dure : il devient une seule entrée de l'historique, et s'enregistre. */
export function terminerLeGeste(): void {
  if (!etat.historique?.origineDuGesteEnCours) return;
  apresUnChangement(conclure(etat.historique));
}

/** Abandonne le geste qui dure (Échap dans un champ, ou avant de jouer le geste final) : rien n'est enregistré. */
export function abandonnerLeGeste(): void {
  if (!etat.historique?.origineDuGesteEnCours) return;
  publier({ historique: abandonner(etat.historique) });
}

export function annuler(): void {
  if (!etat.historique) return;
  const historique = annulerDansLHistorique(etat.historique);
  if (historique.present !== etat.historique.present) apresUnChangement(historique);
}

export function retablir(): void {
  if (!etat.historique) return;
  const historique = retablirDansLHistorique(etat.historique);
  if (historique.present !== etat.historique.present) apresUnChangement(historique);
}

/* --------------------------------------------------------------------- *
 *  La reprise d'une copie locale, et le conflit
 * --------------------------------------------------------------------- */

/** « Les reprendre » : la copie devient l'état courant (un geste, qu'on peut annuler) et s'enregistre. */
export function reprendreLaCopieLocale(): void {
  const proposition = etat.propositionDeReprise;
  if (!proposition || proposition.sorte !== "MEME_REVISION" || !etat.historique) return;
  const copie: EtatStudio = { modele: proposition.copie.modele, miseEnPage: proposition.copie.mise_en_page };
  publier({ propositionDeReprise: null });
  apresUnChangement(pousser(etat.historique, copie));
}

/** « Les abandonner », ou « Ouvrir la version du serveur » : la copie locale est effacée. */
export function abandonnerLaCopieLocale(): void {
  if (etat.bundleId) effacerLaCopie(etat.bundleId);
  publier({ propositionDeReprise: null });
}

/** La copie locale en texte, pour la garder dans un fichier avant de l'abandonner. */
export function copieLocaleEnTexte(): string | null {
  const proposition = etat.propositionDeReprise;
  return proposition ? JSON.stringify(proposition.copie, null, 2) : null;
}

/**
 * « Remplacer la version du serveur par la mienne » : un choix explicite, pas
 * un écrasement silencieux. La copie locale, ou l'état de l'écran pendant un
 * conflit, part avec la révision actuelle du serveur.
 */
export async function remplacerLaVersionDuServeur(): Promise<void> {
  const { bundleId, historique, propositionDeReprise } = etat;
  if (!bundleId || !historique) return;
  const contexteDuRemplacement = generation;
  let present = historique;
  if (propositionDeReprise) {
    const copie = propositionDeReprise.copie;
    present = pousser(historique, { modele: copie.modele, miseEnPage: copie.mise_en_page });
  }
  try {
    // La révision du serveur se relit : c'est d'elle que part le remplacement.
    const serveur = await lireBrouillon(bundleId);
    if (contexteDuRemplacement !== generation) return;
    publier({
      historique: present,
      revision: serveur.revision,
      serveur,
      propositionDeReprise: null,
      enregistrement: "MODIFIE",
      messageDEnregistrement: null,
    });
    await enregistrer();
  } catch (erreur) {
    if (contexteDuRemplacement !== generation) return;
    publier({ enregistrement: "ECHEC", messageDEnregistrement: normalizeError(erreur).userMessage });
  }
}

/** « Ouvrir la version du serveur » après un conflit : l'historique repart à vide, la copie locale part. */
export async function ouvrirLaVersionDuServeur(): Promise<void> {
  const { bundleId } = etat;
  if (!bundleId) return;
  effacerLaCopie(bundleId);
  await ouvrir(bundleId);
}

/* --------------------------------------------------------------------- *
 *  Pour React
 * --------------------------------------------------------------------- */

function abonner(abonne: () => void): () => void {
  abonnes.add(abonne);
  return () => abonnes.delete(abonne);
}

export function lireEtat(): EtatDuBrouillon {
  return etat;
}

export function useBrouillon(): EtatDuBrouillon {
  return useSyncExternalStore(abonner, lireEtat, lireEtat);
}

/** Tient le périmètre (utilisateur, organisation) à jour pendant que l'éditeur est ouvert. */
export function useBrouillonPerimetre(): string {
  const { user, activeOrganisationId } = useAuth();
  const utilisateur = user?.id ?? null;
  useLayoutEffect(() => {
    configurerPerimetre(utilisateur, activeOrganisationId);
    return () => configurerPerimetre(null, null);
  }, [utilisateur, activeOrganisationId]);
  return `${utilisateur ?? ""}:${activeOrganisationId ?? ""}`;
}
