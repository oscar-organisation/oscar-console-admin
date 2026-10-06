import { useEffect, useId, useState } from "react";
import { ArrowRightLeft, ChevronRight, Info, Plus, Settings2, Trash2 } from "lucide-react";
import type { ChampsReglables, ContexteDesOperations } from "../../../feature-domain/modele/operations";
import {
  cheminDe,
  enfantsPermis,
  nomAffiche,
  parentsPossibles,
  SORTES_QUI_CHANGENT_DE_PARENT,
} from "../../../feature-domain/modele/possibilites";
import { NOMS_DES_SORTES } from "../../../feature-domain/modele/regles";
import {
  SORTES,
  type CatalogueStudio,
  type EnTeteDuBundle,
  type EtatStudio,
} from "../../../feature-domain/modele/types";
import type { Selection } from "../../selection";
import { Section } from "./champs";
import FormulaireBundle from "./FormulaireBundle";
import FormulaireCanal from "./FormulaireCanal";
import FormulaireComposant from "./FormulaireComposant";
import FormulaireStructure from "./FormulaireStructure";
import FormulaireUnite from "./FormulaireUnite";
import FormulaireZone from "./FormulaireZone";
import type { Reglage } from "./reglage";

/**
 * L'inspecteur (conception du lot L1, partie 6.1), dans le dessin de
 * l'ancien éditeur : « Propriétés » et la sorte en tête, le fil d'Ariane de
 * l'élément (spécification 12.6), son formulaire avec une aide sous chaque
 * champ, puis « Ajouter » (enfants permis seulement) et « Changer de parent »
 * (parents compatibles seulement, avec un aperçu) ; « Supprimer » en bas,
 * avec ses conséquences. Chaque réglage passe par les opérations du modèle
 * et se voit tout de suite sur le canevas ; un refus s'affiche sous le champ.
 */

export interface ProprietesDeLInspecteur {
  readonly etat: EtatStudio;
  readonly catalogue: CatalogueStudio;
  readonly contexte: ContexteDesOperations;
  readonly selection: Selection | null;
  /** Le réglage de l'élément choisi (un geste, un aperçu, un abandon). */
  readonly reglageDe: (id: string) => Reglage<ChampsReglables>;
  readonly reglageDuBundle: Reglage<Partial<EnTeteDuBundle>>;
  /** Ouvrir le menu « Ajouter » de ce parent (`null` : le bundle). */
  readonly onAjouter: (parent: string | null) => void;
  /** Ajouter un canal dans ce bus, depuis le formulaire d'une unité. */
  readonly onAjouterUnCanal: (bus: string, entree: boolean) => void;
  /** Ouvrir l'aperçu du changement de parent. */
  readonly onChangerDeParent: (id: string, parent: string) => void;
  /** Ouvrir la confirmation de suppression de la sélection, ou retirer une liaison. */
  readonly onSupprimer: (selection: Selection) => void;
}

/** La sorte de la sélection, en mots, avec une majuscule. */
function sorteEnMots(selection: Selection, etat: EtatStudio): string {
  if (selection.sorte === "bundle") return "Bundle de déploiement";
  if (selection.sorte === "liaison") return "Liaison de données";
  const element = etat.modele.elements.find((candidat) => candidat.id === selection.id);
  if (!element) return "";
  const nom = NOMS_DES_SORTES[element.sorte][1];
  return nom.charAt(0).toUpperCase() + nom.slice(1);
}

export default function Inspecteur(proprietes: ProprietesDeLInspecteur) {
  const { etat, catalogue, contexte, selection, reglageDe, reglageDuBundle, onAjouter, onAjouterUnCanal, onChangerDeParent, onSupprimer } = proprietes;
  const idDuChoix = useId();
  const { modele } = etat;
  const element = selection?.sorte === "element"
    ? modele.elements.find((candidat) => candidat.id === selection.id) ?? null
    : null;
  const liaison = selection?.sorte === "liaison"
    ? modele.liaisons.find((candidat) => candidat.id === selection.id) ?? null
    : null;
  const possibles = element ? parentsPossibles(etat, element.id, contexte) : [];
  const [parentChoisi, setParentChoisi] = useState("");
  useEffect(() => setParentChoisi(""), [element?.id]);

  if (!selection || (selection.sorte === "element" && !element) || (selection.sorte === "liaison" && !liaison)) {
    return (
      <aside className="inspector" aria-label="Propriétés">
        <div className="inspector-empty">
          <span className="inspector-empty__icon"><Settings2 size={24} aria-hidden="true" /></span>
          <h3>Sélectionnez un élément</h3>
          <p>Cliquez sur une zone, un bloc, une unité, un canal ou une liaison pour afficher ses réglages.</p>
          <div className="tip-card">
            <Info size={16} aria-hidden="true" />
            <span>Les noms sont libres. Les identifiants techniques restent stables pour ne pas casser les liaisons.</span>
          </div>
        </div>
      </aside>
    );
  }

  const parentDesAjouts = selection.sorte === "bundle" ? null : element?.id ?? null;
  const peutAjouter = selection.sorte !== "liaison"
    && enfantsPermis(etat, parentDesAjouts, catalogue, contexte).length > 0;
  const chemin = element ? cheminDe(modele, element.id) : liaison ? [modele.bundle.nom, "Liaisons"] : [modele.bundle.nom];
  const parId = new Map(modele.elements.map((candidat) => [candidat.id, candidat]));
  const nomDe = (id: string) => {
    const trouve = parId.get(id);
    return trouve ? nomAffiche(trouve) : "extrémité absente";
  };

  let formulaire = null;
  if (selection.sorte === "bundle") {
    formulaire = <FormulaireBundle bundle={modele.bundle} reglage={reglageDuBundle} />;
  } else if (liaison) {
    formulaire = (
      <>
        <div className="direction-banner direction-banner--emission">De la sortie, vers l’entrée</div>
        <div className="generated-structure ec-liaison-details">
          <div><ChevronRight size={13} aria-hidden="true" /><span>{nomDe(liaison.source)}</span><code>{cheminDe(modele, liaison.source).slice(1, -1).join(" › ")}</code></div>
          <div><ChevronRight size={13} aria-hidden="true" /><span>{nomDe(liaison.destination)}</span><code>{cheminDe(modele, liaison.destination).slice(1, -1).join(" › ")}</code></div>
        </div>
        <p className="ec-texte-discret">La flèche du canevas montre où va la donnée. Retirer la liaison laisse les deux canaux en place.</p>
      </>
    );
  } else if (element) {
    const reglage = reglageDe(element.id);
    switch (element.sorte) {
      case SORTES.ZONE:
        formulaire = <FormulaireZone element={element} catalogue={catalogue} reglage={reglage} />;
        break;
      case SORTES.SERVICE:
      case SORTES.APPLICATION:
        formulaire = <FormulaireComposant element={element} catalogue={catalogue} reglage={reglage} />;
        break;
      case SORTES.UNITE:
        formulaire = (
          <FormulaireUnite element={element} modele={modele} catalogue={catalogue} reglage={reglage} onAjouterUnCanal={onAjouterUnCanal} />
        );
        break;
      case SORTES.CANAL_RECEPTION:
      case SORTES.CANAL_EMISSION:
        formulaire = <FormulaireCanal element={element} reglage={reglage} />;
        break;
      default:
        formulaire = <FormulaireStructure element={element} reglage={reglage} />;
    }
  }

  return (
    <aside className="inspector" aria-label="Propriétés">
      <header className="inspector__header">
        <div>
          <span>Propriétés</span>
          <strong>{sorteEnMots(selection, etat)}</strong>
        </div>
      </header>

      <div className="inspector__content">
        <nav className="selection-path" aria-label="Chemin de l’élément">
          {chemin.map((nom, rang) => (
            <span key={`${rang}-${nom}`} className="ec-chemin__pas">
              {rang > 0 && <ChevronRight size={12} aria-hidden="true" />}
              {rang === chemin.length - 1 ? <strong>{nom}</strong> : <span>{nom}</span>}
            </span>
          ))}
        </nav>

        {/* La clé remet les champs à zéro quand on change d'élément. */}
        <div key={selection.sorte === "bundle" ? "bundle" : selection.id}>{formulaire}</div>

        {peutAjouter && (
          <>
            <Section icone={<Plus size={15} aria-hidden="true" />}>Ajouter dedans</Section>
            <button className="secondary-button ec-bouton-plein" type="button" onClick={() => onAjouter(parentDesAjouts)}>
              <Plus size={15} aria-hidden="true" /> Ajouter dans « {selection.sorte === "bundle" ? modele.bundle.nom : element ? nomAffiche(element) : ""} »
            </button>
          </>
        )}

        {element && SORTES_QUI_CHANGENT_DE_PARENT.includes(element.sorte) && (
          <>
            <Section icone={<ArrowRightLeft size={15} aria-hidden="true" />}>Changer de parent</Section>
            {possibles.length === 0 ? (
              <p className="ec-texte-discret">Aucun autre parent ne peut le recevoir dans ce bundle.</p>
            ) : (
              <div className="form-field">
                <label htmlFor={idDuChoix}>Nouveau parent</label>
                <select id={idDuChoix} value={parentChoisi} onChange={(evenement) => setParentChoisi(evenement.target.value)}>
                  <option value="">Choisir où le déplacer</option>
                  {possibles.map((possible) => (
                    <option key={possible.id} value={possible.id}>{cheminDe(modele, possible.id).slice(1).join(" › ")}</option>
                  ))}
                </select>
                <small>Seuls les parents qui l’acceptent sont proposés. Un aperçu dit ce qui change avant de déplacer.</small>
                <button
                  className="secondary-button ec-bouton-plein"
                  type="button"
                  disabled={!parentChoisi}
                  onClick={() => onChangerDeParent(element.id, parentChoisi)}
                >
                  <ArrowRightLeft size={15} aria-hidden="true" /> Voir l’aperçu
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {selection.sorte !== "bundle" && (
        <footer className="inspector__footer">
          <button className="danger-button" type="button" onClick={() => onSupprimer(selection)}>
            <Trash2 size={15} aria-hidden="true" /> {liaison ? "Retirer la liaison" : "Supprimer cet élément"}
          </button>
        </footer>
      )}
    </aside>
  );
}
