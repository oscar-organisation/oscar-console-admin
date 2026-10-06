import type { NodeProps } from "@xyflow/react";
import { AlertTriangle, MapPinned, Plus } from "lucide-react";
import { SORTES, type Sorte } from "../../../feature-domain/modele/types";
import { useCanevas, useMarques } from "./contexte";
import type { NoeudDeZone } from "./disposition";

/**
 * Une zone d'environnement : un cadre qui contient ses services ou ses
 * applications, titré comme un bloc de l'ancien éditeur (icône, genre en
 * petites capitales, nom, code), avec « Facultative » écrit en toutes
 * lettres quand elle l'est. La zone Externe a un bord en pointillés
 * (formalisation 2.9) ; une zone « à préciser », venue de la reprise d'un
 * ancien bundle, le dit. Vide, elle propose le geste suivant.
 */

const NOMS: Partial<Record<Sorte, string>> = {
  [SORTES.SERVICE]: "un service",
  [SORTES.APPLICATION]: "une application",
};

export default function NoeudZone({ data }: NodeProps<NoeudDeZone>) {
  const { onAjouter } = useCanevas();
  const marques = useMarques({ sorte: "element", id: data.element.id });
  const classes = ["ec-zone", data.externe ? "ec-zone--externe" : "", data.facultative ? "ec-zone--facultative" : "", marques]
    .filter(Boolean).join(" ");
  const genre = data.externe ? "Externe : hors de nos machines" : `Zone ${data.typeEnMots}`;
  const recues = data.recoit.map((sorte) => NOMS[sorte]).filter(Boolean).join(" ou ");
  return (
    <section className={classes} data-cible-id={data.element.id}>
      <header className="ec-zone__entete">
        <span className="ec-zone__icone"><MapPinned size={17} aria-hidden="true" /></span>
        <span className="ec-zone__titre">
          <span className="ec-surtitre">{genre}</span>
          <strong>{data.element.nom ?? data.element.code}</strong>
          <code>{data.element.code}</code>
        </span>
        {data.facultative && <span className="ec-marque ec-marque--facultative">Facultative</span>}
        {data.aPreciser && (
          <span className="ec-marque ec-marque--a-preciser"><AlertTriangle size={12} aria-hidden="true" /> Type à préciser</span>
        )}
      </header>
      {data.vide && (
        <div className="ec-zone__vide">
          {data.externe ? (
            <span>Les connexions vers l’extérieur arriveront avec une prochaine version du Studio.</span>
          ) : (
            <>
              <span>Déposez {recues} dans cette zone.</span>
              <span className="ec-zone__boutons">
                {data.recoit.map((sorte) => (
                  <button
                    key={sorte}
                    type="button"
                    className="ec-ajouter-dans-la-zone nodrag"
                    onClick={(evenement) => {
                      evenement.stopPropagation();
                      onAjouter(sorte, data.element.id);
                    }}
                  >
                    <Plus size={13} aria-hidden="true" /> {sorte === SORTES.SERVICE ? "Ajouter un service" : "Ajouter une application"}
                  </button>
                ))}
              </span>
            </>
          )}
        </div>
      )}
    </section>
  );
}
