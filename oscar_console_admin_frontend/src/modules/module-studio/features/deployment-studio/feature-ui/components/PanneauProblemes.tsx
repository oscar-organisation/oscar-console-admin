import { AlertCircle, AlertTriangle, Crosshair, X } from "lucide-react";
import type { ProblemeDuStudio } from "../../feature-data/studioApi";

/**
 * Le panneau des problèmes (conception du lot L1, partie 6.1 ; spécification
 * 18.2), dans le dessin du panneau de vérification de l'ancien éditeur :
 * chaque problème avec son niveau, son titre, son explication, ce qu'il faut
 * faire, et « Localiser », qui choisit l'élément en cause et y centre le
 * canevas, pour tout élément (une unité, un canal), pas seulement un bloc.
 */

export interface GroupeDeProblemes {
  /** D'où viennent ces problèmes : « Reprise de l'ancienne console », « Vérification ». */
  readonly titre: string;
  readonly problemes: readonly ProblemeDuStudio[];
}

export interface ProprietesDuPanneau {
  readonly groupes: readonly GroupeDeProblemes[];
  /** Le nom de l'élément en cause, pour le dire dans la liste. */
  readonly nomDe: (id: string) => string | null;
  readonly onLocaliser: (id: string) => void;
  readonly onFermer: () => void;
}

export default function PanneauProblemes({ groupes, nomDe, onLocaliser, onFermer }: ProprietesDuPanneau) {
  const total = groupes.reduce((somme, groupe) => somme + groupe.problemes.length, 0);
  return (
    <aside className="validation-panel ec-panneau-problemes" aria-label="Problèmes du bundle">
      <header>
        <div>
          <span className="validation-panel__eyebrow">Vérification</span>
          <strong>{total === 0 ? "Aucun problème" : `${total} point${total > 1 ? "s" : ""} à revoir`}</strong>
        </div>
        <button className="icon-button" type="button" aria-label="Fermer le panneau des problèmes" onClick={onFermer}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div className="validation-list">
        {total === 0 && <p className="ec-texte-discret">Le bundle ne signale rien à corriger pour l’instant.</p>}
        {groupes.filter((groupe) => groupe.problemes.length > 0).map((groupe) => (
          <section key={groupe.titre} aria-label={groupe.titre}>
            <p className="ec-panneau-problemes__groupe">{groupe.titre}</p>
            {groupe.problemes.map((probleme, rang) => {
              const erreur = probleme.niveau === "ERREUR";
              const Icone = erreur ? AlertCircle : AlertTriangle;
              const element = probleme.element;
              const nom = element ? nomDe(element) : null;
              return (
                <article
                  key={`${probleme.code}-${probleme.element ?? ""}-${rang}`}
                  className={`validation-item ${erreur ? "validation-item--erreur" : "validation-item--attention"}`}
                >
                  <Icone size={16} aria-hidden="true" />
                  <div>
                    <strong>{erreur ? "À corriger" : "À vérifier"} : {probleme.titre}</strong>
                    {nom && <p className="ec-panneau-problemes__element">{nom}</p>}
                    <p>{probleme.explication} {probleme.correction}</p>
                  </div>
                  {element && nom && (
                    <button type="button" title={`Localiser « ${nom} »`} aria-label={`Localiser « ${nom} »`} onClick={() => onLocaliser(element)}>
                      <Crosshair size={14} aria-hidden="true" />
                    </button>
                  )}
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </aside>
  );
}
