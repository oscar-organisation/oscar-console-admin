import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import type { ConsequencesDUneSuppression } from "../../feature-domain/modele/operations";
import { nomAffiche } from "../../feature-domain/modele/possibilites";
import { SORTES, type Liaison, type ModeleBundle, type Refus } from "../../feature-domain/modele/types";
import { compterParSorte } from "../textes";
import FenetreDuStudio from "./FenetreDuStudio";

/**
 * La confirmation d'une suppression (spécification 12.7 ; conception du lot
 * L1, partie 4.2) : avant de retirer quoi que ce soit, l'écran dit tout ce qui
 * partira avec l'élément (son contenu, ses liaisons, la salle si c'est la
 * dernière zone). La même fenêtre sert à la souris et à la touche Suppr. Une
 * suppression que les règles refusent dit pourquoi, et ne propose rien.
 */

export type CibleDeSuppression =
  | { readonly sorte: "element"; readonly id: string; readonly consequences: ConsequencesDUneSuppression; readonly refus: Refus | null }
  | { readonly sorte: "liaison"; readonly liaison: Liaison };

export interface ProprietesDeLaConfirmation {
  readonly modele: ModeleBundle;
  readonly cible: CibleDeSuppression;
  readonly onConfirmer: () => void;
  readonly onFermer: () => void;
}

export default function ConfirmationSuppression({ modele, cible, onConfirmer, onFermer }: ProprietesDeLaConfirmation) {
  const parId = new Map(modele.elements.map((element) => [element.id, element]));
  const nomDe = (id: string) => {
    const element = parId.get(id);
    return element ? nomAffiche(element) : id;
  };

  let titre: string;
  let corps: ReactNode;
  let refus: Refus | null = null;
  if (cible.sorte === "liaison") {
    titre = "Retirer cette liaison ?";
    corps = (
      <p>
        La liaison de « {nomDe(cible.liaison.source)} » vers « {nomDe(cible.liaison.destination)} » sera retirée.
        Les deux canaux restent en place.
      </p>
    );
  } else {
    const element = parId.get(cible.id);
    const nom = element ? nomAffiche(element) : cible.id;
    titre = `Supprimer « ${nom} » ?`;
    refus = cible.refus;
    const contenu = cible.consequences.elements.filter((retire) => retire.id !== cible.id && retire.sorte !== SORTES.SALLE);
    const salle = cible.consequences.elements.some((retire) => retire.sorte === SORTES.SALLE && retire.id !== cible.id);
    const liaisons = cible.consequences.liaisons.length;
    corps = (
      <ul className="ec-liste-simple">
        <li>
          {contenu.length > 0
            ? `Part avec lui : ${compterParSorte(contenu.map((retire) => retire.sorte)).join(", ")}.`
            : "Il ne contient aucun autre élément."}
        </li>
        <li>
          {liaisons === 0
            ? "Aucune liaison n’est retirée."
            : `${liaisons} liaison${liaisons > 1 ? "s" : ""} retirée${liaisons > 1 ? "s" : ""} : `
              + cible.consequences.liaisons.map((liaison) => `${nomDe(liaison.source)} vers ${nomDe(liaison.destination)}`).join(", ")
              + "."}
        </li>
        {salle && <li>C’est la dernière zone : la salle temps réel part avec elle.</li>}
        <li>Vous pourrez annuler cette suppression.</li>
      </ul>
    );
  }

  return (
    <FenetreDuStudio
      surtitre="Suppression"
      icone={<Trash2 size={20} aria-hidden="true" />}
      ton="danger"
      titre={titre}
      onFermer={onFermer}
      focusInitial={refus ? undefined : '[data-action="confirmer"]'}
      actions={(
        <>
          <button className="secondary-button" type="button" onClick={onFermer}>
            {refus ? "Fermer" : "Annuler"}
          </button>
          {!refus && (
            <button className="danger-button" type="button" data-action="confirmer" onClick={onConfirmer}>
              <Trash2 size={15} aria-hidden="true" /> {cible.sorte === "liaison" ? "Retirer" : "Supprimer"}
            </button>
          )}
        </>
      )}
    >
      {refus ? <p className="ec-avertissement" role="alert">{refus.message}</p> : corps}
    </FenetreDuStudio>
  );
}
