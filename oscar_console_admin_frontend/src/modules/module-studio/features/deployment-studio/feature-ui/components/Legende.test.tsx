import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { catalogueDeTest } from "../../donnees-de-test";
import Legende from "./Legende";

/**
 * La légende du canevas (étape I7) : repliée par défaut, pour ne jamais
 * couvrir un bloc ; un bouton discret l'ouvre, et le choix se garde.
 */

const CLE = "oscar.studio.affichage.v1:legende";
const familles = catalogueDeTest.familles.filter((famille) => famille.code === "FAMILLE_PALETTE_ENVIRONNEMENTS");
const bascule = () => screen.getByRole("button", { name: /Légende/ });

describe("la légende", () => {
  beforeEach(() => window.localStorage.removeItem(CLE));
  afterEach(() => window.localStorage.removeItem(CLE));

  it("est repliée par défaut : seul son bouton se voit", () => {
    render(<Legende familles={familles} />);
    expect(bascule()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Entrée : point creux, à gauche")).toBeNull();
  });

  it("s'ouvre d'un clic, et reste ouverte à la visite suivante", () => {
    const { unmount } = render(<Legende familles={familles} />);
    fireEvent.click(bascule());
    expect(bascule()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Entrée : point creux, à gauche")).toBeInTheDocument();
    unmount();
    render(<Legende familles={familles} />);
    expect(bascule()).toHaveAttribute("aria-expanded", "true");
  });

  it("repliée par la personne, elle le reste", () => {
    window.localStorage.setItem(CLE, "ouverte");
    const { unmount } = render(<Legende familles={familles} />);
    fireEvent.click(bascule());
    unmount();
    render(<Legende familles={familles} />);
    expect(bascule()).toHaveAttribute("aria-expanded", "false");
  });
});
