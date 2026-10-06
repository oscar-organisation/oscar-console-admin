import type { NodeProps } from "@xyflow/react";
import { PackageOpen } from "lucide-react";
import { SELECTION_DU_BUNDLE } from "../../selection";
import { useMarques } from "./contexte";
import { ID_DU_CADRE, type NoeudDuCadre } from "./disposition";

/** Le cadre du bundle : il contient les zones et la salle ; son nom se lit en haut à droite. */
export default function NoeudBundle({ data }: NodeProps<NoeudDuCadre>) {
  const marques = useMarques(SELECTION_DU_BUNDLE);
  return (
    <section className={`ec-cadre ${marques}`} data-cible-id={ID_DU_CADRE}>
      <header className="ec-cadre__titre">
        <span className="ec-cadre__icone"><PackageOpen size={15} aria-hidden="true" /></span>
        <span>
          <span className="ec-surtitre">Bundle de déploiement</span>
          <strong>{data.nom}</strong>
        </span>
      </header>
    </section>
  );
}
