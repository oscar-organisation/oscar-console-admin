import type { NodeProps } from "@xyflow/react";
import type { NoeudDuCadre } from "./disposition";

/** Le cadre du bundle : il contient les zones et la salle ; son nom se lit en haut à droite. */
export default function NoeudBundle({ data }: NodeProps<NoeudDuCadre>) {
  return (
    <section className="ec-cadre">
      <header className="ec-cadre__titre">
        <small>Bundle</small>
        <strong>{data.nom}</strong>
      </header>
    </section>
  );
}
