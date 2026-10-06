import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Eye, LoaderCircle, MonitorSmartphone, RotateCw, Trash2, X } from "lucide-react";
import "@xyflow/react/dist/style.css";
import { useAuth } from "@/auth/AuthContext.jsx";
import { ouvrir, useBrouillon, useBrouillonPerimetre } from "../../feature-domain/brouillonStore";
import { indexerCatalogue } from "../../feature-domain/modele/regles";
import {
  archiverProjet,
  chargerComposition,
  enregistrerProjet,
  etatSync,
  supprimerProjet,
  useStudioEtat,
  useStudioProjects,
  useStudioPerimetre,
} from "../../feature-domain/projectStore";
import { DEPLOYMENT_STUDIO_PERMISSIONS } from "../../feature-permissions/deploymentStudio.permissions";
import PresetVersementDialog from "../components/PresetVersementDialog";
import StudioCanvas from "../components/StudioCanvas";
import EspaceComposition from "../components/EspaceComposition";
import { disposer } from "../components/canevas/disposition";
import { listerPresetsTous } from "../../feature-data/studioApi";
import "../../feature-styles/studio.css";
import "../../feature-styles/espace-composition.css";

/** Largeur en deçà de laquelle le plan de composition n'est plus manipulable. */
const LARGEUR_MINIMALE = 1100;

function useEcranSuffisant(): boolean {
  const [suffisant, setSuffisant] = useState(() =>
    typeof window === "undefined" || window.innerWidth >= LARGEUR_MINIMALE);
  useEffect(() => {
    const mesurer = () => setSuffisant(window.innerWidth >= LARGEUR_MINIMALE);
    mesurer();
    window.addEventListener("resize", mesurer);
    return () => window.removeEventListener("resize", mesurer);
  }, []);
  return suffisant;
}

/**
 * L'éditeur d'un bundle. Deux écrans y vivent le temps du passage au nouveau
 * Studio (on ajoute avant de retirer, décision 125) :
 * - `/studio/:projectId` : l'ancien éditeur, toujours en service ;
 * - `/studio/:bundleId/composition` : le nouveau canevas, qui affiche un
 *   bundle au nouveau format, en lecture à cette étape (I3 du lot L1).
 * Le nom du paramètre de la route dit lequel ouvrir. L'ancien partira à
 * l'étape I6, et le nouveau prendra alors l'adresse `/studio/:bundleId`.
 */
export default function StudioEditorPage() {
  const { bundleId } = useParams();
  return bundleId ? <NouveauStudio bundleId={bundleId} /> : <AncienEditeur />;
}

/** Le nouveau canevas : le brouillon du serveur, ou la reprise d'un ancien bundle, affiché en lecture. */
function NouveauStudio({ bundleId }: { readonly bundleId: string }) {
  const perimetre = useBrouillonPerimetre();
  const brouillon = useBrouillon();
  const ecranSuffisant = useEcranSuffisant();
  const { serveur, catalogue, historique } = brouillon;
  const present = historique?.present ?? null;

  useEffect(() => {
    if (ecranSuffisant) void ouvrir(bundleId);
  }, [bundleId, perimetre, ecranSuffisant]);

  const disposition = useMemo(
    () => (present && catalogue ? disposer(present.modele, present.miseEnPage, indexerCatalogue(catalogue)) : null),
    [present, catalogue],
  );

  if (!ecranSuffisant) {
    return (
      <div className="espace-composition espace-composition--message">
        <MonitorSmartphone size={28} aria-hidden="true" />
        <h2>Canevas du bundle</h2>
        <p>
          Le canevas demande un écran d’au moins {LARGEUR_MINIMALE} px.
          Ouvrez ce bundle depuis un poste de travail pour le voir.
        </p>
        <Link to="/studio">Revenir à la liste</Link>
      </div>
    );
  }

  if (brouillon.chargement === "ERREUR") {
    return (
      <div className="espace-composition espace-composition--message" role="alert">
        <AlertTriangle size={28} aria-hidden="true" />
        <h2>Ce bundle n’a pas pu s’ouvrir</h2>
        <p>{brouillon.erreurDeChargement}</p>
        <div className="ec-actions">
          <button className="ec-bouton" type="button" onClick={() => void ouvrir(bundleId)}>
            <RotateCw size={15} aria-hidden="true" /> Réessayer
          </button>
          <Link to="/studio">Revenir à la liste</Link>
        </div>
      </div>
    );
  }

  if (brouillon.chargement !== "PRET" || !present || !catalogue || !disposition || !serveur) {
    return (
      <div className="espace-composition espace-composition--message" role="status">
        <LoaderCircle className="ec-tourne" size={24} aria-hidden="true" />
        <p>Chargement du bundle...</p>
      </div>
    );
  }

  const reprise = serveur.origine.sorte === "ANCIEN_FORMAT" ? serveur.origine : null;
  const problemes = serveur.reprise?.problemes ?? [];
  const { compteurs } = disposition;
  const pluriel = (nombre: number, mot: string) => `${nombre} ${mot}${nombre > 1 ? "s" : ""}`;
  return (
    <div className="espace-composition">
      <header className="ec-barre">
        <Link to="/studio" className="ec-retour" aria-label="Revenir à la liste des bundles">
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <div className="ec-titre">
          <small>Bundle</small>
          <h1>{present.modele.bundle.nom}</h1>
          <code>{present.modele.bundle.code}</code>
        </div>
        <p className="ec-lecture"><Eye size={16} aria-hidden="true" /> Aperçu en lecture : rien ne se modifie ni ne s’enregistre ici.</p>
      </header>

      {reprise && (
        <section className="ec-reprise" aria-label="Reprise d’un bundle de l’ancienne console">
          <p>
            Ce bundle vient de l’ancienne console (version {reprise.numero}). Il s’ouvre ici par la reprise,
            sans rien changer à l’ancienne version.
          </p>
          {problemes.length > 0 && (
            <details open>
              <summary>La reprise signale {pluriel(problemes.length, "point")} à revoir</summary>
              <ul>
                {problemes.map((probleme) => (
                  <li key={`${probleme.code}-${probleme.element ?? ""}`}>
                    <strong>{probleme.niveau === "ERREUR" ? "À corriger" : "À vérifier"} : {probleme.titre}.</strong>{" "}
                    {probleme.explication} {probleme.correction}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <EspaceComposition disposition={disposition} familles={catalogue.familles} />

      <footer className="ec-pied">
        <span>{pluriel(compteurs.zones, "zone")}</span>
        <span>{pluriel(compteurs.composants, "composant")}</span>
        <span>{pluriel(compteurs.unites, "unité")}</span>
        <span>{pluriel(compteurs.liaisons, "liaison")}</span>
        {disposition.nonAffiches.length > 0 && (
          <span className="ec-pied__alerte">
            <AlertTriangle size={14} aria-hidden="true" /> {pluriel(disposition.nonAffiches.length, "élément")} hors de sa place,
            non dessiné
          </span>
        )}
      </footer>
    </div>
  );
}

/** L'ancien éditeur, inchangé : il reste en service jusqu'à l'étape I6. */
function AncienEditeur() {
  const perimetre = useStudioPerimetre();
  const { projectId } = useParams();
  const projects = useStudioProjects();
  const { sync } = useStudioEtat();
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const ecranSuffisant = useEcranSuffisant();
  const project = projects.find((item) => item.id === projectId);
  // Le versement au catalogue est un geste de plateforme : ce qu'on y depose
  // sert de point de depart a toutes les organisations.
  const peutVerser = Boolean(user?.is_superadmin);
  const [aSupprimer, setASupprimer] = useState(false);
  const [suppression, setSuppression] = useState(false);
  const [panne, setPanne] = useState<string | null>(null);
  const [versementOuvert, setVersementOuvert] = useState(false);
  const [familles, setFamilles] = useState<string[]>([]);

  // La liste ne transporte pas les compositions : on va chercher celle-ci à
  // l'ouverture, une seule fois.
  useEffect(() => {
    if (projectId) void chargerComposition(projectId);
  }, [projectId, perimetre]);

  // Les familles deja presentes au catalogue servent de suggestions au
  // versement. Leur absence ne bloque rien : le champ reste libre.
  useEffect(() => {
    if (!peutVerser) return;
    let vivant = true;
    listerPresetsTous()
      .then((liste) => { if (vivant) setFamilles([...new Set(liste.map((item) => item.famille))]); })
      .catch(() => { if (vivant) setFamilles([]); });
    return () => { vivant = false; };
  }, [peutVerser, perimetre]);

  if (!project) {
    return (
      <div className="studio-scope">
        <div className="studio-projects">
          <h2>Projet introuvable</h2>
          <p>Ce projet n’est ni sur le serveur ni dans ce navigateur.</p>
          <Link to="/studio">Revenir aux projets</Link>
        </div>
      </div>
    );
  }

  if (!ecranSuffisant) {
    // Un plan de composition se manipule à deux mains sur un écran large. Le
    // dire franchement vaut mieux qu'un canevas qu'on ne peut ni lire ni
    // brancher, et la liste des projets reste consultable en mobilité.
    return (
      <div className="studio-scope">
        <div className="studio-projects studio-trop-etroit">
          <MonitorSmartphone size={28} />
          <h2>{project.name}</h2>
          <p>
            Le plan de composition demande un écran d’au moins {LARGEUR_MINIMALE} px.
            Ouvrez ce projet depuis un poste de travail pour le modifier.
          </p>
          <Link to="/studio">Revenir aux projets</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="studio-scope studio-scope--editor">
      <StudioCanvas
        project={project}
        onChange={enregistrerProjet}
        onBack={() => navigate("/studio")}
        canPublish={can(DEPLOYMENT_STUDIO_PERMISSIONS.BUNDLE_PUBLISH, "execute")}
        canDeploy={can(DEPLOYMENT_STUDIO_PERMISSIONS.DEPLOYMENT_EXECUTE, "execute")}
        canManage={can(DEPLOYMENT_STUDIO_PERMISSIONS.BUNDLE_WRITE, "update")}
        canVerser={peutVerser}
        onArchiver={(archive) => archiverProjet(project, archive)}
        onSupprimer={() => { setPanne(null); setASupprimer(true); }}
        onVerser={() => setVersementOuvert(true)}
        syncEtat={sync[project.id] ?? etatSync(project)}
      />

      {versementOuvert && project.publishedVersionId && (
        <PresetVersementDialog
          versionId={project.publishedVersionId}
          nomSuggere={project.name}
          {...(project.description ? { descriptionSuggeree: project.description } : {})}
          famillesConnues={familles}
          onVerse={() => setVersementOuvert(false)}
          onFermer={() => setVersementOuvert(false)}
        />
      )}

      {aSupprimer && (
        <div className="modal-backdrop">
          <section className="project-dialog project-delete-dialog" role="dialog" aria-modal="true"
                   aria-labelledby="supprimer-projet-titre">
            <header className="dialog-header">
              <div className="dialog-icon dialog-icon--danger"><Trash2 size={20} /></div>
              <div>
                <span>Suppression</span>
                <h2 id="supprimer-projet-titre">Supprimer ce projet ?</h2>
              </div>
              <button className="icon-button" disabled={suppression} type="button"
                      onClick={() => setASupprimer(false)}><X size={18} /></button>
            </header>
            <div className="project-delete-dialog__body">
              <strong>{project.name}</strong>
              <p>Le projet et ses versions non déployées seront supprimés. Cette action est définitive.</p>
              <small>
                <AlertTriangle size={14} /> S’il a déjà été déployé, son historique le protège :
                le serveur refusera, et l’archivage reste la bonne sortie.
              </small>
              {panne && <div className="dialog-erreur">{panne}</div>}
            </div>
            <footer className="dialog-footer">
              <button className="secondary-button" disabled={suppression} type="button"
                      onClick={() => setASupprimer(false)}>Annuler</button>
              <button className="danger-button" disabled={suppression} type="button"
                      onClick={async () => {
                        setSuppression(true);
                        setPanne(null);
                        try {
                          await supprimerProjet(project);
                          navigate("/studio");
                        } catch (erreur) {
                          setPanne(erreur instanceof Error
                            ? erreur.message
                            : "Le projet n’a pas pu être supprimé.");
                        } finally {
                          setSuppression(false);
                        }
                      }}>
                {suppression
                  ? <><LoaderCircle className="spin" size={15} /> Suppression...</>
                  : <><Trash2 size={15} /> Supprimer le projet</>}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
