import type { NodeProps } from "@xyflow/react";
import { RadioTower } from "lucide-react";
import { useMarques } from "./contexte";
import type { NoeudDeSalle } from "./disposition";

/** La salle temps réel : un bloc compact en haut du cadre du bundle, une seule par bundle. */
export default function NoeudSalle({ data }: NodeProps<NoeudDeSalle>) {
  const marques = useMarques({ sorte: "element", id: data.element.id });
  return (
    <section
      className={`ec-salle ${marques}`}
      data-cible-id={data.element.id}
      title="Une seule salle par bundle : toutes ses unités s'y retrouvent"
    >
      <span className="ec-salle__icone"><RadioTower size={16} aria-hidden="true" /></span>
      <span className="ec-salle__titre">
        <span className="ec-surtitre">Temps réel</span>
        <strong>{data.element.nom ?? "Salle temps réel"}</strong>
      </span>
      <small>Une par bundle</small>
    </section>
  );
}
