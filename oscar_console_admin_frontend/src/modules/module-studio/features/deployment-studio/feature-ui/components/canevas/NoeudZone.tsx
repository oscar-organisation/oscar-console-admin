import type { CSSProperties } from "react";
import type { NodeProps } from "@xyflow/react";
import { AlertTriangle } from "lucide-react";
import { presentationDeLaFamille } from "../../familles";
import type { NoeudDeZone } from "./disposition";

/**
 * Une zone d'environnement : un cadre titré, avec le pictogramme de sa famille,
 * son nom, son type en mots, et « Facultative » écrit en toutes lettres quand
 * elle l'est. La zone Externe a un bord en pointillés (formalisation 2.9) ; une
 * zone « à préciser » (venue de la reprise d'un ancien bundle) le dit.
 */
export default function NoeudZone({ data }: NodeProps<NoeudDeZone>) {
  const famille = presentationDeLaFamille("FAMILLE_PALETTE_ENVIRONNEMENTS");
  const Pictogramme = famille.pictogramme;
  const classes = ["ec-zone", data.externe ? "ec-zone--externe" : "", data.facultative ? "ec-zone--facultative" : ""]
    .filter(Boolean).join(" ");
  return (
    <section className={classes} style={{ "--ec-teinte": `var(--${famille.teinte})` } as CSSProperties}>
      <header className="ec-zone__entete">
        <Pictogramme size={18} aria-hidden="true" />
        <div>
          <strong>{data.element.nom ?? data.element.code}</strong>
          <small>{data.externe ? "Externe : hors de nos machines" : `Zone ${data.typeEnMots}`}</small>
        </div>
        {data.facultative && <span className="ec-marque ec-marque--facultative">Facultative</span>}
        {data.aPreciser && (
          <span className="ec-marque ec-marque--a-preciser"><AlertTriangle size={13} aria-hidden="true" /> Type à préciser</span>
        )}
      </header>
    </section>
  );
}
