import { beforeEach, describe, expect, it } from "vitest";
import {
  contexteDeTest,
  etatDeReference,
  etatVide,
  figer,
} from "../../donnees-de-test";
import { codeDepuisNom } from "./identifiants";
import { appliquerGeste, consequencesDUneSuppression, type Geste, type ResultatDUnGeste } from "./operations";
import { verifierModele } from "./regles";
import { EXIGENCE_FACULTATIVE, SORTES, type EtatStudio } from "./types";

/**
 * La bibliothèque des opérations : chaque geste du Studio, ses refus, et ce
 * qu'il crée ou retire avec lui (conception du lot L1, parties 3.4 et 4.2).
 * Les états de départ sont figés : un geste qui les modifierait au lieu d'en
 * fabriquer un nouveau ferait échouer le test.
 */

const ZONE_ROBOT = { code: "TYPE_ENVIRONNEMENT_EXECUTION_ROBOT", version: "1.0.0" };
const ZONE_WEB = { code: "TYPE_ENVIRONNEMENT_EXECUTION_NAVIGATEUR_WEB", version: "1.0.0" };
const SERVICE = { code: "TYPE_SERVICE_GENERIQUE", version: "1.0.0" };
const SALLE = { code: "COMPOSANT_SALLE_TEMPS_REEL", version: "1.0.0" };

/**
 * Les gestes d'un test partagent une même fabrique d'identifiants, comme ceux
 * d'une page : « nouv-1 », « nouv-2 »... dans l'ordre de leur création.
 */
let contexte = contexteDeTest();
beforeEach(() => {
  contexte = contexteDeTest();
});

function jouer(etat: EtatStudio, geste: Geste): ResultatDUnGeste {
  return appliquerGeste(etat, geste, contexte);
}

function accepte(resultat: ResultatDUnGeste): EtatStudio {
  if (!resultat.accepte) throw new Error(`geste refusé : ${resultat.refus.code} ${resultat.refus.message}`);
  return resultat.etat;
}

function element(etat: EtatStudio, id: string) {
  return etat.modele.elements.find((candidat) => candidat.id === id);
}

describe("ajouter", () => {
  it("ajouter la première zone pose la salle, en un seul geste", () => {
    const resultat = jouer(etatVide(), {
      operation: "ajouter", sorte: SORTES.ZONE, type: ZONE_ROBOT, parent: null, position: { x: 40, y: 120 },
    });
    const etat = accepte(resultat);
    expect(etat.modele.elements.map((e) => [e.id, e.sorte, e.parent])).toEqual([
      ["nouv-1", SORTES.ZONE, null],
      ["nouv-2", SORTES.SALLE, null],
    ]);
    expect(element(etat, "nouv-1")).toMatchObject({
      code: "ZONE_ENVIRONNEMENT_EXECUTION_ROBOT", nom: "Robot", type: ZONE_ROBOT,
      reglages: { exigence: "EXIGENCE_ACTIVATION_ENVIRONNEMENT_OBLIGATOIRE" },
    });
    expect(element(etat, "nouv-2")).toEqual({
      id: "nouv-2", sorte: SORTES.SALLE, parent: null, code: "COMPOSANT_SALLE_TEMPS_REEL",
      nom: "Salle temps réel", type: SALLE,
    });
    expect(etat.miseEnPage.blocs).toEqual({ "nouv-1": { x: 40, y: 120 } });
    if (resultat.accepte) expect(resultat.changements.ajoutes).toEqual(["nouv-1", "nouv-2"]);
    expect(verifierModele(etat.modele, contexteDeTest().catalogue)).toEqual([]);

    // La deuxième zone ne pose pas de seconde salle.
    const deux = accepte(jouer(etat, { operation: "ajouter", sorte: SORTES.ZONE, type: ZONE_WEB, parent: null }));
    expect(deux.modele.elements.filter((e) => e.sorte === SORTES.SALLE)).toHaveLength(1);
  });

  it("un service arrive avec sa première unité et toute sa structure, en un seul geste", () => {
    const depart = accepte(jouer(etatVide(), { operation: "ajouter", sorte: SORTES.ZONE, type: ZONE_ROBOT, parent: null }));
    const etat = accepte(jouer(depart, {
      operation: "ajouter", sorte: SORTES.SERVICE, type: SERVICE, parent: "nouv-1",
      valeurs: { nom: "Actions du robot" },
    }));
    const nouveaux = etat.modele.elements.slice(depart.modele.elements.length);
    expect(nouveaux.map((e) => [e.sorte, e.code, e.nom])).toEqual([
      [SORTES.SERVICE, "INSTANCE_SERVICE_CONFIGUREE_ACTIONS_DU_ROBOT", "Actions du robot"],
      [SORTES.UNITE, "INSTANCE_UNITE_CONFIGUREE_ACTIONS_DU_ROBOT", "Actions du robot"],
      [SORTES.TRAITEMENT, "TRAITEMENT_METIER_UNITE_PRINCIPAL", undefined],
      [SORTES.INTERFACE, "INTERFACE_COMMUNICATION_UNITE_PRINCIPALE", undefined],
      [SORTES.BANDE, "BANDE_DONNEES_PRINCIPALE", "Bande principale"],
      [SORTES.BUS_RECEPTION, "BUS_RECEPTION_PRINCIPAL", "Réception"],
      [SORTES.BUS_EMISSION, "BUS_EMISSION_PRINCIPAL", "Émission"],
    ]);
  });

  it("un service déposé hors d'une zone est refusé, rien ne change", () => {
    const depart = etatDeReference();
    const resultat = jouer(depart, {
      operation: "ajouter", sorte: SORTES.SERVICE, type: SERVICE, parent: null, valeurs: { nom: "Média" },
    });
    expect(resultat.accepte).toBe(false);
    if (resultat.accepte) return;
    expect(resultat.refus).toEqual({
      code: "SERVICE_HORS_ZONE",
      message: "Un service se place dans une zone d'environnement, jamais directement dans le bundle. "
        + "Déposez-le dans : Robot M3 Pro, Serveur de traitement.",
      element: "nouv-1",
      parentsCompatibles: ["zon-01", "zon-02"],
    });
    expect(depart).toEqual(etatDeReference());
  });

  it("une deuxième salle est refusée", () => {
    const resultat = jouer(etatDeReference(), { operation: "ajouter", sorte: SORTES.SALLE, type: SALLE, parent: null });
    expect(resultat.accepte).toBe(false);
    if (!resultat.accepte) {
      // Une seule raison : le code tiré du nom ne double jamais celui de la première salle.
      expect(resultat.tousLesRefus.map((refus) => refus.code)).toEqual(["SALLE_EN_DOUBLE"]);
    }
  });

  it("un code tiré du nom est celui du serveur, et ne double jamais un code pris", () => {
    expect(codeDepuisNom("BUNDLE_DEPLOIEMENT", "Téléopération du M3")).toBe("BUNDLE_DEPLOIEMENT_TELEOPERATION_DU_M3");
    expect(codeDepuisNom("ZONE_ENVIRONNEMENT_EXECUTION", "  ")).toBe("ZONE_ENVIRONNEMENT_EXECUTION");
    const etat = accepte(jouer(etatDeReference(), {
      operation: "ajouter", sorte: SORTES.SERVICE, type: SERVICE, parent: "zon-01",
      valeurs: { nom: "Actions robot" },
    }));
    expect(element(etat, "nouv-1")?.code).toBe("INSTANCE_SERVICE_CONFIGUREE_ACTIONS_ROBOT_2");
    // Le code de la première unité vient de celui du service : il évite lui aussi un code pris.
    const commande = accepte(jouer(etat, {
      operation: "ajouter", sorte: SORTES.SERVICE, type: SERVICE, parent: "zon-01",
      valeurs: { nom: "Commande base" },
    }));
    const service = commande.modele.elements.find((e) => e.code === "INSTANCE_SERVICE_CONFIGUREE_COMMANDE_BASE");
    expect(commande.modele.elements.find((e) => e.parent === service?.id)?.code)
      .toBe("INSTANCE_UNITE_CONFIGUREE_COMMANDE_BASE_2");
  });

  it("le type d'une bande, d'un bus ou d'un canal n'entre jamais dans le document", () => {
    const etat = accepte(jouer(etatDeReference(), {
      operation: "ajouter", sorte: SORTES.CANAL_RECEPTION, type: { code: "CANAL_RECEPTION", version: "1.0.0" },
      parent: "bre-01", valeurs: { nom: "Vitesse" },
    }));
    expect(element(etat, "nouv-1")).toEqual({
      id: "nouv-1", sorte: SORTES.CANAL_RECEPTION, parent: "bre-01", code: "CANAL_RECEPTION_VITESSE", nom: "Vitesse",
      reglages: { type: "TYPE_ENTREE_ABONNEMENT_TEMPS_REEL", format: "OBJET_JSON" },
    });
  });
});

describe("régler, placer, changer de parent", () => {
  it("une zone facultative exige une justification", () => {
    const depart = etatDeReference();
    const sans = jouer(depart, {
      operation: "regler", id: "zon-01", champs: { reglages: { exigence: EXIGENCE_FACULTATIVE } },
    });
    expect(sans.accepte ? null : sans.refus.code).toBe("JUSTIFICATION_ABSENTE");
    const vide = jouer(depart, {
      operation: "regler", id: "zon-01", champs: { reglages: { exigence: EXIGENCE_FACULTATIVE, justification: "  " } },
    });
    expect(vide.accepte ? null : vide.refus.code).toBe("JUSTIFICATION_ABSENTE");
    const avec = accepte(jouer(depart, {
      operation: "regler", id: "zon-01",
      champs: { reglages: { exigence: EXIGENCE_FACULTATIVE, justification: "Le robot attend sans elle." } },
    }));
    expect(element(avec, "zon-01")?.reglages).toEqual({
      exigence: EXIGENCE_FACULTATIVE, justification: "Le robot attend sans elle.",
    });
  });

  it("déplacer un bloc ne change que la mise en page", () => {
    const depart = etatDeReference();
    const etat = accepte(jouer(depart, { operation: "placer", id: "svc-02", position: { x: 24, y: 480 } }));
    expect(etat.modele).toBe(depart.modele);
    expect(etat.miseEnPage.blocs["svc-02"]).toEqual({ x: 24, y: 480 });
    // Une unité n'a pas de position à elle : elle se range seule dans son composant.
    const unite = jouer(depart, { operation: "placer", id: "uni-01", position: { x: 1, y: 1 } });
    expect(unite.accepte && unite.etat).toBe(depart);
  });

  it("changer de parent vers un parent incompatible est refusé sans rien changer", () => {
    const depart = etatDeReference();
    const resultat = jouer(depart, { operation: "emboiter", id: "svc-01", parent: "zon-03" });
    expect(resultat.accepte).toBe(false);
    if (!resultat.accepte) {
      expect(resultat.refus.code).toBe("ZONE_INCOMPATIBLE");
      expect(resultat.refus.parentsCompatibles).toEqual(["zon-01", "zon-02"]);
    }
    expect(depart).toEqual(etatDeReference());

    // Vers une zone qui reçoit des services, le service part, avec son contenu et ses liaisons.
    const etat = accepte(jouer(depart, { operation: "emboiter", id: "svc-01", parent: "zon-02" }));
    expect(element(etat, "svc-01")?.parent).toBe("zon-02");
    expect(etat.modele.liaisons).toBe(depart.modele.liaisons);
    // Sa position était relative à l'ancienne zone : il prend une place calculée dans la nouvelle.
    expect(etat.miseEnPage.blocs["svc-01"]).toBeUndefined();
  });

  it("un canal se place dans un bus de son sens seulement", () => {
    const depart = etatDeReference();
    const mauvais = jouer(depart, { operation: "emboiter", id: "can-02", parent: "bre-02" });
    expect(mauvais.accepte ? null : mauvais.refus).toMatchObject({
      code: "CANAL_MAUVAIS_BUS",
      message: "Ce canal d'émission ne peut pas être placé dans un bus de réception. Placez-le dans un bus d'émission.",
      parentsCompatibles: ["bem-02"],
    });
    const ajout = jouer(depart, {
      operation: "ajouter", sorte: SORTES.CANAL_RECEPTION, parent: "bem-01", valeurs: { nom: "Vitesse" },
    });
    expect(ajout.accepte ? null : ajout.refus.code).toBe("CANAL_MAUVAIS_BUS");
    expect(accepte(jouer(depart, { operation: "emboiter", id: "can-02", parent: "bem-01" })).modele.elements
      .find((e) => e.id === "can-02")?.parent).toBe("bem-01");
  });

  it("un code figé ne change pas, mais son nom se règle", () => {
    const depart = figer({
      ...etatDeReference(),
      modele: {
        ...etatDeReference().modele,
        elements: etatDeReference().modele.elements.map((e) => (e.id === "svc-01" ? { ...e, code_fige: true } : e)),
      },
    });
    const code = jouer(depart, { operation: "regler", id: "svc-01", champs: { code: "INSTANCE_SERVICE_CONFIGUREE_ACTIONS" } });
    expect(code.accepte ? null : code.refus.message)
      .toBe("Ce code a déjà été publié : il ne change plus. Renommez plutôt le nom affiché.");
    const nom = accepte(jouer(depart, { operation: "regler", id: "svc-01", champs: { nom: "Actions" } }));
    expect(element(nom, "svc-01")).toMatchObject({ nom: "Actions", code_fige: true });
  });
});

describe("supprimer, relier, délier", () => {
  it("supprimer une zone retire son contenu et ses liaisons, et dit lesquels", () => {
    const depart = etatDeReference();
    const consequences = consequencesDUneSuppression(depart, "zon-03");
    expect(consequences.elements.map((e) => e.id)).toEqual(
      ["zon-03", "app-01", "uni-02", "trt-02", "itf-02", "bnd-02", "bre-02", "bem-02", "can-02"]);
    expect(consequences.liaisons.map((l) => l.id)).toEqual(["lia-01"]);
    const resultat = jouer(depart, { operation: "supprimer", id: "zon-03" });
    const etat = accepte(resultat);
    expect(etat.modele.elements.some((e) => consequences.elements.includes(e))).toBe(false);
    expect(etat.modele.liaisons).toEqual([]);
    expect(Object.keys(etat.miseEnPage.blocs)).not.toContain("zon-03");
    expect(Object.keys(etat.miseEnPage.blocs)).not.toContain("app-01");
    if (resultat.accepte) {
      expect(resultat.changements.retires).toHaveLength(9);
      expect(resultat.changements.liaisonsRetirees).toEqual(["lia-01"]);
    }
  });

  it("supprimer la dernière zone retire la salle", () => {
    let etat = etatDeReference();
    etat = accepte(jouer(etat, { operation: "supprimer", id: "zon-03" }));
    etat = accepte(jouer(etat, { operation: "supprimer", id: "zon-02" }));
    expect(etat.modele.elements.some((e) => e.sorte === SORTES.SALLE)).toBe(true);
    etat = accepte(jouer(etat, { operation: "supprimer", id: "zon-01" }));
    expect(etat.modele.elements).toEqual([]);
    expect(etat.miseEnPage.blocs).toEqual({});
  });

  it("la salle et la structure d'une unité ne partent pas seules", () => {
    const depart = etatDeReference();
    const salle = jouer(depart, { operation: "supprimer", id: "sal-01" });
    expect(salle.accepte ? null : salle.refus.code).toBe("SALLE_SANS_ZONE");
    const traitement = jouer(depart, { operation: "supprimer", id: "trt-01" });
    expect(traitement.accepte ? null : traitement.refus.code).toBe("STRUCTURE_FIXE");
  });

  it("relier va d'une sortie vers une entrée, jamais l'inverse", () => {
    const depart = etatDeReference();
    const inverse = jouer(depart, { operation: "relier", source: "can-01", destination: "can-02" });
    expect(inverse.accepte ? null : inverse.refus.message).toBe("Une liaison va toujours d'une sortie vers une entrée.");
    const etat = accepte(jouer(depart, { operation: "relier", source: "can-02", destination: "can-01" }));
    // Un identifiant neuf (le geste refusé juste avant a déjà pris « nouv-1 »).
    expect(etat.modele.liaisons.at(-1)).toEqual({ id: "nouv-2", source: "can-02", destination: "can-01" });
  });

  it("délier retire une liaison seule", () => {
    const depart = etatDeReference();
    const etat = accepte(jouer(depart, { operation: "delier", liaison: "lia-01" }));
    expect(etat.modele.liaisons).toEqual([]);
    expect(etat.modele.elements).toBe(depart.modele.elements);
    expect(etat.miseEnPage).toBe(depart.miseEnPage);
  });
});

describe("ce que garantit chaque geste", () => {
  it("un geste qui ne change rien rend le même état", () => {
    const depart = etatDeReference();
    const gestes: Geste[] = [
      { operation: "placer", id: "zon-01", position: { x: 40, y: 120 } },
      { operation: "regler", id: "svc-01", champs: { nom: "Service actions du robot" } },
      { operation: "reglerBundle", champs: { nom: depart.modele.bundle.nom } },
      { operation: "emboiter", id: "svc-01", parent: "zon-01" },
      { operation: "supprimer", id: "inconnu" },
      { operation: "delier", liaison: "inconnue" },
    ];
    for (const geste of gestes) {
      const resultat = jouer(depart, geste);
      // Le même objet, pas une copie égale : l'historique reconnaît ainsi un geste sans effet.
      expect(resultat.accepte && resultat.etat, geste.operation).toBe(depart);
    }
  });

  it("un brouillon déjà fautif reste modifiable : seule une faute ajoutée par le geste est refusée", () => {
    // Une zone sans salle (une reprise peut en arriver ainsi) : la faute est déjà là.
    const fautif = figer({
      ...etatDeReference(),
      modele: { ...etatDeReference().modele, elements: etatDeReference().modele.elements.filter((e) => e.id !== "sal-01") },
    });
    expect(verifierModele(fautif.modele, contexteDeTest().catalogue).map((r) => r.code)).toEqual(["SALLE_SANS_ZONE"]);
    accepte(jouer(fautif, { operation: "regler", id: "zon-01", champs: { nom: "Robot de l'accueil" } }));
    const refus = jouer(fautif, { operation: "emboiter", id: "uni-01", parent: "zon-01" });
    expect(refus.accepte ? null : refus.tousLesRefus.map((r) => r.code)).toEqual(["UNITE_HORS_COMPOSANT"]);
  });
});
