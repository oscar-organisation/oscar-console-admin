import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "./model";
import {
  ajouterProjet,
  chargerComposition,
  configurerPerimetre,
  rafraichir,
  supprimerProjet,
} from "./projectStore";
import { lireVersion, listerBundles, supprimerBundle } from "../feature-data/studioApi";

vi.mock("../feature-data/studioApi", () => ({
  listerBundles: vi.fn(), creerBundle: vi.fn(), enregistrerBrouillon: vi.fn(),
  lireVersion: vi.fn(), projetDepuisBundle: vi.fn(), supprimerBundle: vi.fn(),
}));

describe("isolation du cache Studio", () => {
  beforeEach(() => {
    configurerPerimetre(null, null);
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("sépare utilisateurs et organisations sans importer l'ancien cache", () => {
    const projet = createProject("Projet A", "", "ENVIRONNEMENT_EXECUTION_ROBOT", "VIDE");
    localStorage.setItem("oscar.studio.configuration.v1.projects", JSON.stringify([projet]));
    configurerPerimetre("u1", "a");
    ajouterProjet(projet);
    configurerPerimetre("u1", "b");
    ajouterProjet({ ...projet, id: "b", name: "Projet B" });
    configurerPerimetre("u2", "a");
    ajouterProjet({ ...projet, id: "c", name: "Projet C" });
    expect(JSON.parse(localStorage.getItem("oscar.studio.projects.v2:u1:a")!)).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem("oscar.studio.projects.v2:u1:b")!)[0].name).toBe("Projet B");
    expect(JSON.parse(localStorage.getItem("oscar.studio.projects.v2:u2:a")!)[0].name).toBe("Projet C");
  });

  it("ignore une réponse reçue après un changement d'organisation", async () => {
    let terminer!: (bundles: []) => void;
    vi.mocked(listerBundles).mockReturnValue(new Promise((resolve) => { terminer = resolve; }));
    configurerPerimetre("u1", "a");
    const requete = rafraichir();
    configurerPerimetre("u1", "b");
    terminer([]);
    await requete;
    expect(localStorage.getItem("oscar.studio.projects.v2:u1:b")).toBeNull();
  });

  it("supprime aussi le bundle serveur avant de retirer le projet du cache", async () => {
    vi.mocked(supprimerBundle).mockResolvedValue();
    configurerPerimetre("u1", "a");
    const projet = {
      ...createProject("Projet serveur", "", "ENVIRONNEMENT_EXECUTION_ROBOT", "VIDE"),
      id: "bundle-1",
      bundleId: "bundle-1",
    };
    ajouterProjet(projet);

    await supprimerProjet(projet);

    expect(supprimerBundle).toHaveBeenCalledWith("bundle-1");
    expect(JSON.parse(localStorage.getItem("oscar.studio.projects.v2:u1:a")!)).toEqual([]);
  });
});

/** Composant tel qu'il était enregistré avant le renommage « agent » -> « unité ». */
const noeudAncienFormat = {
  id: "instance_service-1",
  type: "architecture",
  position: { x: 480, y: 130 },
  data: {
    kind: "INSTANCE_SERVICE", name: "Service principal du robot", technicalCode: "INSTANCE_SERVICE_PRINCIPAL_ROBOT",
    description: "", target: "ENVIRONNEMENT_EXECUTION_ROBOT", status: "BROUILLON",
    agents: [{
      id: "agent-1a2b3c4d", name: "Module 1", technicalCode: "INSTANCE_AGENT_MODULE_1", agentType: "TYPE_AGENT_STANDARD",
      processingName: "TRAITEMENT_METIER_AGENT_PRINCIPAL", interfaceName: "INTERFACE_COMMUNICATION_AGENT_PRINCIPALE",
      dataBandName: "BANDE_DONNEES_PRINCIPALE", receiveBusName: "BUS_RECEPTION_PRINCIPAL", sendBusName: "BUS_EMISSION_PRINCIPAL",
      inputs: [], outputs: [], canPublishAudio: false, canPublishVideo: false, expanded: true,
    }],
  },
};

describe("projets enregistrés avant le renommage « agent » -> « unité »", () => {
  beforeEach(() => {
    configurerPerimetre(null, null);
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("relit un brouillon du navigateur au nouveau format, puis l'écrit ainsi", () => {
    const ancien = {
      ...createProject("Projet ancien", "", "ENVIRONNEMENT_EXECUTION_ROBOT", "VIDE"),
      id: "ancien",
      nodes: [noeudAncienFormat],
      summary: { composants: 1, agents: 1, robots: 0 },
    };
    localStorage.setItem("oscar.studio.projects.v2:u1:a", JSON.stringify([ancien]));
    configurerPerimetre("u1", "a");
    // Chaque enregistrement réécrit toute la liste : le projet ancien y repasse.
    ajouterProjet(createProject("Projet neuf", "", "ENVIRONNEMENT_EXECUTION_ROBOT", "VIDE"));

    const [, relu] = JSON.parse(localStorage.getItem("oscar.studio.projects.v2:u1:a")!);
    expect(relu.nodes[0].data.units[0]).toMatchObject({
      id: "agent-1a2b3c4d",
      technicalCode: "INSTANCE_UNITE_MODULE_1",
      unitType: "TYPE_UNITE_STANDARD",
    });
    expect(relu.summary).toEqual({ composants: 1, units: 1, robots: 0 });
    expect(JSON.stringify(relu)).not.toMatch(/"agents"|"agentType"|_AGENT/);
  });

  it("relit au nouveau format une composition que le serveur sert à l'ancien", async () => {
    vi.mocked(lireVersion).mockResolvedValue({
      id: "version-1", bundle_id: "bundle-1", numero: 1, statut: "draft",
      spec: { nodes: [noeudAncienFormat], edges: [] },
    } as never);
    configurerPerimetre("u1", "a");
    ajouterProjet({
      ...createProject("Projet serveur", "", "ENVIRONNEMENT_EXECUTION_ROBOT", "VIDE"),
      id: "bundle-1", bundleId: "bundle-1", draftVersionId: "version-1", nodes: [],
    });

    await chargerComposition("bundle-1");

    const [charge] = JSON.parse(localStorage.getItem("oscar.studio.projects.v2:u1:a")!);
    expect(lireVersion).toHaveBeenCalledWith("version-1");
    expect(charge.nodes[0].data.units[0].unitType).toBe("TYPE_UNITE_STANDARD");
    expect(JSON.stringify(charge)).not.toMatch(/"agents"|"agentType"|_AGENT/);
  });
});
