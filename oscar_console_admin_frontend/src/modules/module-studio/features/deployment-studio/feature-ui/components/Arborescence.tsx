import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { nomAffiche } from "../../feature-domain/modele/possibilites";
import { NOMS_DES_SORTES } from "../../feature-domain/modele/regles";
import type { Element, ModeleBundle } from "../../feature-domain/modele/types";
import {
  CLE_DU_GROUPE_DES_LIAISONS,
  cleDeLaSelection,
  memeSelection,
  SELECTION_DU_BUNDLE,
  type Selection,
} from "../selection";

/**
 * L'arborescence réelle du bundle (conception du lot L1, partie 6.1) : le
 * bundle, ses zones et sa salle, leurs services et applications, les unités,
 * leur structure et leurs canaux, puis les liaisons. Chaque niveau se replie.
 * C'est l'autre façon de choisir un élément, sans le chercher sur le canevas :
 * la sélection est la même des deux côtés.
 *
 * Elle suit le motif « arbre » de WAI-ARIA : un seul élément de l'arbre se
 * reçoit au clavier (celui qui est sélectionné) ; les flèches s'y déplacent
 * (clavier/raccourcis.ts).
 */

export interface ProprietesDeLArborescence {
  readonly modele: ModeleBundle;
  readonly selection: Selection | null;
  readonly onSelectionner: (selection: Selection) => void;
  /** Les lignes repliées, par leur clé ; l'écran les garde, pour que le clavier les connaisse aussi. */
  readonly replies: ReadonlySet<string>;
  readonly onBasculer: (cle: string) => void;
}

interface LigneProps {
  /** `null` pour un groupe (les liaisons) : il se replie, mais ne se sélectionne pas. */
  readonly selection: Selection | null;
  readonly cle?: string;
  readonly niveau: number;
  readonly libelle: string;
  readonly detail: string;
  readonly enfants: ReactNode[];
  readonly courante: Selection | null;
  readonly replies: ReadonlySet<string>;
  readonly onSelectionner: (selection: Selection) => void;
  readonly onBasculer: (cle: string) => void;
}

function Ligne({ selection, cle: cleDonnee, niveau, libelle, detail, enfants, courante, replies, onSelectionner, onBasculer }: LigneProps) {
  const cle = selection ? cleDeLaSelection(selection) : cleDonnee ?? "";
  const choisie = selection !== null && memeSelection(selection, courante);
  const ouverte = !replies.has(cle);
  const aDesEnfants = enfants.length > 0;
  return (
    <li
      role="treeitem"
      aria-level={niveau}
      aria-selected={choisie}
      aria-expanded={aDesEnfants ? ouverte : undefined}
      aria-label={`${libelle}, ${detail}`}
      tabIndex={choisie ? 0 : -1}
      data-cle={cle}
      className="ec-arbre__element"
      onClick={(evenement) => {
        evenement.stopPropagation();
        if (selection) onSelectionner(selection);
        else onBasculer(cle);
      }}
    >
      <div className={`ec-arbre__ligne${choisie ? " ec-arbre__ligne--choisie" : ""}`} style={{ paddingLeft: 8 + (niveau - 1) * 14 }}>
        {aDesEnfants ? (
          <span
            className="ec-arbre__bascule"
            aria-hidden="true"
            onClick={(evenement) => {
              evenement.stopPropagation();
              onBasculer(cle);
            }}
          >
            {ouverte ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        ) : <span className="ec-arbre__bascule" aria-hidden="true" />}
        <span className="ec-arbre__nom">{libelle}</span>
        <small className="ec-arbre__detail">{detail}</small>
      </div>
      {aDesEnfants && ouverte && <ul role="group">{enfants}</ul>}
    </li>
  );
}

export default function Arborescence({ modele, selection, onSelectionner, replies, onBasculer }: ProprietesDeLArborescence) {
  const enfantsDe = (parent: string | null): Element[] => modele.elements.filter((element) => element.parent === parent);
  const commun = { courante: selection, replies, onSelectionner, onBasculer };
  const parId = new Map(modele.elements.map((element) => [element.id, element]));

  const ligneDeLElement = (element: Element, niveau: number): ReactNode => (
    <Ligne
      key={element.id}
      selection={{ sorte: "element", id: element.id }}
      niveau={niveau}
      libelle={nomAffiche(element)}
      detail={NOMS_DES_SORTES[element.sorte][1]}
      enfants={enfantsDe(element.id).map((enfant) => ligneDeLElement(enfant, niveau + 1))}
      {...commun}
    />
  );

  const nomDe = (id: string) => {
    const element = parId.get(id);
    return element ? nomAffiche(element) : "extrémité absente";
  };
  const liaisons = modele.liaisons.map((liaison) => (
    <Ligne
      key={liaison.id}
      selection={{ sorte: "liaison", id: liaison.id }}
      niveau={3}
      libelle={`${nomDe(liaison.source)} vers ${nomDe(liaison.destination)}`}
      detail="liaison de données"
      enfants={[]}
      {...commun}
    />
  ));

  return (
    <ul className="ec-arbre" role="tree" aria-label="Structure du bundle">
      <Ligne
        selection={SELECTION_DU_BUNDLE}
        niveau={1}
        libelle={modele.bundle.nom}
        detail="bundle"
        enfants={[
          ...enfantsDe(null).map((element) => ligneDeLElement(element, 2)),
          ...(liaisons.length > 0
            ? [(
              <Ligne
                key="liaisons"
                // Le groupe des liaisons n'est pas un élément du modèle : il ne se sélectionne pas.
                selection={null}
                cle={CLE_DU_GROUPE_DES_LIAISONS}
                niveau={2}
                libelle="Liaisons"
                detail={`${liaisons.length} liaison${liaisons.length > 1 ? "s" : ""}`}
                enfants={liaisons}
                {...commun}
              />
            )]
            : []),
        ]}
        {...commun}
      />
    </ul>
  );
}
