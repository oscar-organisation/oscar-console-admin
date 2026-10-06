import { Download, History } from "lucide-react";
import type { PropositionDeReprise } from "../../feature-domain/brouillonStore";
import FenetreDuStudio from "./FenetreDuStudio";

/**
 * La reprise d'un brouillon local (conception du lot L1, partie 6.3) : des
 * modifications faites sur ce poste n'ont pas atteint le serveur. Elles sont
 * PROPOSÉES, jamais appliquées seules, et ne priment jamais sur le serveur :
 * - parties de la même révision : « Les reprendre » ou « Les abandonner » ;
 * - le serveur a changé depuis : « Ouvrir la version du serveur » (les
 *   miennes restent téléchargeables) ou « Remplacer la version du serveur par
 *   la mienne », un choix explicite, jamais une fusion devinée.
 */

/** La date d'une copie, en mots : « le 6 octobre à 01:30 ». */
function dateEnMots(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "récemment";
  return `le ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(date)} à `
    + new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

export interface ProprietesDeLaReprise {
  readonly proposition: PropositionDeReprise;
  readonly nomDuBundle: string;
  /** La copie en texte, pour la garder dans un fichier. */
  readonly copieEnTexte: string;
  readonly onReprendre: () => void;
  readonly onAbandonner: () => void;
  readonly onRemplacer: () => void;
}

export default function RepriseBrouillonLocal({ proposition, nomDuBundle, copieEnTexte, onReprendre, onAbandonner, onRemplacer }: ProprietesDeLaReprise) {
  const meme = proposition.sorte === "MEME_REVISION";
  // Le fichier téléchargé garde les modifications de ce poste, telles quelles.
  const lien = `data:application/json;charset=utf-8,${encodeURIComponent(copieEnTexte)}`;
  const fichier = `brouillon-local-${nomDuBundle.normalize("NFD").replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}.json`;
  return (
    <FenetreDuStudio
      surtitre="Modifications non enregistrées"
      titre={meme ? "Reprendre vos modifications ?" : "Ce bundle a changé ailleurs"}
      icone={<History size={20} aria-hidden="true" />}
      focusInitial='[data-action="principal"]'
      actions={meme ? (
        <>
          <button className="secondary-button" type="button" onClick={onAbandonner}>Les abandonner</button>
          <button className="primary-button" type="button" data-action="principal" onClick={onReprendre}>Les reprendre</button>
        </>
      ) : (
        <>
          <button className="secondary-button" type="button" onClick={onRemplacer}>Remplacer la version du serveur par la mienne</button>
          <button className="primary-button" type="button" data-action="principal" onClick={onAbandonner}>Ouvrir la version du serveur</button>
        </>
      )}
    >
      {meme ? (
        <p>
          Des modifications faites sur ce poste {dateEnMots(proposition.copie.ecrit_le)} n’ont pas été enregistrées.
          Reprises, elles s’enregistrent tout de suite ; vous pourrez encore les annuler.
        </p>
      ) : (
        <>
          <p>
            Ce bundle a été modifié ailleurs (révision {proposition.revisionDuServeur}) depuis vos modifications non
            enregistrées, faites {dateEnMots(proposition.copie.ecrit_le)}. Le Studio ne les fusionne pas à votre place.
          </p>
          <p className="ec-texte-discret">
            Ouvrir la version du serveur écarte vos modifications ; gardez-les d’abord dans un fichier si vous en avez besoin.
          </p>
        </>
      )}
      <a className="ec-lien ec-lien--fichier" href={lien} download={fichier}>
        <Download size={13} aria-hidden="true" /> Télécharger mes modifications
      </a>
    </FenetreDuStudio>
  );
}
