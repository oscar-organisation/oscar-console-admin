import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeError } from "@/shared/kernel/errors";
import { creerBundle, listerBundles, supprimerBundle, type BundleServeur } from "../feature-data/studioApi";
import { configurerPerimetre, creer, lireEtat, rafraichir, supprimer } from "./bundlesStore";

/**
 * La liste des bundles du nouveau Studio : le serveur seul fait foi
 * (conception du lot L1, parties 6.1 et 6.3).
 */

vi.mock("../feature-data/studioApi", () => ({
  listerBundles: vi.fn(),
  creerBundle: vi.fn(),
  archiverBundle: vi.fn(),
  supprimerBundle: vi.fn(),
}));

function bundle(id: string, nom: string): BundleServeur {
  return {
    id, org_id: "org-a", nom, slug: id, description: "", target: "ENVIRONNEMENT_EXECUTION_ROBOT", statut: "active",
    version_count: 0, robot_count: 0, component_count: 0, unit_count: 0,
    projet_id: "projet-a", format_brouillon: "oscar.bundle/1",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  configurerPerimetre(null, null);
  configurerPerimetre("u1", "org-a");
});

describe("la liste des bundles", () => {
  it("vient du serveur, jamais d'une copie du navigateur, et n'en écrit aucune", async () => {
    // Le cache de l'ancien Studio n'est ni lu ni effacé (question Q10 de la conception).
    localStorage.setItem("oscar.studio.projects.v2:u1:org-a", JSON.stringify([{ id: "local", name: "Local" }]));
    vi.mocked(listerBundles).mockResolvedValue([bundle("b1", "Téléopération du M3")]);
    await rafraichir();
    expect(lireEtat()).toMatchObject({ chargement: "PRET", erreur: null });
    expect(lireEtat().bundles.map((item) => item.id)).toEqual(["b1"]);
    const cles = Array.from({ length: localStorage.length }, (_vide, rang) => localStorage.key(rang));
    expect(cles).toEqual(["oscar.studio.projects.v2:u1:org-a"]);
  });

  it("une erreur de chargement garde sa cause et ne montre aucune liste", async () => {
    vi.mocked(listerBundles).mockResolvedValueOnce([bundle("b1", "Téléopération du M3")]);
    await rafraichir();
    vi.mocked(listerBundles).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await rafraichir();
    expect(lireEtat().chargement).toBe("ERREUR");
    expect(lireEtat().erreur).toMatch(/injoignable/);
    expect(lireEtat().bundles).toEqual([]);
  });

  it("créer envoie le point de départ et range le bundle en tête", async () => {
    vi.mocked(listerBundles).mockResolvedValue([bundle("b1", "Téléopération du M3")]);
    await rafraichir();
    vi.mocked(creerBundle).mockResolvedValue(bundle("b2", "Accueil en magasin"));
    const cree = await creer({ nom: "Accueil en magasin", description: "", depart: { sorte: "PRESET", slug: "m3-pro" } });
    expect(creerBundle).toHaveBeenCalledWith({
      nom: "Accueil en magasin", description: "", depart: { sorte: "PRESET", slug: "m3-pro" },
    });
    expect(cree.id).toBe("b2");
    expect(lireEtat().bundles.map((item) => item.id)).toEqual(["b2", "b1"]);
  });

  it("un bundle ne quitte la liste qu'une fois sa suppression confirmée", async () => {
    vi.mocked(listerBundles).mockResolvedValue([bundle("b1", "Téléopération du M3")]);
    await rafraichir();
    const premier = lireEtat().bundles[0];
    if (!premier) throw new Error("liste vide");
    vi.mocked(supprimerBundle).mockRejectedValueOnce(normalizeError({ status: 409, detail: "Déjà déployé" }));
    await expect(supprimer(premier)).rejects.toThrow("Déjà déployé");
    expect(lireEtat().bundles).toHaveLength(1);
    vi.mocked(supprimerBundle).mockResolvedValueOnce();
    await supprimer(premier);
    expect(lireEtat().bundles).toEqual([]);
  });

  it("une réponse reçue après un changement d'organisation est ignorée", async () => {
    let repondre!: (bundles: BundleServeur[]) => void;
    vi.mocked(listerBundles).mockReturnValueOnce(new Promise((resoudre) => { repondre = resoudre; }));
    const requete = rafraichir();
    configurerPerimetre("u1", "org-b");
    repondre([bundle("b1", "Téléopération du M3")]);
    await requete;
    expect(lireEtat()).toMatchObject({ bundles: [], chargement: "INACTIF" });
  });
});
