import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { useCanevas } from "./contexte";
import type { LiaisonDuCanevas } from "./disposition";

/**
 * Une liaison de données sur le canevas : de la sortie (à droite d'une unité)
 * vers l'entrée (à gauche d'une autre), la flèche à l'arrivée, sans animation
 * permanente. Elle se saisit sur une large bande invisible ; au survol, elle
 * s'éclaire en entier ; choisie, elle montre en son milieu un bouton pour la
 * retirer (un geste qu'on peut annuler).
 */
export default function LiaisonDeDonnees(proprietes: EdgeProps<LiaisonDuCanevas>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd } = proprietes;
  const { selection, onRetirerUneLiaison } = useCanevas();
  const choisie = selection?.sorte === "liaison" && selection.id === id;
  const [chemin, milieuX, milieuY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10 });
  return (
    <>
      <BaseEdge
        id={id}
        path={chemin}
        interactionWidth={24}
        className={choisie ? "ec-liaison ec-liaison--choisie" : "ec-liaison"}
        {...(markerEnd ? { markerEnd } : {})}
      />
      {choisie && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="ec-retirer-liaison nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${milieuX}px, ${milieuY}px)` }}
            aria-label="Retirer cette liaison"
            title="Retirer cette liaison (vous pourrez annuler)"
            onClick={(evenement) => {
              evenement.stopPropagation();
              onRetirerUneLiaison(id);
            }}
          >
            <X size={12} aria-hidden="true" /> Retirer
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
