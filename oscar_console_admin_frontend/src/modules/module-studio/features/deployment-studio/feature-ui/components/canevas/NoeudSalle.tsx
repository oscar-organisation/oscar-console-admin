import type { CSSProperties } from "react";
import type { NodeProps } from "@xyflow/react";
import { presentationDeLaFamille } from "../../familles";
import type { NoeudDeSalle } from "./disposition";

/** La salle temps réel : un bloc compact en haut du cadre du bundle, une seule par bundle. */
export default function NoeudSalle({ data }: NodeProps<NoeudDeSalle>) {
  const famille = presentationDeLaFamille("FAMILLE_PALETTE_TEMPS_REEL");
  const Pictogramme = famille.pictogramme;
  return (
    <section className="ec-salle" title="Une seule salle par bundle : toutes ses unités s'y retrouvent" style={{ "--ec-teinte": `var(--${famille.teinte})` } as CSSProperties}>
      <Pictogramme size={18} aria-hidden="true" />
      <div>
        <strong>{data.element.nom ?? "Salle temps réel"}</strong>
        <small>Une seule par bundle</small>
      </div>
    </section>
  );
}
