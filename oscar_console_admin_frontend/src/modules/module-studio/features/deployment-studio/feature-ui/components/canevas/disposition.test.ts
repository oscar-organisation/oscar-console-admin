import { MarkerType, Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { brouillonDeReference, brouillonRepris, contexteDeTest, figer } from "../../../donnees-de-test";
import type { MiseEnPage } from "../../../feature-domain/modele/types";
import { ID_DU_CADRE, MESURES, disposer, hauteurDUneUnite, type NoeudDeComposant, type NoeudDeZone, type NoeudDuCanevas } from "./disposition";
import { ranger } from "./rangement";

/**
 * La disposition du canevas : du modèle et de sa mise en page aux nœuds et aux
 * liaisons de React Flow (conception du lot L1, partie 6.4 ; recette R1.5).
 */

const catalogue = contexteDeTest().catalogue;
const reference = () => disposer(brouillonDeReference.modele, brouillonDeReference.mise_en_page, catalogue);
const reprise = () => disposer(brouillonRepris.modele, brouillonRepris.mise_en_page, catalogue);

function noeud(noeuds: readonly NoeudDuCanevas[], id: string): NoeudDuCanevas {
  const trouve = noeuds.find((candidat) => candidat.id === id);
  if (!trouve) throw new Error(`nœud absent : ${id}`);
  return trouve;
}

describe("la disposition du canevas", () => {
  it("les parents précèdent leurs enfants", () => {
    for (const { noeuds } of [reference(), reprise()]) {
      const rangs = new Map(noeuds.map((n, rang) => [n.id, rang]));
      expect(noeuds[0]?.id).toBe(ID_DU_CADRE);
      for (const [rang, n] of noeuds.entries()) {
        if (!n.parentId) continue;
        // React Flow (12.11.6) ne place pas un enfant dont le parent vient après lui.
        expect(rangs.get(n.parentId), n.id).toBeLessThan(rang);
      }
    }
  });

  it("emboîte les blocs comme le modèle, aux positions de la mise en page, relatives au parent", () => {
    const { noeuds } = reference();
    const { blocs } = brouillonDeReference.mise_en_page;
    expect(noeud(noeuds, "zon-01")).toMatchObject({ type: "zone", parentId: ID_DU_CADRE, position: blocs["zon-01"] });
    expect(noeud(noeuds, "sal-01")).toMatchObject({ type: "salle", parentId: ID_DU_CADRE, position: blocs["sal-01"] });
    expect(noeud(noeuds, "svc-02")).toMatchObject({ type: "composant", parentId: "zon-01", position: blocs["svc-02"] });
    expect(noeud(noeuds, "app-01")).toMatchObject({ type: "composant", parentId: "zon-03", position: blocs["app-01"] });
    // Les positions passent telles quelles : celles d'un enfant restent relatives à son parent.
    expect(blocs["svc-02"]).toEqual({ x: 24, y: 355 });
    // Les unités et les canaux ne sont pas des nœuds : ils se rangent dans leur composant.
    expect(noeuds.map((n) => n.type).sort()).toEqual(
      ["bundle", "composant", "composant", "composant", "salle", "zone", "zone", "zone"]);
  });

  it("les entrées sont à gauche, les sorties à droite", () => {
    const { noeuds } = reference();
    const service = noeud(noeuds, "svc-01") as NoeudDeComposant;
    const application = noeud(noeuds, "app-01") as NoeudDeComposant;
    expect(service.data.unites[0]?.entrees.map((c) => [c.element.id, c.cote, c.poignee]))
      .toEqual([["can-01", Position.Left, "target"]]);
    expect(application.data.unites[0]?.sorties.map((c) => [c.element.id, c.cote, c.poignee]))
      .toEqual([["can-02", Position.Right, "source"]]);
    for (const { noeuds: tous } of [reference(), reprise()]) {
      for (const n of tous) {
        if (n.type !== "composant") continue;
        for (const unite of n.data.unites) {
          expect(unite.entrees.every((c) => c.cote === Position.Left && c.element.sorte === "CANAL_RECEPTION")).toBe(true);
          expect(unite.sorties.every((c) => c.cote === Position.Right && c.element.sorte === "CANAL_EMISSION")).toBe(true);
        }
      }
    }
  });

  it("chaque liaison a sa flèche du côté de l'entrée", () => {
    const { liaisons } = reference();
    expect(liaisons).toHaveLength(1);
    expect(liaisons[0]).toMatchObject({
      id: "lia-01",
      source: "app-01", sourceHandle: "can-02",
      target: "svc-01", targetHandle: "can-01",
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed },
    });
    expect(liaisons[0]?.markerStart).toBeUndefined();
    // Dans la reprise aussi : chaque liaison va d'une sortie vers une entrée, flèche à l'arrivée.
    for (const liaison of reprise().liaisons) {
      expect(liaison.markerEnd).toMatchObject({ type: MarkerType.ArrowClosed });
      expect(liaison.markerStart).toBeUndefined();
    }
  });

  it("un bloc sans position reçoit toujours la même place", () => {
    const sansPosition: MiseEnPage = figer({ format: "oscar.mise-en-page/1", blocs: {} });
    const premiere = disposer(brouillonDeReference.modele, sansPosition, catalogue);
    const seconde = disposer(figer(brouillonDeReference.modele), sansPosition, catalogue);
    expect(premiere.noeuds.map((n) => [n.id, n.position])).toEqual(seconde.noeuds.map((n) => [n.id, n.position]));
    // Les zones se rangent côte à côte, la salle en haut ; les composants l'un sous l'autre.
    const zones = premiere.noeuds.filter((n): n is NoeudDeZone => n.type === "zone");
    expect(zones.map((z) => z.position.y)).toEqual([MESURES.hautDesZones, MESURES.hautDesZones, MESURES.hautDesZones]);
    for (let rang = 1; rang < zones.length; rang += 1) {
      const avant = zones[rang - 1];
      expect(zones[rang]?.position.x).toBe((avant?.position.x ?? 0) + (avant?.width ?? 0) + MESURES.espaceEntreZones);
    }
    expect(noeud(premiere.noeuds, "sal-01").position).toEqual(MESURES.positionDeLaSalle);
    const [svc1, svc2] = [noeud(premiere.noeuds, "svc-01"), noeud(premiere.noeuds, "svc-02")];
    expect(svc1.position).toEqual({ x: MESURES.margeDeZone, y: MESURES.enTeteDeZone });
    expect(svc2.position).toEqual({ x: MESURES.margeDeZone, y: svc1.position.y + (svc1.height ?? 0) + MESURES.espaceEntreComposants });
    // La reprise d'un ancien bundle, qui ne place pas ses zones, s'affiche elle aussi deux fois pareil.
    expect(reprise().noeuds.map((n) => [n.id, n.position])).toEqual(reprise().noeuds.map((n) => [n.id, n.position]));
  });

  it("chaque bloc parent contient ses enfants, à la taille de son contenu", () => {
    for (const { noeuds } of [reference(), reprise()]) {
      const parId = new Map(noeuds.map((n) => [n.id, n]));
      for (const n of noeuds) {
        if (!n.parentId) continue;
        const parent = parId.get(n.parentId);
        expect(n.position.x + (n.width ?? 0), n.id).toBeLessThanOrEqual(parent?.width ?? 0);
        expect(n.position.y + (n.height ?? 0), n.id).toBeLessThanOrEqual(parent?.height ?? 0);
      }
    }
  });

  it("une zone dit en mots son type, si elle est facultative, Externe ou à préciser", () => {
    const zones = (d: ReturnType<typeof disposer>) => d.noeuds.filter((n): n is NoeudDeZone => n.type === "zone")
      .map((z) => [z.id, z.data.typeEnMots, z.data.facultative, z.data.externe, z.data.aPreciser]);
    expect(zones(reference())).toEqual([
      ["zon-01", "robot", false, false, false],
      ["zon-02", "serveur", true, false, false],
      ["zon-03", "application web", false, false, false],
    ]);
    expect(zones(reprise()).at(-1)).toEqual(["zon-ancien-a-preciser", "à préciser", false, false, true]);
  });

  it("le bundle repris s'affiche entier, et ses compteurs sont ceux du modèle", () => {
    const { noeuds, liaisons, nonAffiches, compteurs } = reprise();
    expect(nonAffiches).toEqual([]);
    expect(compteurs).toEqual({ zones: 4, composants: 6, unites: 6, liaisons: 2 });
    expect(liaisons.map((l) => [l.source, l.target])).toEqual([
      ["instance_application-5e6f7a8b", "instance_service-1a2b3c4d"],
      ["instance_service-1a2b3c4d", "instance_application-5e6f7a8b"],
    ]);
    const canaux = noeuds.flatMap((n) => (n.type === "composant" ? n.data.unites : []))
      .flatMap((u) => [...u.entrees, ...u.sorties]).map((c) => c.element.id).sort();
    expect(canaux).toEqual(["rx-commande", "rx-etat-robot", "rx-image", "tx-commande", "tx-etat", "tx-flux"]);
  });

  it("chaque unité montre ses deux colonnes ; un bus vide garde une ligne pour y poser son premier canal", () => {
    const { noeuds } = reference();
    const composant = (id: string) => noeud(noeuds, id) as NoeudDeComposant;
    const [commande] = composant("svc-01").data.unites;
    const [media] = composant("svc-02").data.unites;
    if (!commande || !media) throw new Error("unités absentes");
    // La commande de la base reçoit un canal, n'en émet aucun : chaque colonne a son bus.
    expect(commande.groupesDEntrees.map((g) => [g.bus.id, g.canaux.map((c) => c.element.id)])).toEqual([["bre-01", ["can-01"]]]);
    expect(commande.groupesDeSorties.map((g) => [g.bus.id, g.canaux.length])).toEqual([["bem-01", 0]]);
    // Sa structure se montre en puces : traitement, interface, bande.
    expect([commande.traitement?.id, commande.interfaceDeLUnite?.id, commande.bandes.map((b) => b.id)]).toEqual(["trt-01", "itf-01", ["bnd-01"]]);
    // Une unité sans canal a la même hauteur qu'une unité d'un canal : la ligne vide sert au dépôt.
    expect(hauteurDUneUnite(media)).toBe(hauteurDUneUnite(commande));
    expect(composant("svc-01").height).toBe(MESURES.bordsDuComposant + MESURES.enTeteDuComposant + MESURES.metaDuComposant
      + 2 * MESURES.margeDesUnites + hauteurDUneUnite(commande) + MESURES.espaceEntreUnites + MESURES.boutonAjouterUneUnite);
  });

  it("des blocs qui se recouvrent sont signalés, jamais déplacés d'eux-mêmes ; « Ranger » les remet en ordre", () => {
    // Une mise en page faite pour des blocs plus petits (celle de référence avant l'étape I7) :
    // la zone robot, devenue plus haute, recouvre la zone serveur posée sous elle.
    const petitsBlocs: MiseEnPage = figer({ format: "oscar.mise-en-page/1", blocs: {
      "zon-01": { x: 40, y: 120 }, "zon-02": { x: 40, y: 640 }, "zon-03": { x: 900, y: 120 }, "sal-01": { x: 40, y: 24 },
      "svc-01": { x: 24, y: 64 }, "svc-02": { x: 24, y: 400 }, "app-01": { x: 24, y: 64 },
    } });
    const { chevauchements, noeuds } = disposer(brouillonDeReference.modele, petitsBlocs, catalogue);
    expect([...chevauchements].sort()).toEqual(["zon-01", "zon-02"]);
    expect(noeud(noeuds, "zon-02").position).toEqual(petitsBlocs.blocs["zon-02"]);
    const rangee = disposer(brouillonDeReference.modele, ranger(brouillonDeReference.modele, petitsBlocs), catalogue);
    expect(rangee.chevauchements).toEqual([]);
  });
});
