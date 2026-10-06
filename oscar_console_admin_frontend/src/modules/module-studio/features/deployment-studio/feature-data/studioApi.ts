import { api } from "@/shared/kernel/api";
import { projetAuFormatActuel } from "../feature-domain/formatComposition";
import type { CatalogueStudio, MiseEnPage, ModeleBundle } from "../feature-domain/modele/types";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  DeploiementServeur,
  OscarProject,
  ProjectTarget,
  RobotCible,
} from "../feature-domain/types";

/**
 * Accès au Studio côté serveur.
 *
 * Deux familles de routes vivent ici le temps du passage au nouveau Studio
 * (décision 125 : on ajoute avant de retirer) :
 * - celles de l'ancien éditeur, au format de React Flow (`/draft`, `/validate`,
 *   `/publish`...), qui partiront avec lui ;
 * - celles du nouveau Studio (lot L1), en bas de ce fichier : le catalogue
 *   des types, et le brouillon au format oscar.bundle/1, enregistré par
 *   révision entière.
 *
 * Les fonctions lèvent en cas d'échec ; l'appelant décide de ce qu'il montre.
 */

export interface VersionServeur {
  id: string;
  bundle_id: string;
  numero: number;
  statut: string;
  checksum?: string | null;
  notes?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
}

export interface BundleServeur {
  id: string;
  org_id: string;
  nom: string;
  slug: string;
  description?: string | null;
  target: string;
  statut: string;
  updated_at?: string | null;
  draft_version?: VersionServeur | null;
  published_version?: VersionServeur | null;
  version_count: number;
  robot_count: number;
  component_count: number;
  unit_count: number;
  /** Le projet robotique où le bundle est rangé (le projet d'office de son organisation). */
  projet_id?: string;
  /** « oscar.bundle/1 » s'il a un brouillon au nouveau format, « ancien » s'il n'a que
   *  des versions de l'ancien éditeur, null s'il n'a encore rien. */
  format_brouillon?: string | null;
}

interface VersionDetail extends VersionServeur {
  // Peut encore arriver à l'ancien format (`agents`) : projetAuFormatActuel le relit.
  spec: { nodes?: ArchitectureNode[]; edges?: ArchitectureEdge[] };
}

export interface ValidationServeur {
  valide: boolean;
  erreurs: string[];
  avertissements: string[];
}

/**
 * Préset du catalogue de la plateforme.
 *
 * Il ne vient pas de l'organisation qui le consulte : c'est une composition de
 * référence que nous maintenons, éprouvée sur un châssis réel. `famille`
 * désigne ce châssis avec le même identifiant que le profil embarqué et que
 * l'image du runtime, pour qu'aucune table de correspondance n'ait à être
 * tenue à jour entre les trois.
 */
export interface PresetServeur {
  id: string;
  slug: string;
  nom: string;
  famille: string;
  constructeur?: string | null;
  description?: string | null;
  // Peut encore arriver à l'ancien format (`agents`) : projetAuFormatActuel le relit.
  spec: { nodes?: ArchitectureNode[]; edges?: ArchitectureEdge[] };
  statut: string;
  ordre: number;
  revision: number;
}

/**
 * Catalogue publié, dans l'ordre où il doit s'afficher.
 *
 * L'appel peut échouer - le Studio s'utilise hors ligne. L'appelant retombe
 * alors sur les formes génériques plutôt que de bloquer la création.
 */
export function listerPresets(): Promise<PresetServeur[]> {
  return api.get<PresetServeur[]>("/studio/presets");
}

/** Métadonnées à poser sur un préset au moment de le verser au catalogue. */
export interface PresetEntree {
  slug: string;
  nom: string;
  famille: string;
  constructeur?: string;
  description?: string;
  ordre?: number;
  notes?: string;
}

/**
 * Catalogue complet, brouillons compris.
 *
 * Réservé à qui maintient la bibliothèque : le serveur n'honore `tous` que
 * pour un super administrateur, et se contente sinon des présets publiés.
 */
export function listerPresetsTous(): Promise<PresetServeur[]> {
  return api.get<PresetServeur[]>("/studio/presets?tous=true");
}

/**
 * Verse une version publiée au catalogue.
 *
 * C'est le chemin par lequel la bibliothèque s'enrichit : on compose, on
 * éprouve sur un robot réel, puis on propose à tous ce qui a fait ses preuves.
 */
export function verserAuCatalogue(versionId: string, entree: PresetEntree): Promise<PresetServeur> {
  return api.post<PresetServeur>(`/studio/presets/from-version/${versionId}`, entree);
}

export function modifierPreset(reference: string, champs: Partial<PresetEntree> & { statut?: string }): Promise<PresetServeur> {
  return api.patch<PresetServeur>(`/studio/presets/${reference}`, champs);
}

export function supprimerPreset(reference: string): Promise<void> {
  return api.del<void>(`/studio/presets/${reference}`);
}

export function listerBundles(): Promise<BundleServeur[]> {
  return api.get<BundleServeur[]>("/studio/bundles");
}

/**
 * Crée un bundle. Sans `depart`, il naît à l'ancien format, pour l'ancien
 * éditeur ; avec `depart`, il naît avec son brouillon au nouveau format, vide
 * ou repris d'un préset du catalogue (le serveur fait la conversion).
 */
export function creerBundle(entree: {
  nom: string;
  description: string;
  target?: ProjectTarget;
  depart?: DepartDUnBundle;
}): Promise<BundleServeur> {
  return api.post<BundleServeur>("/studio/bundles", entree);
}

/**
 * Range ou ressort un projet du plan de travail.
 *
 * Un projet deja deploye ne peut pas etre supprime : son historique dit ce qui
 * a tourne sur les robots. L'archivage est sa seule sortie, et c'est ce que le
 * refus de suppression conseillait deja sans qu'aucun chemin ne le permette.
 */
export function archiverBundle(bundleId: string, nom: string,
                               archive: boolean): Promise<BundleServeur> {
  return api.patch<BundleServeur>(`/studio/bundles/${bundleId}`,
                                  { nom, statut: archive ? "archived" : "active" });
}

export function supprimerBundle(bundleId: string): Promise<void> {
  return api.del<void>(`/studio/bundles/${bundleId}`);
}

export function lireBundle(bundleId: string): Promise<BundleServeur> {
  return api.get<BundleServeur>(`/studio/bundles/${bundleId}`);
}

export function lireVersion(versionId: string): Promise<VersionDetail> {
  return api.get<VersionDetail>(`/studio/versions/${versionId}`);
}

/** L'enregistrement de l'ancien éditeur, au format de React Flow ; il part avec lui. */
export function enregistrerBrouillonAncienFormat(bundleId: string, projet: OscarProject): Promise<VersionServeur> {
  return api.put<VersionServeur>(`/studio/bundles/${bundleId}/draft`, {
    spec: { nodes: projet.nodes, edges: projet.edges },
    notes: projet.description || null,
  });
}

export function verifier(bundleId: string): Promise<ValidationServeur> {
  return api.post<ValidationServeur>(`/studio/bundles/${bundleId}/validate`);
}

export function publier(bundleId: string, notes?: string): Promise<VersionServeur> {
  return api.post<VersionServeur>(`/studio/bundles/${bundleId}/publish`, { notes: notes || null });
}

export interface BoxIA {
  id: string;
  nom: string;
  version: string;
  statut: string;
}

/** Box IA publiees : seules celles-la sont deployables avec un bundle. */
export async function listerBoxIA(): Promise<BoxIA[]> {
  const boxes = await api.get<BoxIA[]>("/ai/model-boxes");
  return boxes.filter((box) => box.statut === "published");
}

export function listerRobots(): Promise<RobotCible[]> {
  return api.get<RobotCible[]>("/robots");
}

export interface Flotte {
  id: string;
  nom: string;
  code: string;
  robot_ids?: string[];
}

export interface SiteCible {
  id: string;
  nom: string;
  code: string;
}

export function listerFlottes(): Promise<Flotte[]> {
  return api.get<Flotte[]>("/fleets");
}

export function listerSites(): Promise<SiteCible[]> {
  return api.get<SiteCible[]>("/sites");
}

/**
 * Portée d'un déploiement : des robots nommés, une flotte, ou plusieurs sites.
 *
 * Les trois se cumulent côté serveur et leur union est dédupliquée. On envoie
 * donc la portée telle que l'opérateur l'a exprimée, sans la résoudre nous-même
 * en liste de robots : résoudre ici figerait la flotte à l'instant du clic,
 * alors que le serveur la lit au moment où il crée les déploiements.
 */
export interface PorteeDeploiement {
  robotIds?: string[];
  flotteId?: string;
  siteIds?: string[];
}

export function deployer(versionId: string, portee: PorteeDeploiement,
                         message?: string): Promise<DeploiementServeur[]> {
  return api.post<DeploiementServeur[]>("/studio/deployments", {
    version_id: versionId,
    robot_ids: portee.robotIds ?? [],
    fleet_id: portee.flotteId ?? null,
    site_ids: portee.siteIds ?? [],
    message: message || null,
  });
}

export interface FiltresDeploiements {
  bundleId?: string;
  robotId?: string;
  statut?: string;
}

export function listerDeploiements(filtres: FiltresDeploiements = {}): Promise<DeploiementServeur[]> {
  const parametres = new URLSearchParams();
  if (filtres.bundleId) parametres.set("bundle_id", filtres.bundleId);
  if (filtres.robotId) parametres.set("robot_id", filtres.robotId);
  if (filtres.statut) parametres.set("statut", filtres.statut);
  const recherche = parametres.toString();
  return api.get<DeploiementServeur[]>(`/studio/deployments${recherche ? `?${recherche}` : ""}`);
}

/** Construit le projet d'édition à partir d'un bundle et de sa composition. */
/**
 * Projet neuf assis sur un préset du catalogue.
 *
 * La composition est copiée, pas référencée : à partir de là le projet
 * appartient à son organisation et vit sa vie. Corriger le préset plus tard ne
 * remonte donc pas dans les projets déjà créés - c'est voulu, un point de
 * départ n'est pas une dépendance.
 */
export function projetDepuisPreset(
  preset: PresetServeur,
  nom: string,
  description: string,
  target: ProjectTarget,
): OscarProject {
  return projetAuFormatActuel({
    id: `projet-${Date.now().toString(36)}`,
    name: nom,
    description: description || preset.description || "",
    target,
    status: "BROUILLON",
    version: 1,
    updatedAt: new Date().toISOString(),
    nodes: preset.spec?.nodes ?? [],
    edges: preset.spec?.edges ?? [],
  });
}

export function projetDepuisBundle(bundle: BundleServeur, detail: VersionDetail | null): OscarProject {
  const version = bundle.draft_version ?? bundle.published_version ?? null;
  return projetAuFormatActuel({
    id: bundle.id,
    bundleId: bundle.id,
    // `exactOptionalPropertyTypes` : une propriete optionnelle est absente ou
    // porte une valeur, jamais `undefined` explicite.
    ...(bundle.draft_version ? { draftVersionId: bundle.draft_version.id } : {}),
    ...(version ? { sourceVersionId: version.id } : {}),
    ...(bundle.published_version ? { publishedVersionId: bundle.published_version.id } : {}),
    name: bundle.nom,
    description: bundle.description ?? "",
    target: bundle.target as ProjectTarget,
    status: bundle.published_version ? "PRET_A_DEPLOYER" : "BROUILLON",
    archive: bundle.statut === "archived",
    version: version?.numero ?? 1,
    updatedAt: bundle.updated_at ?? new Date().toISOString(),
    nodes: detail?.spec?.nodes ?? [],
    edges: detail?.spec?.edges ?? [],
    syncedAt: new Date().toISOString(),
  });
}

/* ------------------------------------------------------------------------- *
 *  Le nouveau Studio (lot L1) : le catalogue et le brouillon au nouveau format
 * ------------------------------------------------------------------------- */

/** Le point de départ d'un bundle composé dans le nouveau Studio. */
export type DepartDUnBundle = { sorte: "VIDE" } | { sorte: "PRESET"; slug: string };

/** D'où vient le brouillon ; « ANCIEN_FORMAT » pour un bundle de l'ancienne console, repris. */
export type OrigineDuBrouillon =
  | { sorte: "VIDE" }
  | { sorte: "PRESET"; slug: string }
  | { sorte: "ANCIEN_FORMAT"; version_id: string; numero: number };

/** Un problème signalé par la vérification ou par la reprise (spécification 18.2). */
export interface ProblemeDuStudio {
  niveau: "ERREUR" | "AVERTISSEMENT";
  code: string;
  titre: string;
  explication: string;
  correction: string;
  element: string | null;
}

/** Le rapport de la reprise d'un ancien bundle : rien n'est perdu, tout ce qui
 *  n'a pas encore sa place dans le modèle est nommé ici, avec sa raison. */
export interface RapportDeReprise {
  problemes: ProblemeDuStudio[];
  non_repris: { champ: string; valeur?: unknown; raison: string }[];
  non_classes: unknown[];
}

/** La réponse de `GET /studio/bundles/{id}/brouillon`. */
export interface BrouillonServeur {
  bundle_id: string;
  format: string;
  modele: ModeleBundle;
  mise_en_page: MiseEnPage;
  /** 0 tant que rien n'est enregistré (un bundle neuf, ou la reprise d'un ancien). */
  revision: number;
  etat: string;
  origine: OrigineDuBrouillon;
  reprise: RapportDeReprise | null;
  modifie_le: string | null;
  modifie_par: string | null;
}

/** La réponse d'un enregistrement accepté. */
export interface BrouillonEnregistre {
  revision: number;
  etat: string;
  empreinte_modele: string;
  modifie_le: string | null;
}

export interface VerificationDuBrouillon {
  revision: number;
  problemes: ProblemeDuStudio[];
  erreurs: number;
  avertissements: number;
}

/** Les familles de la palette et les types publiés, dans leur ordre. */
export function lireCatalogue(): Promise<CatalogueStudio> {
  return api.get<CatalogueStudio>("/studio/catalogue");
}

/** Le brouillon d'un bundle ; pour un bundle de l'ancienne console, sa reprise, non enregistrée. */
export function lireBrouillon(bundleId: string): Promise<BrouillonServeur> {
  return api.get<BrouillonServeur>(`/studio/bundles/${bundleId}/brouillon`);
}

/**
 * Enregistre le brouillon entier, en disant de quelle révision il part. Si
 * quelqu'un a enregistré entre-temps, le serveur refuse (409) sans rien
 * écraser ; un modèle qui enfreint une règle est refusé (422) avec sa raison.
 */
export function enregistrerBrouillon(bundleId: string, envoi: {
  modele: ModeleBundle;
  miseEnPage: MiseEnPage;
  revisionAttendue: number;
}): Promise<BrouillonEnregistre> {
  return api.put<BrouillonEnregistre>(`/studio/bundles/${bundleId}/brouillon`, {
    modele: envoi.modele,
    mise_en_page: envoi.miseEnPage,
    revision_attendue: envoi.revisionAttendue,
  });
}

/** Les problèmes du brouillon enregistré. N'écrit rien. */
export function verifierBrouillon(bundleId: string): Promise<VerificationDuBrouillon> {
  return api.post<VerificationDuBrouillon>(`/studio/bundles/${bundleId}/brouillon/verification`);
}
