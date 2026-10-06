import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeError } from "@/shared/kernel/errors";
import { brouillonDeReference, catalogueDeTest, type BrouillonDeTest } from "../donnees-de-test";
import { enregistrerBrouillon, lireBrouillon, lireCatalogue, verifierBrouillon, type BrouillonServeur } from "../feature-data/studioApi";
import {
  abandonnerLaCopieLocale,
  annuler,
  configurerPerimetre,
  jouer,
  lireEtat,
  ouvrir,
  ouvrirLaVersionDuServeur,
  reessayer,
  remplacerLaVersionDuServeur,
  reprendreLaCopieLocale,
  verifier,
} from "./brouillonStore";

/**
 * Le brouillon ouvert dans l'éditeur : enregistré par révision entière, un
 * conflit montré sans rien écraser, une copie locale proposée à la reprise et
 * jamais imposée (conception du lot L1, partie 6.3 ; recettes R1.1 et R1.6).
 * L'API est simulée ; les minuteries sont celles de Vitest, qu'on avance à la main.
 */

vi.mock("../feature-data/studioApi", () => ({
  lireCatalogue: vi.fn(),
  lireBrouillon: vi.fn(),
  enregistrerBrouillon: vi.fn(),
  verifierBrouillon: vi.fn(),
}));

const BUNDLE = "bundle-reference";
const CLE_DE_LA_COPIE = `oscar.studio.brouillon-local.v1:u1:org-a:${BUNDLE}`;

function brouillonDuServeur(revision: number, modifie?: Partial<BrouillonDeTest>): BrouillonServeur {
  return { ...structuredCloneJson(brouillonDeReference), revision, ...modifie } as unknown as BrouillonServeur;
}

function structuredCloneJson<T>(valeur: T): T {
  return JSON.parse(JSON.stringify(valeur)) as T;
}

function enregistre(revision: number) {
  return { revision, etat: "ETAT_BROUILLON_BUNDLE_EN_EDITION", empreinte_modele: `empreinte-${revision}`, modifie_le: null };
}

function present() {
  const historique = lireEtat().historique;
  if (!historique) throw new Error("aucun brouillon ouvert");
  return historique.present;
}

function lireLaCopie() {
  const texte = localStorage.getItem(CLE_DE_LA_COPIE);
  return texte ? JSON.parse(texte) : null;
}

/** Une copie locale, telle que l'éditeur l'aurait laissée : la zone robot renommée. */
function copieLocale(revisionDeBase: number) {
  const modele = structuredCloneJson(brouillonDeReference.modele) as unknown as { elements: { id: string; nom?: string }[] };
  const zone = modele.elements.find((element) => element.id === "zon-01");
  if (zone) zone.nom = "Robot renommé sur ce poste";
  return {
    revision_de_base: revisionDeBase,
    modele,
    mise_en_page: brouillonDeReference.mise_en_page,
    ecrit_le: "2026-10-06T00:30:00.000Z",
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  configurerPerimetre(null, null);
  configurerPerimetre("u1", "org-a");
  vi.mocked(lireCatalogue).mockResolvedValue(catalogueDeTest);
  vi.mocked(lireBrouillon).mockResolvedValue(brouillonDuServeur(3));
});

afterEach(() => {
  configurerPerimetre(null, null);
  vi.useRealTimers();
});

describe("l'enregistrement", () => {
  it("l'enregistrement envoie la révision attendue", async () => {
    await ouvrir(BUNDLE);
    expect(lireEtat()).toMatchObject({ chargement: "PRET", revision: 3, enregistrement: "ENREGISTRE" });
    vi.mocked(enregistrerBrouillon).mockResolvedValueOnce(enregistre(4)).mockResolvedValueOnce(enregistre(5));

    // Deux gestes rapprochés : un seul envoi, 1,2 s après le dernier.
    jouer({ operation: "placer", id: "zon-01", position: { x: 60, y: 140 } });
    await vi.advanceTimersByTimeAsync(600);
    jouer({ operation: "regler", id: "zon-01", champs: { nom: "Robot de l'accueil" } });
    expect(lireEtat().enregistrement).toBe("MODIFIE");
    expect(lireLaCopie()).toMatchObject({ revision_de_base: 3 });
    await vi.advanceTimersByTimeAsync(1199);
    expect(enregistrerBrouillon).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(enregistrerBrouillon).toHaveBeenCalledTimes(1);
    expect(enregistrerBrouillon).toHaveBeenCalledWith(BUNDLE, {
      modele: present().modele,
      miseEnPage: present().miseEnPage,
      revisionAttendue: 3,
    });
    expect(present().miseEnPage.blocs["zon-01"]).toEqual({ x: 60, y: 140 });
    expect(lireEtat()).toMatchObject({ revision: 4, enregistrement: "ENREGISTRE" });
    // Le serveur a confirmé le même contenu : la copie de secours ne sert plus.
    expect(lireLaCopie()).toBeNull();

    // Le geste suivant part de la révision que le serveur vient de donner.
    jouer({ operation: "delier", liaison: "lia-01" });
    await vi.advanceTimersByTimeAsync(1200);
    expect(vi.mocked(enregistrerBrouillon).mock.calls[1]?.[1]).toMatchObject({ revisionAttendue: 4 });
    expect(lireEtat().revision).toBe(5);
  });

  it("un geste fait pendant un envoi part ensuite, de la révision suivante", async () => {
    await ouvrir(BUNDLE);
    let repondre!: (valeur: ReturnType<typeof enregistre>) => void;
    vi.mocked(enregistrerBrouillon)
      .mockReturnValueOnce(new Promise((resoudre) => { repondre = resoudre; }))
      .mockResolvedValueOnce(enregistre(5));
    jouer({ operation: "placer", id: "zon-01", position: { x: 60, y: 140 } });
    await vi.advanceTimersByTimeAsync(1200);
    expect(lireEtat().enregistrement).toBe("EN_COURS");
    jouer({ operation: "placer", id: "zon-02", position: { x: 60, y: 700 } });
    await vi.advanceTimersByTimeAsync(1200);
    // Un seul envoi à la fois : le second attend la réponse du premier.
    expect(enregistrerBrouillon).toHaveBeenCalledTimes(1);
    repondre(enregistre(4));
    await vi.advanceTimersByTimeAsync(0);
    expect(lireEtat()).toMatchObject({ revision: 4, enregistrement: "MODIFIE" });
    await vi.advanceTimersByTimeAsync(1200);
    expect(vi.mocked(enregistrerBrouillon).mock.calls[1]?.[1]).toMatchObject({ revisionAttendue: 4 });
    expect(lireEtat()).toMatchObject({ revision: 5, enregistrement: "ENREGISTRE" });
  });

  it("un conflit passe à l'état Conflit et n'écrase rien", async () => {
    await ouvrir(BUNDLE);
    const message = "Ce brouillon a été modifié depuis un autre poste (révision 5). Rechargez-le pour voir ces "
      + "changements ; vos modifications restent proposées à côté.";
    vi.mocked(enregistrerBrouillon).mockRejectedValue(normalizeError({ status: 409, detail: message }));
    jouer({ operation: "placer", id: "zon-01", position: { x: 60, y: 140 } });
    await vi.advanceTimersByTimeAsync(1200);
    expect(lireEtat()).toMatchObject({ enregistrement: "CONFLIT", messageDEnregistrement: message });

    // Les gestes continuent, gardés à l'écran et dans la copie locale, mais rien ne part.
    jouer({ operation: "regler", id: "zon-01", champs: { nom: "Robot de l'accueil" } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(enregistrerBrouillon).toHaveBeenCalledTimes(1);
    expect(lireEtat().enregistrement).toBe("CONFLIT");
    expect(present().modele.elements.find((e) => e.id === "zon-01")?.nom).toBe("Robot de l'accueil");
    expect(lireLaCopie()).toMatchObject({ revision_de_base: 3 });
  });

  it("après un conflit, la personne choisit : sa version, avec la révision du serveur, ou celle du serveur", async () => {
    await ouvrir(BUNDLE);
    vi.mocked(enregistrerBrouillon).mockRejectedValueOnce(normalizeError({ status: 409, detail: "Conflit" }));
    jouer({ operation: "placer", id: "zon-01", position: { x: 60, y: 140 } });
    await vi.advanceTimersByTimeAsync(1200);
    expect(lireEtat().enregistrement).toBe("CONFLIT");

    // « Remplacer la version du serveur par la mienne » : un choix explicite.
    vi.mocked(lireBrouillon).mockResolvedValueOnce(brouillonDuServeur(5));
    vi.mocked(enregistrerBrouillon).mockResolvedValueOnce(enregistre(6));
    await remplacerLaVersionDuServeur();
    expect(vi.mocked(enregistrerBrouillon).mock.calls[1]?.[1]).toMatchObject({ revisionAttendue: 5 });
    expect(lireEtat()).toMatchObject({ revision: 6, enregistrement: "ENREGISTRE" });

    // « Ouvrir la version du serveur » : l'historique repart à vide.
    vi.mocked(lireBrouillon).mockResolvedValueOnce(brouillonDuServeur(7));
    await ouvrirLaVersionDuServeur();
    expect(lireEtat()).toMatchObject({ revision: 7, enregistrement: "ENREGISTRE" });
    expect(lireEtat().historique?.passe).toHaveLength(0);
  });

  it("un refus du serveur garde sa raison et ne se relance pas seul", async () => {
    await ouvrir(BUNDLE);
    const raison = "Une zone se place directement dans le bundle, jamais dans une autre zone.";
    vi.mocked(enregistrerBrouillon).mockRejectedValue(normalizeError({ status: 422, detail: raison }));
    jouer({ operation: "placer", id: "zon-01", position: { x: 60, y: 140 } });
    await vi.advanceTimersByTimeAsync(1200);
    expect(lireEtat()).toMatchObject({ enregistrement: "REFUSE", messageDEnregistrement: raison, prochainEssaiDans: null });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(enregistrerBrouillon).toHaveBeenCalledTimes(1);
  });

  it("un échec réseau donne un nouvel essai, puis Réessayer", async () => {
    await ouvrir(BUNDLE);
    vi.mocked(enregistrerBrouillon).mockRejectedValue(new TypeError("Failed to fetch"));
    jouer({ operation: "placer", id: "zon-01", position: { x: 60, y: 140 } });
    await vi.advanceTimersByTimeAsync(1200);
    expect(lireEtat()).toMatchObject({ enregistrement: "ECHEC", prochainEssaiDans: 5 });
    expect(lireEtat().messageDEnregistrement).toMatch(/injoignable/);
    // Rien n'est présenté comme enregistré ; la copie locale garde le geste.
    expect(lireLaCopie()).toMatchObject({ revision_de_base: 3 });

    await vi.advanceTimersByTimeAsync(5000);
    expect(enregistrerBrouillon).toHaveBeenCalledTimes(2);
    expect(lireEtat().prochainEssaiDans).toBe(15);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(enregistrerBrouillon).toHaveBeenCalledTimes(3);
    expect(lireEtat().prochainEssaiDans).toBe(30);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(enregistrerBrouillon).toHaveBeenCalledTimes(4);
    // Après trois nouveaux essais, plus rien d'automatique : « Réessayer ».
    expect(lireEtat()).toMatchObject({ enregistrement: "ECHEC", prochainEssaiDans: null });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(enregistrerBrouillon).toHaveBeenCalledTimes(4);

    vi.mocked(enregistrerBrouillon).mockResolvedValueOnce(enregistre(4));
    await reessayer();
    expect(enregistrerBrouillon).toHaveBeenCalledTimes(5);
    expect(lireEtat()).toMatchObject({ enregistrement: "ENREGISTRE", revision: 4 });
    expect(lireLaCopie()).toBeNull();
  });
});

describe("la vérification", () => {
  const PROBLEMES = {
    revision: 4,
    problemes: [{ niveau: "AVERTISSEMENT" as const, code: "SERVICE_SANS_UNITE", titre: "Service sans unité",
      explication: "Le service média n'a pas d'unité.", correction: "Ajoutez-lui une unité.", element: "svc-02" }],
    erreurs: 0,
    avertissements: 1,
  };

  it("vérifier enregistre d'abord ce qui attend, puis lit les problèmes du serveur, sans rien écrire d'autre", async () => {
    await ouvrir(BUNDLE);
    vi.mocked(enregistrerBrouillon).mockResolvedValueOnce(enregistre(4));
    vi.mocked(verifierBrouillon).mockResolvedValueOnce(PROBLEMES);
    jouer({ operation: "regler", id: "zon-01", champs: { nom: "Robot de l'accueil" } });
    expect(lireEtat().enregistrement).toBe("MODIFIE");
    // Sans attendre le délai : ce qu'on vérifie, c'est ce qu'on voit.
    await verifier();
    expect(enregistrerBrouillon).toHaveBeenCalledTimes(1);
    expect(vi.mocked(enregistrerBrouillon).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(verifierBrouillon).mock.invocationCallOrder[0] ?? 0);
    expect(verifierBrouillon).toHaveBeenCalledWith(BUNDLE);
    expect(lireEtat()).toMatchObject({ verification: PROBLEMES, verificationPerimee: false, verificationEnCours: false, enregistrement: "ENREGISTRE" });
    // Plus rien ne part ensuite : le délai d'enregistrement n'a pas laissé d'envoi en attente.
    await vi.advanceTimersByTimeAsync(5000);
    expect(enregistrerBrouillon).toHaveBeenCalledTimes(1);
    // Un geste après la vérification la rend périmée.
    jouer({ operation: "placer", id: "zon-01", position: { x: 60, y: 140 } });
    expect(lireEtat().verificationPerimee).toBe(true);
  });

  it("un brouillon jamais enregistré ne s'écrit pas pour être vérifié : l'écran le dit", async () => {
    vi.mocked(lireBrouillon).mockResolvedValue(brouillonDuServeur(0));
    await ouvrir(BUNDLE);
    await verifier();
    expect(enregistrerBrouillon).not.toHaveBeenCalled();
    expect(verifierBrouillon).not.toHaveBeenCalled();
    expect(lireEtat().messageDeVerification).toContain("pas encore enregistré");
  });
});

describe("la copie locale", () => {
  it("une copie locale est proposée à la reprise, jamais appliquée seule", async () => {
    localStorage.setItem(CLE_DE_LA_COPIE, JSON.stringify(copieLocale(3)));
    await ouvrir(BUNDLE);
    // Le serveur s'ouvre ; la copie est seulement proposée.
    expect(lireEtat().propositionDeReprise).toMatchObject({ sorte: "MEME_REVISION", copie: copieLocale(3) });
    expect(present().modele).toEqual(brouillonDeReference.modele);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(enregistrerBrouillon).not.toHaveBeenCalled();

    // « Les reprendre » : elle devient l'état courant, s'enregistre normalement, et s'annule comme un geste.
    vi.mocked(enregistrerBrouillon).mockResolvedValue(enregistre(4));
    reprendreLaCopieLocale();
    expect(lireEtat().propositionDeReprise).toBeNull();
    expect(present().modele).toEqual(copieLocale(3).modele);
    await vi.advanceTimersByTimeAsync(1200);
    expect(enregistrerBrouillon).toHaveBeenCalledWith(BUNDLE, expect.objectContaining({
      modele: copieLocale(3).modele, revisionAttendue: 3,
    }));
    annuler();
    expect(present().modele).toEqual(brouillonDeReference.modele);
  });

  it("une copie locale ne prime jamais sur le serveur", async () => {
    // Partie d'une révision dépassée : le serveur a changé depuis.
    localStorage.setItem(CLE_DE_LA_COPIE, JSON.stringify(copieLocale(2)));
    await ouvrir(BUNDLE);
    expect(lireEtat().propositionDeReprise).toMatchObject({ sorte: "REVISION_DEPASSEE", revisionDuServeur: 3 });
    expect(present().modele).toEqual(brouillonDeReference.modele);
    // « Les reprendre » ne vaut que pour une copie de la même révision : rien ne fusionne seul.
    reprendreLaCopieLocale();
    expect(present().modele).toEqual(brouillonDeReference.modele);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(enregistrerBrouillon).not.toHaveBeenCalled();
    // « Ouvrir la version du serveur » : la copie est effacée.
    abandonnerLaCopieLocale();
    expect(lireLaCopie()).toBeNull();
    expect(lireEtat().propositionDeReprise).toBeNull();
  });

  it("une copie identique au serveur ne se propose pas, et s'efface", async () => {
    localStorage.setItem(CLE_DE_LA_COPIE, JSON.stringify({
      revision_de_base: 2, modele: brouillonDeReference.modele, mise_en_page: brouillonDeReference.mise_en_page,
      ecrit_le: "2026-10-06T00:30:00.000Z",
    }));
    await ouvrir(BUNDLE);
    expect(lireEtat().propositionDeReprise).toBeNull();
    expect(lireLaCopie()).toBeNull();
  });

  it("la copie d'une organisation ne se propose pas dans une autre", async () => {
    localStorage.setItem(CLE_DE_LA_COPIE, JSON.stringify(copieLocale(3)));
    configurerPerimetre("u1", "org-b");
    await ouvrir(BUNDLE);
    expect(lireEtat().propositionDeReprise).toBeNull();
    expect(lireLaCopie()).toEqual(copieLocale(3));
  });
});

describe("le périmètre", () => {
  it("une réponse reçue après un changement d'organisation est ignorée", async () => {
    let repondre!: (brouillon: BrouillonServeur) => void;
    vi.mocked(lireBrouillon).mockReturnValueOnce(new Promise((resoudre) => { repondre = resoudre; }));
    const ouverture = ouvrir(BUNDLE);
    configurerPerimetre("u1", "org-b");
    repondre(brouillonDuServeur(3));
    await ouverture;
    expect(lireEtat()).toMatchObject({ bundleId: null, chargement: "INACTIF", historique: null });
  });

  it("un enregistrement qui revient après un changement d'organisation est ignoré", async () => {
    await ouvrir(BUNDLE);
    let repondre!: (valeur: ReturnType<typeof enregistre>) => void;
    vi.mocked(enregistrerBrouillon).mockReturnValueOnce(new Promise((resoudre) => { repondre = resoudre; }));
    jouer({ operation: "placer", id: "zon-01", position: { x: 60, y: 140 } });
    await vi.advanceTimersByTimeAsync(1200);
    configurerPerimetre("u1", "org-b");
    repondre(enregistre(4));
    await vi.advanceTimersByTimeAsync(0);
    expect(lireEtat()).toMatchObject({ bundleId: null, revision: 0 });
    // La copie de l'organisation d'avant reste là où elle était, pour sa propre reprise.
    expect(lireLaCopie()).toMatchObject({ revision_de_base: 3 });
  });

  it("une erreur de chargement garde sa cause", async () => {
    vi.mocked(lireBrouillon).mockRejectedValueOnce(normalizeError({ status: 404, detail: "Bundle introuvable" }));
    await ouvrir(BUNDLE);
    expect(lireEtat()).toMatchObject({ chargement: "ERREUR", erreurDeChargement: "Bundle introuvable", historique: null });
  });
});
