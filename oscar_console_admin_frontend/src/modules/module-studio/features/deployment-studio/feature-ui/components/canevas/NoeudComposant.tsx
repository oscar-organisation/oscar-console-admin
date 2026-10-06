import type { CSSProperties } from "react";
import type { NodeProps } from "@xyflow/react";
import { Cpu } from "lucide-react";
import { PICTOGRAMME_D_UNE_APPLICATION, presentationDeLaFamille } from "../../familles";
import LigneCanal from "./LigneCanal";
import type { NoeudDeComposant } from "./disposition";

/**
 * Un service ou une application, avec ses unités et leurs canaux. Les hauteurs
 * des parties sont celles de MESURES (disposition.ts) : la zone qui le
 * contient se calcule sur elles.
 */
export default function NoeudComposant({ data }: NodeProps<NoeudDeComposant>) {
  const famille = presentationDeLaFamille("FAMILLE_PALETTE_SERVICES_APPLICATIONS");
  const Pictogramme = data.application ? PICTOGRAMME_D_UNE_APPLICATION : famille.pictogramme;
  const sorte = data.application ? "Application" : "Service";
  return (
    <article className="ec-composant" style={{ "--ec-teinte": `var(--${famille.teinte})` } as CSSProperties}>
      <header className="ec-composant__entete" title={`${sorte} ${data.element.nom ?? ""} (${data.element.code})`}>
        <Pictogramme size={18} aria-hidden="true" />
        <div>
          <strong>{data.element.nom ?? data.element.code}</strong>
          <small>{sorte}</small>
        </div>
      </header>
      {data.unites.length === 0 ? (
        <p className="ec-composant__vide">Aucune unité</p>
      ) : (
        data.unites.map((unite) => (
          <section className="ec-unite" key={unite.element.id} aria-label={`Unité ${unite.element.nom ?? unite.element.code}`}>
            <header className="ec-unite__entete">
              <Cpu size={14} aria-hidden="true" />
              <span>{unite.element.nom ?? unite.element.code}</span>
              {unite.entrees.length === 0 && unite.sorties.length === 0 && <small>aucun canal</small>}
            </header>
            {(unite.entrees.length > 0 || unite.sorties.length > 0) && (
              <div className="ec-unite__canaux">
                <ul className="ec-unite__entrees" aria-label="Entrées">
                  {unite.entrees.map((canal) => <LigneCanal canal={canal} key={canal.element.id} />)}
                </ul>
                <ul className="ec-unite__sorties" aria-label="Sorties">
                  {unite.sorties.map((canal) => <LigneCanal canal={canal} key={canal.element.id} />)}
                </ul>
              </div>
            )}
          </section>
        ))
      )}
    </article>
  );
}
