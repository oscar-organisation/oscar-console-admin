import { ArrowRight, ArrowRightLeft } from "lucide-react";
import type { ApercuDEmboitement } from "../../feature-domain/modele/operations";
import { descendants, nomAffiche } from "../../feature-domain/modele/possibilites";
import type { ModeleBundle } from "../../feature-domain/modele/types";
import { compterParSorte } from "../textes";
import FenetreDuStudio from "./FenetreDuStudio";

/**
 * L'aperçu d'un changement de parent (spécification 11.7 ; conception du lot
 * L1, partie 4.2) : ce qui change, ce qui part avec l'élément, les liaisons
 * concernées. Rien ne bouge avant la confirmation ; le changement compte
 * alors pour un seul geste, qu'on peut annuler.
 */

export interface ProprietesDeLApercu {
  readonly modele: ModeleBundle;
  readonly apercu: ApercuDEmboitement;
  readonly onConfirmer: () => void;
  readonly onFermer: () => void;
}

export default function ApercuChangementParent({ modele, apercu, onConfirmer, onFermer }: ProprietesDeLApercu) {
  const parId = new Map(modele.elements.map((element) => [element.id, element]));
  const nomDe = (id: string | null) => {
    if (id === null) return modele.bundle.nom;
    const element = parId.get(id);
    return element ? nomAffiche(element) : id;
  };
  const element = apercu.element;
  // Ce qu'il contient part avec lui : on le compte dans le modèle d'avant.
  const contenu = descendants(modele.elements, element.id);
  const sortesDuContenu = modele.elements
    .filter((candidat) => candidat.id !== element.id && contenu.has(candidat.id))
    .map((candidat) => candidat.sorte);
  const refus = apercu.resultat.accepte ? null : apercu.resultat.refus;
  const liaisons = apercu.liaisonsConcernees.length;

  return (
    <FenetreDuStudio
      surtitre="Changer de parent"
      icone={<ArrowRightLeft size={20} aria-hidden="true" />}
      titre={`Déplacer « ${nomAffiche(element)} » ?`}
      onFermer={onFermer}
      focusInitial={refus ? undefined : '[data-action="confirmer"]'}
      actions={(
        <>
          <button className="secondary-button" type="button" onClick={onFermer}>
            {refus ? "Fermer" : "Annuler"}
          </button>
          {!refus && (
            <button className="primary-button" type="button" data-action="confirmer" onClick={onConfirmer}>
              Déplacer
            </button>
          )}
        </>
      )}
    >
      <p className="ec-trajet">
        <span>{nomDe(apercu.ancienParent)}</span>
        <ArrowRight size={16} aria-label="vers" />
        <strong>{nomDe(apercu.nouveauParent)}</strong>
      </p>
      {refus ? (
        <p className="ec-avertissement" role="alert">{refus.message}</p>
      ) : (
        <ul className="ec-liste-simple">
          <li>
            {sortesDuContenu.length > 0
              ? `Part avec lui : ${compterParSorte(sortesDuContenu).join(", ")}.`
              : "Il part seul : il ne contient aucun autre élément."}
          </li>
          <li>
            {liaisons === 0
              ? "Aucune liaison n’est concernée."
              : `${liaisons} liaison${liaisons > 1 ? "s" : ""} concernée${liaisons > 1 ? "s" : ""} : elle${liaisons > 1 ? "s" : ""} reste${liaisons > 1 ? "nt" : ""} en place, avec les mêmes canaux.`}
          </li>
          <li>Il prend une place libre dans son nouveau parent. Vous pourrez annuler ce déplacement.</li>
        </ul>
      )}
    </FenetreDuStudio>
  );
}
