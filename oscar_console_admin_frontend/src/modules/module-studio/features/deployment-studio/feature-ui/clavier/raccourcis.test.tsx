import { useRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { etatDeReference } from "../../donnees-de-test";
import { SELECTION_DU_BUNDLE } from "../selection";
import { PAS_DU_CLAVIER, useRaccourcis, voisin, type ActionDuClavier } from "./raccourcis";

/**
 * Le clavier du Studio (conception du lot L1, partie 6.5 ; recette R1.7) :
 * les mêmes touches dans le canevas et l'arborescence, annuler et rétablir
 * partout, et un champ de saisie qui garde ses touches.
 */

function Editeur({ agir }: { readonly agir: (action: ActionDuClavier) => void }) {
  const racine = useRef<HTMLDivElement>(null);
  useRaccourcis(racine, agir);
  return (
    <div ref={racine}>
      <div data-zone-clavier="canevas" tabIndex={0} aria-label="canevas"><button type="button">Zoomer</button></div>
      <ul data-zone-clavier="arbre" aria-label="arbre"><li tabIndex={0}>Robot M3 Pro</li></ul>
      <input aria-label="Nom" />
      <button type="button">Vérifier</button>
      <section role="dialog" aria-label="fenêtre"><button type="button">Choisir</button></section>
    </div>
  );
}

function afficher() {
  const agir = vi.fn();
  render(<Editeur agir={agir} />);
  const actions = () => agir.mock.calls.map(([action]) => action as ActionDuClavier);
  return { agir, actions };
}

describe("les raccourcis du Studio", () => {
  it("Ctrl+Z annule, Ctrl+Maj+Z et Ctrl+Y rétablissent, Cmd aussi, partout sauf dans un champ", () => {
    const { actions } = afficher();
    fireEvent.keyDown(screen.getByLabelText("canevas"), { key: "z", ctrlKey: true });
    fireEvent.keyDown(screen.getByLabelText("canevas"), { key: "Z", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(screen.getByText("Vérifier"), { key: "y", ctrlKey: true });
    fireEvent.keyDown(screen.getByText("Vérifier"), { key: "z", metaKey: true });
    expect(actions().map((action) => action.sorte)).toEqual(["annuler", "retablir", "retablir", "annuler"]);
  });

  it("Suppr ouvre la confirmation, A ouvre Ajouter, Entrée ouvre les propriétés, dans le canevas et l'arborescence", () => {
    const { actions } = afficher();
    fireEvent.keyDown(screen.getByLabelText("canevas"), { key: "Delete" });
    fireEvent.keyDown(screen.getByText("Robot M3 Pro"), { key: "a" });
    fireEvent.keyDown(screen.getByText("Robot M3 Pro"), { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("canevas"), { key: "Backspace" });
    expect(actions().map((action) => action.sorte)).toEqual(["supprimer", "ajouter", "ouvrir", "supprimer"]);
  });

  it("les flèches naviguent ; Maj+flèches déplacent le bloc de 8 px", () => {
    const { actions } = afficher();
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) fireEvent.keyDown(screen.getByLabelText("canevas"), { key });
    fireEvent.keyDown(screen.getByLabelText("canevas"), { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(screen.getByText("Robot M3 Pro"), { key: "ArrowUp", shiftKey: true });
    expect(actions()).toEqual([
      { sorte: "naviguer", direction: "precedent" },
      { sorte: "naviguer", direction: "suivant" },
      { sorte: "naviguer", direction: "parent" },
      { sorte: "naviguer", direction: "enfant" },
      { sorte: "deplacer", dx: PAS_DU_CLAVIER, dy: 0 },
      { sorte: "deplacer", dx: 0, dy: -PAS_DU_CLAVIER },
    ]);
  });

  it("Échap ferme puis libère, partout dans l'éditeur", () => {
    const { actions } = afficher();
    fireEvent.keyDown(screen.getByLabelText("canevas"), { key: "Escape" });
    fireEvent.keyDown(screen.getByText("Vérifier"), { key: "Escape" });
    expect(actions()).toEqual([{ sorte: "fermer" }, { sorte: "fermer" }]);
  });

  it("dans un champ, les touches saisissent ; hors du canevas et de l'arborescence, elles ne naviguent pas", () => {
    const { agir } = afficher();
    const champ = screen.getByLabelText("Nom");
    for (const touche of [{ key: "a" }, { key: "Delete" }, { key: "Enter" }, { key: "ArrowLeft" }, { key: "z", ctrlKey: true }, { key: "Escape" }]) {
      expect(fireEvent.keyDown(champ, touche)).toBe(true);
    }
    // Un bouton de la barre, ou posé dans le canevas : ni A, ni Suppr, ni flèches, et Entrée l'actionne.
    for (const key of ["a", "Delete", "ArrowDown", "Enter"]) fireEvent.keyDown(screen.getByText("Vérifier"), { key });
    for (const key of ["a", "Delete", "ArrowDown", "Enter"]) fireEvent.keyDown(screen.getByText("Zoomer"), { key });
    // Une fenêtre ouverte mène ses touches elle-même.
    fireEvent.keyDown(screen.getByText("Choisir"), { key: "Escape" });
    fireEvent.keyDown(screen.getByText("Choisir"), { key: "z", ctrlKey: true });
    expect(agir).not.toHaveBeenCalled();
  });
});

describe("la navigation au clavier", () => {
  const modele = etatDeReference().modele;
  const element = (id: string) => ({ sorte: "element", id }) as const;

  it("va au frère précédent ou suivant, au même niveau, sans tourner en rond", () => {
    expect(voisin(modele, element("svc-01"), "suivant")).toEqual(element("svc-02"));
    expect(voisin(modele, element("svc-02"), "precedent")).toEqual(element("svc-01"));
    expect(voisin(modele, element("svc-02"), "suivant")).toBeNull();
    // Au premier niveau : les zones et la salle, puis les liaisons.
    expect(voisin(modele, element("zon-01"), "suivant")).toEqual(element("sal-01"));
    expect(voisin(modele, element("zon-03"), "suivant")).toEqual({ sorte: "liaison", id: "lia-01" });
  });

  it("monte au parent, descend au premier enfant ; le bundle est au sommet", () => {
    expect(voisin(modele, element("uni-01"), "parent")).toEqual(element("svc-01"));
    expect(voisin(modele, element("zon-01"), "parent")).toEqual(SELECTION_DU_BUNDLE);
    expect(voisin(modele, { sorte: "liaison", id: "lia-01" }, "parent")).toEqual(SELECTION_DU_BUNDLE);
    expect(voisin(modele, SELECTION_DU_BUNDLE, "enfant")).toEqual(element("zon-01"));
    expect(voisin(modele, element("svc-01"), "enfant")).toEqual(element("uni-01"));
    expect(voisin(modele, element("can-01"), "enfant")).toBeNull();
    expect(voisin(modele, SELECTION_DU_BUNDLE, "parent")).toBeNull();
  });
});
