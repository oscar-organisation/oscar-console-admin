import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, useInternalNode, type EdgeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { useCanevas } from "./contexte";
import { ID_DU_CADRE, MESURES, type LiaisonDuCanevas } from "./disposition";

/**
 * Une liaison de données sur le canevas : de la sortie (à droite d'une unité)
 * vers l'entrée (à gauche d'une autre), la flèche à l'arrivée, sans animation
 * permanente. Elle se saisit sur une large bande invisible ; au survol, elle
 * s'éclaire en entier ; choisie, elle montre en son milieu un bouton pour la
 * retirer (un geste qu'on peut annuler).
 *
 * Une liaison qui doit revenir de droite à gauche (l'entrée est à gauche de la
 * sortie) passe SOUS les blocs, dans la marge du bas du cadre du bundle,
 * jamais à travers eux : elle sort à droite, descend, revient à gauche sous
 * tout le contenu, remonte et entre par la gauche.
 */

/** La longueur du premier et du dernier segment d'une liaison qui revient : elle quitte et rejoint le bord du bloc. */
const DEPART = 20;

export default function LiaisonDeDonnees(proprietes: EdgeProps<LiaisonDuCanevas>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd } = proprietes;
  const { selection, onRetirerUneLiaison } = useCanevas();
  const cadre = useInternalNode(ID_DU_CADRE);
  const choisie = selection?.sorte === "liaison" && selection.id === id;

  let chemin: string;
  let milieuX: number;
  let milieuY: number;
  if (targetX < sourceX + 2 * DEPART && cadre) {
    // Le bas du contenu : le bas du cadre, moins la moitié de sa marge.
    const basDuCadre = cadre.internals.positionAbsolute.y + (cadre.measured.height ?? cadre.height ?? 0);
    const bas = Math.max(basDuCadre - MESURES.margeDuCadre / 2, sourceY + DEPART, targetY + DEPART);
    chemin = [
      `M ${sourceX} ${sourceY}`,
      `H ${sourceX + DEPART}`,
      `V ${bas}`,
      `H ${targetX - DEPART}`,
      `V ${targetY}`,
      `H ${targetX}`,
    ].join(" ");
    milieuX = (sourceX + targetX) / 2;
    milieuY = bas;
  } else {
    [chemin, milieuX, milieuY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10 });
  }

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
