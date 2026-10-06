import { Handle } from "@xyflow/react";
import type { CanalAffiche } from "./disposition";

/**
 * Un canal d'une unité, sur une ligne : une entrée à gauche, sa poignée sur le
 * bord gauche du bloc ; une sortie à droite, sa poignée sur le bord droit.
 * La poignée se saisit sur 24 × 24 px, même si le point dessiné est plus petit
 * (spécification 20.3) ; l'entrée est un point creux, la sortie un point plein :
 * la forme dit le sens, pas seulement la couleur.
 *
 * En lecture (étape I3 du lot L1), la poignée ne se relie pas.
 */
export default function LigneCanal({ canal }: { readonly canal: CanalAffiche }) {
  const entree = canal.poignee === "target";
  const nom = canal.element.nom ?? canal.element.code;
  return (
    <li
      className={`ec-canal ${entree ? "ec-canal--entree" : "ec-canal--sortie"}`}
      title={`${entree ? "Entrée" : "Sortie"} : ${nom}, ${canal.typeEnMots}, format ${canal.format} (${canal.element.code})`}
    >
      <Handle
        id={canal.element.id}
        type={canal.poignee}
        position={canal.cote}
        isConnectable={false}
        className={`ec-poignee ${entree ? "ec-poignee--entree" : "ec-poignee--sortie"}`}
        aria-label={`${entree ? "Entrée" : "Sortie"} ${nom}`}
      />
      {/* Le nom seul tient sur la ligne ; le type et le format se lisent au survol (et dans l'inspecteur, étape I4). */}
      <span className="ec-canal__nom">{nom}</span>
    </li>
  );
}
