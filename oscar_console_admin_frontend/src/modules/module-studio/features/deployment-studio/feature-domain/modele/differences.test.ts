import { describe, expect, it } from "vitest";
import { contexteDeTest, etatDeReference } from "../../donnees-de-test";
import { aucuneDifference, differences } from "./differences";
import { appliquerGeste, type Geste } from "./operations";
import { SORTES, type EtatStudio } from "./types";

/** Ce qui diffère entre deux versions d'un brouillon : la fenêtre de conflit le montre de chaque côté. */

function jouer(etat: EtatStudio, geste: Geste): EtatStudio {
  const resultat = appliquerGeste(etat, geste, contexteDeTest());
  if (!resultat.accepte) throw new Error(resultat.refus.message);
  return resultat.etat;
}

describe("les différences entre deux modèles", () => {
  it("dit ce qui est ajouté, retiré, modifié, et les liaisons, sans tenir compte de l'ordre des clés", () => {
    const depart = etatDeReference();
    let apres = jouer(depart, { operation: "ajouter", sorte: SORTES.UNITE, parent: "svc-02" });
    apres = jouer(apres, { operation: "regler", id: "zon-01", champs: { nom: "Robot de l'accueil" } });
    apres = jouer(apres, { operation: "delier", liaison: "lia-01" });
    apres = jouer(apres, { operation: "supprimer", id: "app-01" });
    const ecarts = differences(depart.modele, apres.modele);
    expect(ecarts.ajoutes.map((element) => element.sorte)).toEqual([
      SORTES.UNITE, SORTES.TRAITEMENT, SORTES.INTERFACE, SORTES.BANDE, SORTES.BUS_RECEPTION, SORTES.BUS_EMISSION,
    ]);
    expect(ecarts.modifies.map((element) => element.id)).toEqual(["zon-01"]);
    expect(ecarts.retires.map((element) => element.id)).toEqual(["app-01", "uni-02", "trt-02", "itf-02", "bnd-02", "bre-02", "bem-02", "can-02"]);
    expect(ecarts.liaisonsRetirees.map((liaison) => liaison.id)).toEqual(["lia-01"]);
    expect(ecarts.enTeteModifiee).toBe(false);
    expect(aucuneDifference(ecarts)).toBe(false);
    // Les mêmes éléments, leurs clés dans un autre ordre : rien n'a changé.
    const memeContenu = { ...depart.modele, elements: depart.modele.elements.map((element) => Object.fromEntries(Object.entries(element).reverse())) };
    expect(aucuneDifference(differences(depart.modele, memeContenu as unknown as typeof depart.modele))).toBe(true);
  });

  it("voit un changement de l'en-tête du bundle", () => {
    const depart = etatDeReference();
    const apres = jouer(depart, { operation: "reglerBundle", champs: { nom: "Téléopération du M3, nuit" } });
    expect(differences(depart.modele, apres.modele).enTeteModifiee).toBe(true);
  });
});
