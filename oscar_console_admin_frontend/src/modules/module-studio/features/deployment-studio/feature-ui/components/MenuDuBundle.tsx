import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Archive, ArchiveRestore, History, LibraryBig, LoaderCircle, MoreHorizontal, Trash2 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext.jsx";
import { normalizeError } from "@/shared/kernel/errors";
import {
  archiverBundle,
  lireBundle,
  listerPresetsTous,
  supprimerBundle,
  type BundleServeur,
} from "../../feature-data/studioApi";
import { DEPLOYMENT_STUDIO_PERMISSIONS } from "../../feature-permissions/deploymentStudio.permissions";
import FenetreDuStudio from "./FenetreDuStudio";
import PresetVersementDialog from "./PresetVersementDialog";

/**
 * Le menu du bundle, dans la barre du haut (conception du lot L1, partie
 * 6.1), comme celui de l'ancien éditeur : les gestes qu'on fait une fois par
 * bundle, rangés à part pour que la barre garde ce qui sert tout le temps.
 * - verser au catalogue une version publiée (super administrateur) ;
 * - archiver, ou sortir des archives ;
 * - supprimer le bundle, après confirmation ;
 * - ouvrir l'ancien éditeur, gardé le temps que le nouveau soit validé.
 */
export default function MenuDuBundle({ bundleId, nomDuBundle }: { readonly bundleId: string; readonly nomDuBundle: string }) {
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const peutGerer = can(DEPLOYMENT_STUDIO_PERMISSIONS.BUNDLE_WRITE, "update");
  // Le versement au catalogue est un geste de plateforme : ce qu'on y dépose sert à toutes les organisations.
  const peutVerser = Boolean(user?.is_superadmin);
  const [bundle, setBundle] = useState<BundleServeur | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [aSupprimer, setASupprimer] = useState(false);
  const [versement, setVersement] = useState<string[] | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Le menu a besoin de l'état du bundle (archivé, version publiée) : il le lit une fois.
  useEffect(() => {
    let vivant = true;
    lireBundle(bundleId).then((lu) => { if (vivant) setBundle(lu); }).catch(() => { if (vivant) setBundle(null); });
    return () => { vivant = false; };
  }, [bundleId]);

  const basculerLArchive = async () => {
    if (!bundle) return;
    setOuvert(false);
    setEnCours(true);
    try {
      setBundle(await archiverBundle(bundle.id, bundle.nom, bundle.statut !== "archived"));
    } catch (raison) {
      setErreur(normalizeError(raison).userMessage);
    } finally {
      setEnCours(false);
    }
  };

  const supprimer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      await supprimerBundle(bundleId);
      navigate("/studio");
    } catch (raison) {
      setErreur(normalizeError(raison).userMessage);
      setEnCours(false);
    }
  };

  const ouvrirLeVersement = async () => {
    setOuvert(false);
    // Les familles déjà au catalogue servent de suggestions ; leur absence ne bloque rien.
    const familles = await listerPresetsTous().then((liste) => [...new Set(liste.map((item) => item.famille))]).catch(() => []);
    setVersement(familles);
  };

  const archive = bundle?.statut === "archived";
  const versionPubliee = bundle?.published_version ?? null;
  return (
    <div
      className="projet-menu"
      onKeyDown={(evenement) => {
        // Échap referme le menu, et rend le focus à son bouton.
        if (evenement.key === "Escape" && ouvert) {
          evenement.preventDefault();
          setOuvert(false);
          evenement.currentTarget.querySelector<HTMLButtonElement>(".projet-menu__bouton")?.focus();
        }
      }}
    >
      <button
        className="secondary-button projet-menu__bouton"
        type="button"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label="Actions sur le bundle"
        title="Actions sur le bundle"
        disabled={enCours}
        onClick={() => setOuvert((valeur) => !valeur)}
      >
        {enCours ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <MoreHorizontal size={16} aria-hidden="true" />}
      </button>
      {ouvert && (
        <>
          {/* Un clic hors du menu le referme, sans capturer le clavier. */}
          <button className="projet-menu__voile" type="button" tabIndex={-1} aria-hidden="true" onClick={() => setOuvert(false)} />
          <div className="projet-menu__liste" role="menu" aria-label="Actions sur le bundle"
            ref={(liste) => liste?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus()}>
            {peutVerser && (
              <button role="menuitem" type="button" disabled={!versionPubliee}
                title={versionPubliee ? "Proposer cette version publiée comme point de départ à toutes les organisations" : "Ce bundle n’a pas de version publiée"}
                onClick={() => void ouvrirLeVersement()}>
                <LibraryBig size={14} aria-hidden="true" /> Verser au catalogue
              </button>
            )}
            {peutGerer && bundle && (
              <button role="menuitem" type="button" onClick={() => void basculerLArchive()}
                title={archive ? "Le remettre dans le plan de travail" : "Le ranger hors du plan de travail, sans rien effacer"}>
                {archive ? <ArchiveRestore size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}
                {archive ? "Sortir des archives" : "Archiver le bundle"}
              </button>
            )}
            <Link role="menuitem" className="ec-menu-lien" to={`/studio/${bundleId}/ancien`}
              title="L’ancien éditeur, gardé le temps de la validation du nouveau ; il ne peut plus enregistrer un bundle passé au nouveau Studio">
              <History size={14} aria-hidden="true" /> Ancien éditeur
            </Link>
            {peutGerer && (
              <button role="menuitem" className="is-danger" type="button" onClick={() => { setOuvert(false); setErreur(null); setASupprimer(true); }}>
                <Trash2 size={14} aria-hidden="true" /> Supprimer le bundle
              </button>
            )}
          </div>
        </>
      )}
      {erreur && !aSupprimer && <p className="ec-erreur-du-menu" role="alert">{erreur}</p>}
      {aSupprimer && (
        <FenetreDuStudio
          surtitre="Suppression"
          titre={`Supprimer « ${nomDuBundle} » ?`}
          icone={<Trash2 size={20} aria-hidden="true" />}
          ton="danger"
          onFermer={enCours ? undefined : () => setASupprimer(false)}
          actions={(
            <>
              <button className="secondary-button" type="button" disabled={enCours} onClick={() => setASupprimer(false)}>Annuler</button>
              <button className="danger-button" type="button" disabled={enCours} onClick={() => void supprimer()}>
                {enCours ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />} Supprimer le bundle
              </button>
            </>
          )}
        >
          <p>Le bundle, son brouillon et ses versions non déployées seront supprimés. Cette action est définitive.</p>
          <p className="ec-texte-discret">S’il a déjà été déployé, son historique le protège : le serveur refusera, et l’archivage reste la bonne sortie.</p>
          {erreur && <p className="ec-erreur-du-champ" role="alert">{erreur}</p>}
        </FenetreDuStudio>
      )}
      {versement && versionPubliee && (
        <PresetVersementDialog
          versionId={versionPubliee.id}
          nomSuggere={nomDuBundle}
          famillesConnues={versement}
          onVerse={() => setVersement(null)}
          onFermer={() => setVersement(null)}
        />
      )}
    </div>
  );
}
