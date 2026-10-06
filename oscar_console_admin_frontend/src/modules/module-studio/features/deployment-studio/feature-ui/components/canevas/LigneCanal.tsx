import { Handle } from "@xyflow/react";
import { useCanevas, useMarques } from "./contexte";
import type { CanalAffiche } from "./disposition";

/**
 * Un canal d'une unité, sur une ligne : une entrée à gauche, son point de
 * connexion sur le bord gauche ; une sortie à droite, son point sur le bord
 * droit. Le point se saisit sur 20 px, même s'il est dessiné plus petit ;
 * l'entrée est verte, la sortie rose, et la forme dit aussi le sens (point
 * creux pour une entrée, plein pour une sortie) : jamais la couleur seule.
 *
 * Pendant qu'on tire une liaison, les canaux qui l'accepteraient s'éclairent
 * et les autres s'estompent. Un clic sur la ligne choisit le canal.
 */
export default function LigneCanal({ canal }: { readonly canal: CanalAffiche }) {
  const { onSelectionner, canauxReliables } = useCanevas();
  const marques = useMarques({ sorte: "element", id: canal.element.id });
  const entree = canal.poignee === "target";
  const nom = canal.element.nom ?? canal.element.code;
  const pendantUneLiaison = canauxReliables !== null;
  const reliable = canauxReliables?.has(canal.element.id) ?? false;
  return (
    <div
      className={[
        "ec-canal", entree ? "ec-canal--entree" : "ec-canal--sortie", marques,
        pendantUneLiaison ? (reliable ? "ec-canal--reliable" : "ec-canal--estompe") : "",
      ].filter(Boolean).join(" ")}
      title={`${entree ? "Entrée" : "Sortie"} : ${nom}, ${canal.typeEnMots}, format ${canal.format} (${canal.element.code})`}
      data-element-id={canal.element.id}
      onClick={(evenement) => {
        evenement.stopPropagation();
        onSelectionner({ sorte: "element", id: canal.element.id });
      }}
    >
      <Handle
        id={canal.element.id}
        type={canal.poignee}
        position={canal.cote}
        className={`ec-poignee ${entree ? "ec-poignee--entree" : "ec-poignee--sortie"}`}
        aria-label={`${entree ? "Entrée" : "Sortie"} ${nom}`}
      />
      <span className="ec-canal__point" aria-hidden="true" />
      <span className="ec-canal__texte">
        <strong>{nom}</strong>
        <small>{canal.format}</small>
      </span>
    </div>
  );
}
