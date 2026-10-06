import { describe, expect, it } from "vitest";
import { catalogueDeTest, contexteDeTest, etatDeReference, etatVide } from "../../donnees-de-test";
import {
  canauxReliables,
  cheminDe,
  enfantsPermis,
  gesteDAjout,
  parentDuDepot,
  parentsPossibles,
  parentsQuiAcceptent,
  refusDUnAjout,
  refusDUneLiaison,
} from "./possibilites";
import { SORTES, type TypeDuCatalogue } from "./types";

/**
 * Ce que les écrans proposent, et où va un dépôt (conception du lot L1,
 * partie 4.2) : enfants permis seulement, parents compatibles seulement, et
 * le parent d'un dépôt lu sous le pointeur, jamais deviné.
 */

const contexte = contexteDeTest();
const codes = (types: readonly TypeDuCatalogue[]) => types.map((type) => type.code);
const typeDuCatalogue = (code: string): TypeDuCatalogue => {
  const type = catalogueDeTest.types.find((candidat) => candidat.code === code);
  if (!type) throw new Error(`type absent du catalogue de test : ${code}`);
  return type;
};
const ZONES_DE_LA_PALETTE = [
  "TYPE_ENVIRONNEMENT_EXECUTION_ROBOT", "TYPE_ENVIRONNEMENT_EXECUTION_SERVEUR",
  "TYPE_ENVIRONNEMENT_EXECUTION_NAVIGATEUR_WEB", "TYPE_ENVIRONNEMENT_EXECUTION_ORDINATEUR_BUREAU",
  "TYPE_ENVIRONNEMENT_EXECUTION_APPAREIL_MOBILE", "TYPE_ENVIRONNEMENT_EXECUTION_CASQUE_REALITE_VIRTUELLE",
  "TYPE_ENVIRONNEMENT_EXECUTION_SIMULATEUR",
];

describe("le menu « Ajouter »", () => {
  it("ne propose que les enfants permis, que les règles acceptent ici", () => {
    const vide = etatVide();
    const reference = etatDeReference();
    // Le bundle reçoit les zones ; la salle n'y est jamais proposée : elle naît avec la première zone.
    expect(codes(enfantsPermis(vide, null, catalogueDeTest, contexte))).toEqual(ZONES_DE_LA_PALETTE);
    expect(codes(enfantsPermis(reference, null, catalogueDeTest, contexte))).toEqual(ZONES_DE_LA_PALETTE);
    // Une zone robot reçoit des services, une zone application web des applications.
    expect(codes(enfantsPermis(reference, "zon-01", catalogueDeTest, contexte))).toEqual(["TYPE_SERVICE_GENERIQUE"]);
    expect(codes(enfantsPermis(reference, "zon-03", catalogueDeTest, contexte))).toEqual(["TYPE_APPLICATION_GENERIQUE"]);
    expect(codes(enfantsPermis(reference, "svc-01", catalogueDeTest, contexte))).toEqual(["TYPE_UNITE_STANDARD"]);
    // Le traitement et l'interface naissent avec l'unité : rien à y ajouter à la main.
    expect(codes(enfantsPermis(reference, "uni-01", catalogueDeTest, contexte))).toEqual([]);
    expect(codes(enfantsPermis(reference, "itf-01", catalogueDeTest, contexte))).toEqual(["BANDE_DONNEES"]);
    expect(codes(enfantsPermis(reference, "bnd-01", catalogueDeTest, contexte))).toEqual(["BUS_RECEPTION", "BUS_EMISSION"]);
    expect(codes(enfantsPermis(reference, "bre-01", catalogueDeTest, contexte))).toEqual(["CANAL_RECEPTION"]);
    expect(codes(enfantsPermis(reference, "can-01", catalogueDeTest, contexte))).toEqual([]);
    expect(enfantsPermis(reference, "inconnu", catalogueDeTest, contexte)).toEqual([]);
  });

  it("dit pourquoi un type refusé ne va pas ici, avec la règle du modèle", () => {
    const reference = etatDeReference();
    const application = refusDUnAjout(reference, typeDuCatalogue("TYPE_APPLICATION_GENERIQUE"), "zon-01", contexte);
    expect(application?.code).toBe("ZONE_INCOMPATIBLE");
    expect(application?.parentsCompatibles).toEqual(["zon-03"]);
    expect(refusDUnAjout(reference, typeDuCatalogue("COMPOSANT_SALLE_TEMPS_REEL"), null, contexte)?.code)
      .toBe("SALLE_EN_DOUBLE");
    expect(refusDUnAjout(etatVide(), typeDuCatalogue("COMPOSANT_SALLE_TEMPS_REEL"), null, contexte)?.code)
      .toBe("SALLE_SANS_ZONE");
    expect(refusDUnAjout(reference, typeDuCatalogue("TYPE_SERVICE_GENERIQUE"), "zon-02", contexte)).toBeNull();
  });

  it("un type sans type cité au modèle (bande, bus, canal) s'ajoute par sa sorte seule", () => {
    expect(gesteDAjout(typeDuCatalogue("CANAL_RECEPTION"), "bre-01")).toEqual({
      operation: "ajouter", sorte: SORTES.CANAL_RECEPTION, parent: "bre-01",
    });
    expect(gesteDAjout(typeDuCatalogue("TYPE_ENVIRONNEMENT_EXECUTION_ROBOT"), null, { x: 10, y: 20 })).toEqual({
      operation: "ajouter", sorte: SORTES.ZONE, type: { code: "TYPE_ENVIRONNEMENT_EXECUTION_ROBOT", version: "1.0.0" },
      parent: null, position: { x: 10, y: 20 },
    });
  });
});

describe("pendant un glissement depuis la palette", () => {
  it("seuls les parents qui accepteraient l'objet s'éclairent", () => {
    const reference = etatDeReference();
    const qui = (code: string) => parentsQuiAcceptent(reference, typeDuCatalogue(code), contexte);
    expect(qui("TYPE_SERVICE_GENERIQUE")).toEqual(["zon-01", "zon-02"]);
    expect(qui("TYPE_APPLICATION_GENERIQUE")).toEqual(["zon-03"]);
    expect(qui("TYPE_ENVIRONNEMENT_EXECUTION_ROBOT")).toEqual([null]);
    expect(qui("TYPE_UNITE_STANDARD")).toEqual(["svc-01", "svc-02", "app-01"]);
    expect(qui("CANAL_EMISSION")).toEqual(["bem-01", "bem-03", "bem-02"]);
    // La salle existe déjà : aucun parent ne l'accepte, le dépôt sera refusé avec sa raison.
    expect(qui("COMPOSANT_SALLE_TEMPS_REEL")).toEqual([]);
    expect(parentsQuiAcceptent(etatVide(), typeDuCatalogue("TYPE_SERVICE_GENERIQUE"), contexte)).toEqual([]);
  });
});

describe("changer de parent", () => {
  it("ne propose que les parents qui acceptent l'élément", () => {
    const reference = etatDeReference();
    const ids = (id: string) => parentsPossibles(reference, id, contexte).map((element) => element.id);
    // Un service va dans une autre zone qui reçoit des services ; jamais dans la zone web.
    expect(ids("svc-02")).toEqual(["zon-02"]);
    // L'application n'a qu'une zone web : elle n'a nulle part où aller.
    expect(ids("app-01")).toEqual([]);
    // Une unité va dans un autre service ou une application.
    expect(ids("uni-01")).toEqual(["svc-02", "app-01"]);
    // Un canal de réception va dans un autre bus de réception, jamais dans un bus d'émission.
    expect(ids("can-01")).toEqual(["bre-03", "bre-02"]);
    // Une zone, la salle, la structure d'une unité ne changent pas de parent.
    expect(ids("zon-01")).toEqual([]);
    expect(ids("sal-01")).toEqual([]);
    expect(ids("bnd-01")).toEqual([]);
  });
});

describe("tirer une liaison", () => {
  it("depuis une sortie, seules les entrées s'éclairent ; depuis une entrée, seules les sorties", () => {
    const reference = etatDeReference();
    expect([...canauxReliables(reference, "can-02", contexte)]).toEqual(["can-01"]);
    expect([...canauxReliables(reference, "can-01", contexte)]).toEqual(["can-02"]);
    expect([...canauxReliables(reference, "uni-01", contexte)]).toEqual([]);
    // Une liaison à l'envers est refusée, avec la raison du modèle.
    expect(refusDUneLiaison(reference, "can-01", "can-02", contexte)?.code).toBe("LIAISON_SENS_INVERSE");
    expect(refusDUneLiaison(reference, "can-02", "can-01", contexte)).toBeNull();
  });
});

describe("le parent d'un dépôt", () => {
  const modele = etatDeReference().modele;

  it("est celui qui est sous le pointeur, jamais le premier trouvé dans la liste", () => {
    // Un service lâché sur le service média va dans sa zone, le robot.
    expect(parentDuDepot(["svc-02", "zon-01", null], SORTES.SERVICE, modele)).toBe("zon-01");
    // Lâché sur l'application, il vise la zone web, même si la zone robot vient avant dans la liste :
    // c'est la règle qui le refusera, avec sa raison.
    expect(parentDuDepot(["app-01", "zon-03", null], SORTES.SERVICE, modele)).toBe("zon-03");
    // Une unité lâchée sur une autre unité va dans leur service.
    expect(parentDuDepot(["uni-01", "svc-01", "zon-01", null], SORTES.UNITE, modele)).toBe("svc-01");
    // Un canal de réception lâché dans la colonne des sorties vise le bus d'émission : refusé ensuite.
    expect(parentDuDepot(["bem-01", "uni-01", "svc-01", "zon-01", null], SORTES.CANAL_RECEPTION, modele)).toBe("bem-01");
    expect(parentDuDepot(["bre-01", "uni-01", "svc-01", "zon-01", null], SORTES.CANAL_RECEPTION, modele)).toBe("bre-01");
  });

  it("hors de toute zone, un service vise le bundle, et une zone va toujours dans le bundle", () => {
    expect(parentDuDepot([null], SORTES.SERVICE, modele)).toBeNull();
    expect(parentDuDepot([], SORTES.SERVICE, modele)).toBeNull();
    expect(parentDuDepot(["zon-02", null], SORTES.ZONE, modele)).toBeNull();
    // Une unité lâchée dans une zone, hors d'un composant, vise la zone : la règle dira où la mettre.
    expect(parentDuDepot(["zon-02", null], SORTES.UNITE, modele)).toBe("zon-02");
  });
});

describe("le chemin d'un élément", () => {
  it("va du bundle jusqu'à lui, avec les noms affichés", () => {
    const modele = etatDeReference().modele;
    expect(cheminDe(modele, "can-01")).toEqual([
      "Téléopération du M3", "Robot M3 Pro", "Service actions du robot", "Commande de la base",
      "Interface de communication", "Bande principale", "Réception", "Commande de la base",
    ]);
    expect(cheminDe(modele, "zon-02")).toEqual(["Téléopération du M3", "Serveur de traitement"]);
  });
});
