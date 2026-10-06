import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Blocks,
  CalendarClock,
  Check,
  ChevronRight,
  History,
  Layers3,
  LoaderCircle,
  Plus,
  RotateCw,
  Server,
  Trash2,
  X,
} from "lucide-react";
import "@xyflow/react/dist/style.css";
import { useAuth } from "@/auth/AuthContext.jsx";
import { normalizeError } from "@/shared/kernel/errors";
import { listerPresets, type BundleServeur, type PresetServeur } from "../../feature-data/studioApi";
import { archiver, creer, rafraichir, supprimer, useBundles, useBundlesPerimetre } from "../../feature-domain/bundlesStore";
import { DEPLOYMENT_STUDIO_PERMISSIONS } from "../../feature-permissions/deploymentStudio.permissions";
import PresetPicker from "../components/PresetPicker";
import "../../feature-styles/studio.css";
import "../../feature-styles/espace-composition.css";

/**
 * La liste des bundles du Studio (conception du lot L1, partie 6.1), dans le
 * dessin de l'ancienne liste.
 *
 * Le serveur fait foi, et lui seul : la liste vient de lui, un bundle se crée
 * chez lui. S'il ne répond pas, l'écran dit pourquoi et propose de
 * réessayer ; il ne montre jamais une liste gardée dans le navigateur, qui
 * pourrait mentir. Un bundle se crée vide, ou depuis un préset du catalogue ;
 * ses zones se posent ensuite dans le canevas.
 */

type Depart = { readonly sorte: "VIDE" } | { readonly sorte: "PRESET"; readonly slug: string };

function dateEnMots(date: string | null | undefined): string {
  if (!date) return "";
  const lue = new Date(date);
  if (Number.isNaN(lue.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(lue);
}

/** L'état du brouillon d'un bundle, en mots. */
function etatEnMots(bundle: BundleServeur): string {
  if (bundle.format_brouillon === "oscar.bundle/1") return "Brouillon";
  if (bundle.format_brouillon === "ancien") return "Ancien format";
  return "Vide";
}

export default function StudioBundlesPage() {
  const perimetre = useBundlesPerimetre();
  const { bundles, chargement, erreur } = useBundles();
  const { can } = useAuth();
  const peutGerer = can(DEPLOYMENT_STUDIO_PERMISSIONS.BUNDLE_WRITE, "update");
  const navigate = useNavigate();
  const [creation, setCreation] = useState(false);
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [depart, setDepart] = useState<Depart>({ sorte: "VIDE" });
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [erreurDeCreation, setErreurDeCreation] = useState<string | null>(null);
  const [presets, setPresets] = useState<PresetServeur[]>([]);
  const [catalogueOuvert, setCatalogueOuvert] = useState(false);
  const [aSupprimer, setASupprimer] = useState<BundleServeur | null>(null);
  const [suppression, setSuppression] = useState(false);
  const [erreurDeSuppression, setErreurDeSuppression] = useState<string | null>(null);
  const [archivesVisibles, setArchivesVisibles] = useState(false);
  const [archivage, setArchivage] = useState<string | null>(null);
  const [erreurDArchivage, setErreurDArchivage] = useState<string | null>(null);

  useEffect(() => { void rafraichir(); }, [perimetre]);

  // Le catalogue de présets est un confort : s'il ne répond pas, « Bundle vide » reste là.
  useEffect(() => {
    let vivant = true;
    listerPresets()
      .then((liste) => { if (vivant) setPresets(liste); })
      .catch(() => { if (vivant) setPresets([]); });
    return () => { vivant = false; };
  }, [perimetre]);

  const archives = bundles.filter((bundle) => bundle.statut === "archived");
  const affiches = archivesVisibles ? bundles : bundles.filter((bundle) => bundle.statut !== "archived");
  const presetChoisi = depart.sorte === "PRESET" ? presets.find((preset) => preset.slug === depart.slug) : undefined;

  const ouvrirLaCreation = () => {
    setNom("");
    setDescription("");
    setDepart({ sorte: "VIDE" });
    setErreurDeCreation(null);
    setCreation(true);
  };

  const creerLeBundle = async (evenement: FormEvent) => {
    evenement.preventDefault();
    if (!nom.trim()) {
      setErreurDeCreation("Donnez un nom au bundle : c’est ce que verront les opérateurs.");
      return;
    }
    setCreationEnCours(true);
    setErreurDeCreation(null);
    try {
      const bundle = await creer({ nom: nom.trim(), description: description.trim(), depart });
      setCreation(false);
      navigate(`/studio/${bundle.id}`);
    } catch (raison) {
      setErreurDeCreation(normalizeError(raison).userMessage);
    } finally {
      setCreationEnCours(false);
    }
  };

  const basculerLArchive = async (bundle: BundleServeur) => {
    setArchivage(bundle.id);
    setErreurDArchivage(null);
    try {
      await archiver(bundle, bundle.statut !== "archived");
    } catch (raison) {
      setErreurDArchivage(normalizeError(raison).userMessage);
    } finally {
      setArchivage(null);
    }
  };

  const confirmerLaSuppression = async () => {
    if (!aSupprimer) return;
    setSuppression(true);
    setErreurDeSuppression(null);
    try {
      await supprimer(aSupprimer);
      setASupprimer(null);
    } catch (raison) {
      setErreurDeSuppression(normalizeError(raison).userMessage);
    } finally {
      setSuppression(false);
    }
  };

  return (
    <div className="studio-scope espace-composition ec-liste">
      <div className="studio-projects">
        <section className="projects-section">
          <div className="section-heading">
            <div>
              <span>Studio de déploiement</span>
              <h2>Bundles de déploiement</h2>
            </div>
            {peutGerer && (
              <button className="primary-button" onClick={ouvrirLaCreation} type="button">
                <Plus size={16} aria-hidden="true" /> Nouveau bundle
              </button>
            )}
          </div>

          {chargement === "ERREUR" && (
            <div className="ec-liste__erreur" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <div>
                <strong>La liste des bundles n’a pas pu se charger.</strong>
                <p>{erreur}</p>
              </div>
              <button className="secondary-button" type="button" onClick={() => void rafraichir()}>
                <RotateCw size={14} aria-hidden="true" /> Réessayer
              </button>
            </div>
          )}

          {archives.length > 0 && (
            <button className="archives-bascule" type="button" onClick={() => setArchivesVisibles((visibles) => !visibles)}>
              {archivesVisibles ? <ArchiveRestore size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}
              {archivesVisibles ? "Masquer les bundles archivés" : `Afficher les bundles archivés (${archives.length})`}
            </button>
          )}
          {erreurDArchivage && <p className="dialog-erreur" role="alert">{erreurDArchivage}</p>}

          {chargement !== "ERREUR" && affiches.length === 0 && (
            <div className="ec-liste__vide" role={chargement === "CHARGEMENT" ? "status" : undefined}>
              {chargement === "CHARGEMENT" || chargement === "INACTIF" ? (
                <p><LoaderCircle className="spin" size={16} aria-hidden="true" /> Chargement des bundles...</p>
              ) : bundles.length === 0 ? (
                <>
                  <Layers3 size={26} aria-hidden="true" />
                  <strong>Aucun bundle pour l’instant</strong>
                  <p>Un bundle réunit ce qui tourne sur vos robots, vos serveurs et les écrans des opérateurs. Créez le premier pour le composer.</p>
                  {peutGerer && (
                    <button className="primary-button" type="button" onClick={ouvrirLaCreation}><Plus size={15} aria-hidden="true" /> Nouveau bundle</button>
                  )}
                </>
              ) : (
                <p>Tous les bundles sont archivés. Affichez-les pour en ressortir un.</p>
              )}
            </div>
          )}

          {affiches.length > 0 && (
            <div className="project-grid">
              {affiches.map((bundle) => {
                const versionPubliee = bundle.published_version?.numero;
                return (
                  <article className={`project-card${bundle.statut === "archived" ? " is-archived" : ""}`} key={bundle.id}>
                    <button className="project-card__open" onClick={() => navigate(`/studio/${bundle.id}`)} type="button" aria-label={`Ouvrir le bundle ${bundle.nom}`}>
                      <div className="project-card__preview">
                        <Layers3 size={26} aria-hidden="true" />
                        <span className="preview-node preview-node--a" />
                        <span className="preview-node preview-node--b" />
                        <span className="preview-node preview-node--c" />
                      </div>
                      <div className="project-card__body">
                        <div className="project-card__title">
                          <div>
                            <span>{bundle.statut === "archived" ? "Archivé" : etatEnMots(bundle)}</span>
                            <h3>{bundle.nom}</h3>
                          </div>
                          <ChevronRight size={18} aria-hidden="true" />
                        </div>
                        <p>{bundle.description || "Sans description."}</p>
                        {bundle.format_brouillon === "ancien" && (
                          <p className="ec-liste__ancien"><History size={13} aria-hidden="true" /> Ancien format : il s’ouvrira par la reprise, sans rien perdre.</p>
                        )}
                        <div className="project-card__meta">
                          <span><Blocks size={14} aria-hidden="true" /> {bundle.component_count} composant{bundle.component_count > 1 ? "s" : ""} · {bundle.unit_count} unité{bundle.unit_count > 1 ? "s" : ""}</span>
                          {bundle.updated_at && <span><CalendarClock size={14} aria-hidden="true" /> {dateEnMots(bundle.updated_at)}</span>}
                        </div>
                        <small>
                          {versionPubliee ? `Dernière version publiée : ${versionPubliee}` : "Jamais publié"}
                          {bundle.robot_count > 0 && <> · <Server size={12} aria-hidden="true" /> {bundle.robot_count} robot{bundle.robot_count > 1 ? "s" : ""}</>}
                        </small>
                      </div>
                    </button>
                    {peutGerer && (
                      <div className="project-card__actions">
                        <button
                          className="project-card__action"
                          aria-label={bundle.statut === "archived" ? `Sortir ${bundle.nom} des archives` : `Archiver le bundle ${bundle.nom}`}
                          title={bundle.statut === "archived" ? "Le remettre dans le plan de travail" : "Le ranger hors du plan de travail, sans rien effacer"}
                          disabled={archivage === bundle.id}
                          onClick={() => void basculerLArchive(bundle)}
                          type="button"
                        >
                          {archivage === bundle.id
                            ? <LoaderCircle className="spin" size={15} aria-hidden="true" />
                            : bundle.statut === "archived" ? <ArchiveRestore size={15} aria-hidden="true" /> : <Archive size={15} aria-hidden="true" />}
                        </button>
                        <button
                          className="project-card__action project-card__action--danger"
                          aria-label={`Supprimer le bundle ${bundle.nom}`}
                          title="Supprimer le bundle"
                          onClick={() => { setErreurDeSuppression(null); setASupprimer(bundle); }}
                          type="button"
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {creation && (
        <div className="modal-backdrop">
          <form className="project-dialog" onSubmit={(evenement) => void creerLeBundle(evenement)} aria-labelledby="ec-creer-titre">
            <header className="dialog-header">
              <div className="dialog-icon dialog-icon--blue"><Plus size={21} aria-hidden="true" /></div>
              <div><span>Nouveau</span><h2 id="ec-creer-titre">Créer un bundle</h2></div>
              <button className="icon-button" onClick={() => setCreation(false)} type="button" aria-label="Fermer"><X size={18} aria-hidden="true" /></button>
            </header>
            <div className="project-dialog__body">
              <label className="form-field">
                <span>Nom du bundle</span>
                <input autoFocus value={nom} placeholder="Par exemple : Téléopération du M3" onChange={(evenement) => setNom(evenement.target.value)} />
                <small>Le nom que verront les opérateurs ; son identifiant technique s’en déduit.</small>
              </label>
              <label className="form-field">
                <span>Description</span>
                <textarea rows={2} value={description} placeholder="Ce que fait ce bundle, en une phrase." onChange={(evenement) => setDescription(evenement.target.value)} />
              </label>
              <fieldset className="template-field">
                <legend>Point de départ</legend>
                <button className={depart.sorte === "VIDE" ? "is-selected" : ""} onClick={() => setDepart({ sorte: "VIDE" })} type="button" aria-pressed={depart.sorte === "VIDE"}>
                  <Layers3 size={18} aria-hidden="true" />
                  <span><strong>Bundle vide</strong><small>Vous posez vous-même les zones, les services et les applications.</small></span>
                  {depart.sorte === "VIDE" && <Check size={16} aria-hidden="true" />}
                </button>
                {presets.length > 0 && (
                  <button className={depart.sorte === "PRESET" ? "is-selected" : ""} onClick={() => setCatalogueOuvert(true)} type="button" aria-pressed={depart.sorte === "PRESET"}>
                    <Server size={18} aria-hidden="true" />
                    <span>
                      <strong>{presetChoisi ? `Préset : ${presetChoisi.nom}` : "Préset du catalogue"}</strong>
                      <small>{presetChoisi
                        ? `${presetChoisi.constructeur ? `${presetChoisi.constructeur} · ` : ""}${presetChoisi.famille}`
                        : `${presets.length} composition${presets.length > 1 ? "s" : ""} de référence, éprouvée${presets.length > 1 ? "s" : ""} sur un châssis réel`}</small>
                    </span>
                    {depart.sorte === "PRESET" ? <Check size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                  </button>
                )}
              </fieldset>
              {erreurDeCreation && <div className="dialog-erreur" role="alert">{erreurDeCreation}</div>}
            </div>
            <footer className="dialog-footer">
              <button className="secondary-button" onClick={() => setCreation(false)} type="button">Annuler</button>
              <button className="primary-button" type="submit" disabled={creationEnCours}>
                {creationEnCours ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />} Créer et ouvrir
              </button>
            </footer>
          </form>
        </div>
      )}

      {aSupprimer && (
        <div className="modal-backdrop">
          <section className="project-dialog project-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="ec-supprimer-titre">
            <header className="dialog-header">
              <div className="dialog-icon dialog-icon--danger"><Trash2 size={20} aria-hidden="true" /></div>
              <div><span>Suppression</span><h2 id="ec-supprimer-titre">Supprimer ce bundle ?</h2></div>
              <button className="icon-button" disabled={suppression} onClick={() => setASupprimer(null)} type="button" aria-label="Fermer"><X size={18} aria-hidden="true" /></button>
            </header>
            <div className="project-delete-dialog__body">
              <strong>{aSupprimer.nom}</strong>
              <p>Le bundle, son brouillon et ses versions non déployées seront supprimés. Cette action est définitive.</p>
              <small><AlertTriangle size={14} aria-hidden="true" /> S’il a déjà été déployé, son historique le protège : le serveur refusera, et l’archivage reste la bonne sortie.</small>
              {erreurDeSuppression && <div className="dialog-erreur" role="alert">{erreurDeSuppression}</div>}
            </div>
            <footer className="dialog-footer">
              <button className="secondary-button" disabled={suppression} onClick={() => setASupprimer(null)} type="button">Annuler</button>
              <button className="danger-button" disabled={suppression} onClick={() => void confirmerLaSuppression()} type="button">
                {suppression ? <><LoaderCircle className="spin" size={15} aria-hidden="true" /> Suppression...</> : <><Trash2 size={15} aria-hidden="true" /> Supprimer le bundle</>}
              </button>
            </footer>
          </section>
        </div>
      )}

      {catalogueOuvert && (
        <PresetPicker
          presets={presets}
          choisi={depart.sorte === "PRESET" ? depart.slug : undefined}
          onChoisir={(preset) => {
            setDepart({ sorte: "PRESET", slug: preset.slug });
            setCatalogueOuvert(false);
          }}
          onFermer={() => setCatalogueOuvert(false)}
        />
      )}
    </div>
  );
}
