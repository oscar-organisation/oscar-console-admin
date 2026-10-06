import { useMemo } from "react";
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, type Node, type NodeTypes } from "@xyflow/react";
import type { FamilleDuCatalogue } from "../../feature-domain/modele/types";
import type { Disposition, NoeudDuCanevas } from "./canevas/disposition";
import NoeudBundle from "./canevas/NoeudBundle";
import NoeudComposant from "./canevas/NoeudComposant";
import NoeudSalle from "./canevas/NoeudSalle";
import NoeudZone from "./canevas/NoeudZone";
import Legende from "./Legende";

/**
 * L'espace de composition du nouveau Studio : le canevas, sa mini-carte et
 * son zoom, et la légende dans sa colonne (conception du lot L1, parties 6.1 et 6.4).
 *
 * À cette étape (I3), il AFFICHE un bundle, en lecture : les blocs ne se
 * déplacent pas, les canaux ne se relient pas. Composer à la souris et au
 * clavier arrive aux étapes I4 et I5, par la bibliothèque des opérations ;
 * aucune règle ne vivra ici.
 */

// Hors du composant : React Flow attend une liste de types qui ne change pas d'un rendu à l'autre.
const TYPES_DE_NOEUDS: NodeTypes = {
  bundle: NoeudBundle,
  zone: NoeudZone,
  salle: NoeudSalle,
  composant: NoeudComposant,
};

// Dans la mini-carte, chaque bloc garde la teinte de sa famille ; le cadre du
// bundle n'y est qu'un contour, pour que les zones se distinguent.
function couleurDansLaMiniCarte(noeud: Node): string {
  if (noeud.type === "zone") return "color-mix(in srgb, var(--famille-environnements) 22%, transparent)";
  if (noeud.type === "salle") return "var(--famille-temps-reel)";
  if (noeud.type === "composant") return "var(--famille-services)";
  return "transparent";
}

function bordDansLaMiniCarte(noeud: Node): string {
  if (noeud.type === "bundle") return "var(--shell-line-strong)";
  if (noeud.type === "zone") return "var(--famille-environnements)";
  return "transparent";
}

export interface ProprietesDeLEspace {
  /** Le bundle disposé (canevas/disposition.ts), calculé une fois par la page. */
  readonly disposition: Disposition;
  /** Les familles du catalogue, dans leur ordre, pour la légende. */
  readonly familles: readonly FamilleDuCatalogue[];
}

export default function EspaceComposition({ disposition, familles }: ProprietesDeLEspace) {
  // React Flow lit des listes modifiables ; la disposition, elle, ne change jamais un état reçu.
  const noeuds = useMemo(() => [...disposition.noeuds] as NoeudDuCanevas[], [disposition]);
  const liaisons = useMemo(() => [...disposition.liaisons], [disposition]);

  // Les familles présentes sur le canevas, dans l'ordre du catalogue.
  const famillesPresentes = useMemo(() => {
    const presentes = new Set<string>();
    if (disposition.compteurs.zones > 0) presentes.add("FAMILLE_PALETTE_ENVIRONNEMENTS");
    if (noeuds.some((noeud) => noeud.type === "salle")) presentes.add("FAMILLE_PALETTE_TEMPS_REEL");
    if (disposition.compteurs.composants > 0) presentes.add("FAMILLE_PALETTE_SERVICES_APPLICATIONS");
    return familles.filter((famille) => presentes.has(famille.code));
  }, [familles, disposition.compteurs, noeuds]);

  return (
    <div className="ec-corps">
      <div className="ec-canevas" data-testid="espace-composition">
        <ReactFlow
          nodes={noeuds}
          edges={liaisons}
          nodeTypes={TYPES_DE_NOEUDS}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          edgesFocusable={false}
          deleteKeyCode={null}
          // Sans couleur imposée, la flèche prend celle de la liaison, que la feuille du canevas règle par thème.
          defaultMarkerColor={null}
          fitView
          fitViewOptions={{ padding: 0.06 }}
          minZoom={0.25}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            ariaLabel="Mini-carte du bundle"
            nodeColor={couleurDansLaMiniCarte}
            nodeStrokeColor={bordDansLaMiniCarte}
            nodeStrokeWidth={2}
          />
        </ReactFlow>
      </div>
      {/* La légende a sa colonne : toujours visible, elle ne cache jamais un bloc du canevas. */}
      <div className="ec-cote">
        <Legende familles={famillesPresentes} />
      </div>
    </div>
  );
}
