import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ClicReact, type ReactNode } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodePositionChange,
  type NodeTypes,
  type XYPosition,
} from "@xyflow/react";
import { descendants, parentDuDepot } from "../../feature-domain/modele/possibilites";
import { SORTES, type ModeleBundle, type Position, type Refus, type Sorte } from "../../feature-domain/modele/types";
import { SELECTION_DU_BUNDLE, type Selection } from "../selection";
import { ATTRIBUT_DE_CIBLE, ContexteDuCanevas, type EtatDuCanevas } from "./canevas/contexte";
import { ID_DU_CADRE, MESURES, type Disposition, type NoeudDuCanevas } from "./canevas/disposition";
import LiaisonDeDonnees from "./canevas/LiaisonDeDonnees";
import NoeudBundle from "./canevas/NoeudBundle";
import NoeudComposant from "./canevas/NoeudComposant";
import NoeudSalle from "./canevas/NoeudSalle";
import NoeudZone from "./canevas/NoeudZone";

/**
 * L'espace de composition du nouveau Studio : le canevas, sa mini-carte et
 * son zoom (conception du lot L1, parties 4.2, 6.1 et 6.4).
 *
 * On y compose à la souris : déposer une carte de la palette, glisser un
 * bloc, tirer une liaison d'une sortie vers une entrée, choisir un élément.
 * Le canevas ne décide de rien : il dit à l'éditeur quel geste a été fait, où,
 * et l'éditeur le joue par les opérations du modèle, qui l'acceptent ou le
 * refusent avec leur raison. Aucune règle ne vit ici.
 *
 * Le parent d'un dépôt se lit SOUS LE POINTEUR (React Flow ne range jamais un
 * nœud dans un autre de lui-même ; lecture de sa version 12.11.6 dans le
 * compte rendu de l'étape I4) : la pile des éléments à cet endroit, du plus
 * profond au cadre du bundle, passe à `parentDuDepot`.
 */

// Hors du composant : React Flow attend des listes de types qui ne changent pas d'un rendu à l'autre.
const TYPES_DE_NOEUDS: NodeTypes = {
  bundle: NoeudBundle,
  zone: NoeudZone,
  salle: NoeudSalle,
  composant: NoeudComposant,
};
const TYPES_DE_LIAISONS: EdgeTypes = { liaison: LiaisonDeDonnees };

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

/** Un point de l'écran, là où un geste a eu lieu : un refus s'y affiche. */
export interface PointDeLEcran {
  readonly x: number;
  readonly y: number;
}

/** Ce que la palette fait glisser : la sorte d'élément qu'elle propose. */
export interface ObjetGlisse {
  readonly sorte: Sorte;
}

/** Une demande de centrer le canevas sur un nœud (« Localiser ») ; le jeton change à chaque demande. */
export interface Centrage {
  readonly noeud: string;
  readonly jeton: number;
}

export interface ProprietesDeLEspace {
  /** Le bundle disposé (canevas/disposition.ts), calculé une fois par la page. */
  readonly disposition: Disposition;
  readonly modele: ModeleBundle;
  readonly selection: Selection | null;
  readonly onSelectionner: (selection: Selection) => void;
  /** Les éléments à éclairer comme parents compatibles (pendant un glissement, ou après un refus). */
  readonly compatibles: ReadonlySet<string>;
  /** La carte de la palette en cours de glissement, s'il y en a une. */
  readonly objetGlisse: ObjetGlisse | null;
  /** Le nombre de problèmes de chaque élément : un badge les montre sur son bloc. */
  readonly problemes: ReadonlyMap<string, number>;
  /** Les éléments qui viennent d'apparaître : ils s'animent brièvement. */
  readonly nouveaux: ReadonlySet<string>;
  /** Les canaux qu'on pourrait relier à celui-ci (les règles, jouées à blanc). */
  readonly canauxReliablesDepuis: (canal: string) => ReadonlySet<string>;
  /** Le refus qu'essuierait cette liaison, ou `null`. */
  readonly refusDUneLiaison: (source: string, destination: string) => Refus | null;
  /** Une carte de la palette lâchée : dans quel parent, à quelle place. */
  readonly onDeposer: (parent: string | null, position: Position | undefined, point: PointDeLEcran) => void;
  /** Un bloc commence à glisser : l'éditeur calcule où il pourrait aller. */
  readonly onDebutDuDeplacement: (id: string) => void;
  /** Un bloc lâché dans son parent : sa nouvelle place. */
  readonly onPlacer: (id: string, position: Position) => void;
  /** Un bloc lâché dans un autre parent : l'éditeur montre l'aperçu, ou le refus. */
  readonly onChangerDeParent: (id: string, parent: string | null, point: PointDeLEcran) => void;
  readonly onFinDuDeplacement: () => void;
  /** Une sortie tirée jusqu'à une entrée. */
  readonly onRelier: (source: string, destination: string, point: PointDeLEcran) => void;
  /** Une liaison lâchée là où elle ne peut pas aller : la raison, à l'endroit du lâcher. */
  readonly onLiaisonImpossible: (message: string, point: PointDeLEcran) => void;
  /** « Ajouter une unité », « Ajouter une entrée »... : un bouton du canevas. */
  readonly onAjouter: (sorte: Sorte, parent: string) => void;
  readonly onRetirerUneLiaison: (id: string) => void;
  readonly centrage: Centrage | null;
  /** Ce qui s'affiche par-dessus le canevas : l'état vide, la légende, les messages. */
  readonly children?: ReactNode;
}

/** Les éléments sous un point de l'écran, du plus profond au cadre du bundle (noté `null`). */
function pileSousLePointeur(point: PointDeLEcran, exclus: ReadonlySet<string>): (string | null)[] {
  const pile: (string | null)[] = [];
  const vus = new Set<string>();
  for (const dessous of document.elementsFromPoint(point.x, point.y)) {
    const id = dessous.getAttribute(ATTRIBUT_DE_CIBLE);
    if (id === null || vus.has(id) || exclus.has(id)) continue;
    vus.add(id);
    pile.push(id === ID_DU_CADRE ? null : id);
  }
  return pile;
}

/** Les libellés que React Flow lit à voix haute ou montre au survol, en français. */
const LIBELLES_DE_REACT_FLOW = {
  "node.a11yDescription.default": "Bloc du bundle : cliquez pour le choisir, glissez-le pour le déplacer.",
  "node.a11yDescription.keyboardDisabled": "Bloc du bundle : cliquez pour le choisir, glissez-le pour le déplacer.",
  "edge.a11yDescription.default": "Liaison de données : cliquez pour la choisir.",
  "controls.ariaLabel": "Zoom du canevas",
  "controls.zoomIn.ariaLabel": "Zoomer",
  "controls.zoomOut.ariaLabel": "Dézoomer",
  "controls.fitView.ariaLabel": "Ajuster à l’écran",
  "controls.interactive.ariaLabel": "Verrouiller le canevas",
  "minimap.ariaLabel": "Mini-carte du bundle",
  "handle.ariaLabel": "Point de connexion",
};

/**
 * Le zoom le plus faible à l'ouverture : en dessous, les textes des blocs ne
 * se lisent plus. Un bundle qui ne tient pas entier à ce zoom s'ouvre sur son
 * coin haut gauche ; la mini-carte et « ajuster à l'écran » montrent le reste.
 */
const ZOOM_D_OUVERTURE_MINIMAL = 0.55;
/** La marge autour du bundle, à l'ouverture, en pixels de l'écran. */
const MARGE_D_OUVERTURE = 20;

/** Les sortes qui ont une place à elles sur le canevas (les autres se rangent seules dans leur bloc). */
const SORTES_PLACEES: readonly Sorte[] = [SORTES.ZONE, SORTES.SALLE, SORTES.SERVICE, SORTES.APPLICATION];

/** Une place jamais à gauche ni au-dessus de son parent, et sous l'en-tête d'une zone. */
function placeDansLeParent(position: Position, sorte: Sorte): Position {
  const haut = sorte === SORTES.SERVICE || sorte === SORTES.APPLICATION ? MESURES.enTeteDeZone : 0;
  return { x: Math.max(0, Math.round(position.x)), y: Math.max(haut, Math.round(position.y)) };
}

function pointDe(evenement: MouseEvent | TouchEvent): PointDeLEcran {
  if ("changedTouches" in evenement) {
    const toucher = evenement.changedTouches[0];
    return { x: toucher?.clientX ?? 0, y: toucher?.clientY ?? 0 };
  }
  return { x: evenement.clientX, y: evenement.clientY };
}

function Canevas(proprietes: ProprietesDeLEspace) {
  const {
    disposition, modele, selection, onSelectionner, compatibles, objetGlisse, problemes, nouveaux,
    canauxReliablesDepuis, refusDUneLiaison, onDeposer, onDebutDuDeplacement, onPlacer, onChangerDeParent,
    onFinDuDeplacement, onRelier, onLiaisonImpossible, onAjouter, onRetirerUneLiaison, centrage, children,
  } = proprietes;
  const flux = useReactFlow();
  const conteneur = useRef<HTMLDivElement>(null);
  const [cible, setCible] = useState<string | null>(null);
  const [canauxReliables, setCanauxReliables] = useState<ReadonlySet<string> | null>(null);

  // Les nœuds viennent tout droit de la disposition : le canevas n'en garde
  // pas de copie, qui pourrait prendre du retard sur le modèle. Seules les
  // places d'un glissement en cours s'y superposent, le temps du glissement,
  // et seulement pour la disposition où il a commencé : dès que le modèle
  // change (le bloc posé, ou refusé), elles s'effacent d'elles-mêmes.
  // Les tailles que React Flow mesure ne nous servent pas : chaque bloc a la
  // sienne, donnée par la disposition.
  const [glissement, setGlissement] = useState<{ readonly source: Disposition; readonly places: ReadonlyMap<string, XYPosition> } | null>(null);
  const places = glissement?.source === disposition ? glissement.places : null;
  const noeuds = useMemo((): NoeudDuCanevas[] => (places
    ? disposition.noeuds.map((noeud) => {
      const place = places.get(noeud.id);
      return place ? { ...noeud, position: place } : noeud;
    })
    : [...disposition.noeuds]), [disposition, places]);
  const auChangementDesNoeuds = useCallback((changements: NodeChange<NoeudDuCanevas>[]) => {
    const deplaces = changements.filter((changement): changement is NodePositionChange & { position: XYPosition } =>
      changement.type === "position" && changement.dragging === true && changement.position !== undefined);
    if (deplaces.length === 0) return;
    setGlissement((avant) => {
      const suivantes = new Map(avant?.source === disposition ? avant.places : []);
      for (const changement of deplaces) suivantes.set(changement.id, changement.position);
      return { source: disposition, places: suivantes };
    });
  }, [disposition]);
  const liaisons = useMemo((): Edge[] => [...disposition.liaisons], [disposition]);
  const sorteDe = useMemo(() => new Map(modele.elements.map((element) => [element.id, element.sorte])), [modele]);

  // À l'ouverture : tout le bundle à l'écran s'il y tient à un zoom lisible, sans jamais grossir
  // au-delà de sa taille réelle ; sinon, ce zoom lisible, cadré sur le coin haut gauche.
  // Le cadre du bundle a sa taille dans la disposition : le calcul n'attend aucune mesure, et se
  // fait une seule fois, juste après le premier affichage, avant tout geste de la personne (un
  // cadrage qui viendrait après un geste, « ajuster à l'écran » par exemple, l'annulerait).
  const dispositionDOuverture = useRef(disposition);
  useEffect(() => {
    const cadre = dispositionDOuverture.current.noeuds.find((noeud) => noeud.id === ID_DU_CADRE);
    if (!conteneur.current || !cadre) return;
    const { clientWidth: largeur, clientHeight: hauteur } = conteneur.current;
    const [largeurDuBundle, hauteurDuBundle] = [cadre.width ?? 0, cadre.height ?? 0];
    if (largeurDuBundle <= 0 || hauteurDuBundle <= 0 || largeur <= 0 || hauteur <= 0) return;
    const zoomPourTout = Math.min((largeur - 2 * MARGE_D_OUVERTURE) / largeurDuBundle, (hauteur - 2 * MARGE_D_OUVERTURE) / hauteurDuBundle);
    const zoom = Math.min(1, Math.max(ZOOM_D_OUVERTURE_MINIMAL, zoomPourTout));
    const placer = (place: number, taille: number) => (taille * zoom <= place - 2 * MARGE_D_OUVERTURE
      ? (place - taille * zoom) / 2
      : MARGE_D_OUVERTURE);
    void flux.setViewport({ x: placer(largeur, largeurDuBundle), y: placer(hauteur, hauteurDuBundle), zoom });
  }, [flux]);

  // « Localiser » : le canevas se centre sur le bloc demandé.
  useEffect(() => {
    if (!centrage) return;
    const noeud = flux.getInternalNode(centrage.noeud);
    if (!noeud) return;
    const { x, y } = noeud.internals.positionAbsolute;
    const largeur = noeud.measured.width ?? noeud.width ?? 0;
    const hauteur = noeud.measured.height ?? noeud.height ?? 0;
    void flux.setCenter(x + largeur / 2, y + Math.min(hauteur / 2, 240), { zoom: Math.max(flux.getZoom(), 0.85), duration: 300 });
  }, [centrage, flux]);

  /** La place d'un dépôt, relative à son parent : le point lâché, moins la position du parent. */
  const placeDuDepot = (point: PointDeLEcran, parent: string | null, sorte: Sorte): Position | undefined => {
    if (!SORTES_PLACEES.includes(sorte)) return undefined;
    const dansLeFlux = flux.screenToFlowPosition(point);
    const noeudParent = flux.getInternalNode(parent ?? ID_DU_CADRE);
    const origine = noeudParent?.internals.positionAbsolute ?? { x: 0, y: 0 };
    // Le coin du bloc se pose un peu au-dessus et à gauche du pointeur : il « tient » le bloc par son en-tête.
    return placeDansLeParent({ x: dansLeFlux.x - origine.x - 24, y: dansLeFlux.y - origine.y - 20 }, sorte);
  };

  const auSurvol = (evenement: DragEvent<HTMLDivElement>) => {
    if (!objetGlisse) return;
    evenement.preventDefault();
    evenement.dataTransfer.dropEffect = "copy";
    const pile = pileSousLePointeur({ x: evenement.clientX, y: evenement.clientY }, new Set());
    const parent = parentDuDepot(pile, objetGlisse.sorte, modele);
    setCible(parent ?? ID_DU_CADRE);
  };

  const auDepot = (evenement: DragEvent<HTMLDivElement>) => {
    setCible(null);
    if (!objetGlisse) return;
    evenement.preventDefault();
    const point = { x: evenement.clientX, y: evenement.clientY };
    const parent = parentDuDepot(pileSousLePointeur(point, new Set()), objetGlisse.sorte, modele);
    onDeposer(parent, placeDuDepot(point, parent, objetGlisse.sorte), point);
  };

  const contexteDuCanevas = useMemo((): EtatDuCanevas => ({
    selection, compatibles, cible, canauxReliables, problemes, nouveaux, onSelectionner, onAjouter, onRetirerUneLiaison,
  }), [selection, compatibles, cible, canauxReliables, problemes, nouveaux, onSelectionner, onAjouter, onRetirerUneLiaison]);

  return (
    <ContexteDuCanevas.Provider value={contexteDuCanevas}>
      <div
        ref={conteneur}
        className={`ec-canevas${canauxReliables ? " ec-canevas--liaison-en-cours" : ""}`}
        data-testid="espace-composition"
        // Un seul arrêt de Tab pour tout le canevas ; ses touches passent par clavier/raccourcis.ts.
        tabIndex={0}
        role="application"
        aria-roledescription="canevas"
        aria-label="Canevas du bundle : flèches pour passer d’un élément à l’autre, Entrée pour ses propriétés, A pour ajouter, Suppr pour supprimer"
        data-zone-clavier="canevas"
        onDragOver={auSurvol}
        onDragLeave={() => setCible(null)}
        onDrop={auDepot}
      >
        <ReactFlow
          nodes={noeuds}
          edges={liaisons}
          nodeTypes={TYPES_DE_NOEUDS}
          edgeTypes={TYPES_DE_LIAISONS}
          onNodesChange={auChangementDesNoeuds}
          // La sélection est celle de l'éditeur, partagée avec l'arborescence et l'inspecteur.
          elementsSelectable={false}
          nodesConnectable
          // Le clavier de React Flow est coupé : il déplacerait les blocs aux flèches, supprimerait
          // au Retour arrière, ferait de chaque bloc un arrêt de Tab (lecture de sa version 12.11.6,
          // étape I5). Le Studio a ses propres touches, les mêmes que dans l'arborescence.
          disableKeyboardA11y
          nodesFocusable={false}
          edgesFocusable={false}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          panActivationKeyCode={null}
          zoomActivationKeyCode={null}
          onNodeClick={(_evenement: ClicReact, noeud: Node) => {
            onSelectionner(noeud.id === ID_DU_CADRE ? SELECTION_DU_BUNDLE : { sorte: "element", id: noeud.id });
          }}
          onEdgeClick={(_evenement: ClicReact, liaison: Edge) => onSelectionner({ sorte: "liaison", id: liaison.id })}
          onPaneClick={() => onSelectionner(SELECTION_DU_BUNDLE)}
          // Tirer une liaison : les canaux qui l'accepteraient s'éclairent, les autres s'estompent ;
          // lâchée près d'une entrée, elle s'y raccroche ; refusée, elle dit pourquoi, là où on l'a lâchée.
          connectionRadius={40}
          connectionLineStyle={{ stroke: "var(--shell-blue)", strokeWidth: 2.5, strokeDasharray: "6 5" }}
          isValidConnection={(connexion) => Boolean(connexion.sourceHandle && connexion.targetHandle
            && refusDUneLiaison(connexion.sourceHandle, connexion.targetHandle) === null)}
          onConnectStart={(_evenement, { handleId }) => {
            if (handleId) setCanauxReliables(canauxReliablesDepuis(handleId));
          }}
          onConnect={(connexion: Connection) => {
            if (connexion.sourceHandle && connexion.targetHandle) {
              const fin = flux.flowToScreenPosition(flux.getInternalNode(connexion.target)?.internals.positionAbsolute ?? { x: 0, y: 0 });
              onRelier(connexion.sourceHandle, connexion.targetHandle, fin);
            }
          }}
          onConnectEnd={(evenement, etat) => {
            setCanauxReliables(null);
            if (etat.isValid !== false && etat.toHandle) return;
            const point = pointDe(evenement);
            const depart = etat.fromHandle;
            const arrivee = etat.toHandle;
            if (depart?.id && arrivee?.id) {
              const [sortie, entree] = depart.type === "source" ? [depart.id, arrivee.id] : [arrivee.id, depart.id];
              const refus = refusDUneLiaison(sortie, entree);
              if (refus) onLiaisonImpossible(refus.message, point);
            } else if (depart) {
              onLiaisonImpossible(depart.type === "source"
                ? "Lâchez la liaison sur une entrée : un point vert, à gauche d’une unité."
                : "Lâchez la liaison sur une sortie : un point rose, à droite d’une unité.", point);
            }
          }}
          onNodeDragStart={(_evenement, noeud) => onDebutDuDeplacement(noeud.id)}
          onNodeDrag={(evenement, noeud) => {
            const sorte = sorteDe.get(noeud.id);
            if (sorte !== SORTES.SERVICE && sorte !== SORTES.APPLICATION) return;
            const pile = pileSousLePointeur(pointDe(evenement), descendants(modele.elements, noeud.id));
            setCible(parentDuDepot(pile, sorte, modele) ?? ID_DU_CADRE);
          }}
          onNodeDragStop={(evenement, noeud) => {
            setCible(null);
            const sorte = sorteDe.get(noeud.id);
            const actuel = modele.elements.find((element) => element.id === noeud.id);
            if (sorte && actuel && (sorte === SORTES.SERVICE || sorte === SORTES.APPLICATION)) {
              const point = pointDe(evenement);
              const parent = parentDuDepot(pileSousLePointeur(point, descendants(modele.elements, noeud.id)), sorte, modele);
              if (parent !== actuel.parent) {
                // Rien ne bouge avant la confirmation : le bloc revient à sa place.
                setGlissement(null);
                onChangerDeParent(noeud.id, parent, point);
                onFinDuDeplacement();
                return;
              }
            }
            setGlissement(null);
            if (sorte) onPlacer(noeud.id, placeDansLeParent(noeud.position, sorte));
            onFinDuDeplacement();
          }}
          // Sans couleur imposée, la flèche prend celle de la liaison, que la feuille du canevas règle par thème.
          defaultMarkerColor={null}
          // « Ajuster à l'écran » (le bouton du zoom) montre tout le bundle, sans le grossir au-delà de sa taille réelle.
          fitViewOptions={{ padding: 0.06, maxZoom: 1 }}
          minZoom={0.2}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
          ariaLabelConfig={LIBELLES_DE_REACT_FLOW}
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
        {children}
      </div>
    </ContexteDuCanevas.Provider>
  );
}

export default function EspaceComposition(proprietes: ProprietesDeLEspace) {
  // useReactFlow (pour traduire un point de l'écran en place du canevas) demande ce fournisseur autour.
  return (
    <ReactFlowProvider>
      <Canevas {...proprietes} />
    </ReactFlowProvider>
  );
}
