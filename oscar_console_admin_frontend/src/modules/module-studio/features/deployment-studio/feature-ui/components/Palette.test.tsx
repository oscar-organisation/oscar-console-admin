import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { catalogueDeTest } from "../../donnees-de-test";
import Palette from "./Palette";

/**
 * La palette (conception du lot L1, partie 6.6 ; recette R1.5) : les familles
 * de la formalisation (partie 2.8) dans leur ordre, les familles vides
 * masquées, une recherche qui ne tient compte ni des accents ni des majuscules.
 */

function afficher() {
  const onChoisir = vi.fn();
  render(<Palette catalogue={catalogueDeTest} onChoisir={onChoisir} onDebutDuGlissement={vi.fn()} onFinDuGlissement={vi.fn()} />);
  return { onChoisir };
}

const famillesAffichees = () => screen.queryAllByRole("heading", { level: 3 }).map((titre) => titre.textContent?.trim());
const cartes = () => screen.queryAllByRole("button").map((carte) => carte.getAttribute("aria-label"));
const chercher = (mot: string) => fireEvent.change(screen.getByRole("searchbox"), { target: { value: mot } });

describe("la palette", () => {
  it("affiche les familles dans l'ordre de la formalisation, et masque les vides", () => {
    afficher();
    // Appareils, messagerie, réseau, stockage et programmes existants n'ont encore aucune entrée en L1.
    expect(famillesAffichees()).toEqual(["Environnements", "Temps réel", "Services et applications"]);
    const environnements = screen.getByRole("region", { name: "Environnements" });
    // Les sept zones, dans l'ordre du catalogue ; la zone Externe n'est pas proposée avant L2.
    expect(within(environnements).getAllByRole("button").map((carte) => carte.getAttribute("aria-label"))).toEqual([
      "Zone robot", "Zone serveur", "Zone application web", "Zone ordinateur de bureau", "Zone appareil mobile",
      "Zone casque de réalité virtuelle", "Zone simulateur",
    ]);
    expect(within(screen.getByRole("region", { name: "Services et applications" })).getAllByRole("button")
      .map((carte) => carte.getAttribute("aria-label"))).toEqual([
      "Service", "Application", "Unité", "Bande de données", "Bus de réception", "Bus d'émission",
      "Canal de réception", "Canal d'émission",
    ]);
  });

  it("dit pour chaque carte à quoi elle sert, où elle se place, avec un exemple", () => {
    afficher();
    const service = screen.getByRole("button", { name: "Service" });
    expect(service).toHaveAccessibleDescription(
      "Un programme sans écran, dans une zone robot ou serveur, qui héberge des unités. Déposé, il arrive avec sa "
      + "première unité. Se place dans une zone d'environnement. Exemple : Le service actions du robot, qui commande la base.",
    );
    expect(screen.getByRole("button", { name: "Zone robot" })).toHaveAccessibleDescription(/Se place dans le bundle\./);
  });

  it("cherche dans le nom, la description, l'exemple et le code, sans accents ni majuscules", () => {
    afficher();
    chercher("serveur");
    expect(famillesAffichees()).toEqual(["Environnements", "Services et applications"]);
    expect(cartes()).toEqual(["Zone serveur", "Service"]);
    // « TÉLÉOPÉRATION » trouve « téléopération » dans les exemples.
    chercher("TÉLÉOPÉRATION");
    expect(cartes()).toEqual(["Zone application web", "Application"]);
    chercher("teleoperation");
    expect(cartes()).toEqual(["Zone application web", "Application"]);
    // Par le code, sans tenir compte des majuscules.
    chercher("bus_emission");
    expect(cartes()).toEqual(["Bus d'émission"]);
  });

  it("dit quand rien ne correspond", () => {
    afficher();
    chercher("hélicoptère");
    expect(famillesAffichees()).toEqual([]);
    expect(screen.getByRole("status")).toHaveTextContent("Aucun composant ne correspond à « hélicoptère ».");
  });

  it("un clic sur une carte demande à l'ajouter, sans choisir de parent à sa place", () => {
    const { onChoisir } = afficher();
    fireEvent.click(screen.getByRole("button", { name: "Zone serveur" }));
    expect(onChoisir).toHaveBeenCalledTimes(1);
    expect(onChoisir.mock.calls[0]?.[0]).toMatchObject({ code: "TYPE_ENVIRONNEMENT_EXECUTION_SERVEUR" });
  });
});
