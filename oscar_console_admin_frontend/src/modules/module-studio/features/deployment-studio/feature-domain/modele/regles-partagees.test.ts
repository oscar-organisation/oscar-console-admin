import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import fichierDesCas from "../../donnees-de-test/formats_oscar_v1/regles_du_modele/regles-du-modele.cas.json";
// Le texte exact des fichiers, pour en calculer l'empreinte.
import texteDeLaSource from "../../donnees-de-test/formats_oscar_v1/SOURCE.txt?raw";
import texteDesCas from "../../donnees-de-test/formats_oscar_v1/regles_du_modele/regles-du-modele.cas.json?raw";
import texteDeLaReference from "../../donnees-de-test/formats_oscar_v1/exemples/bundle/valides/bundle-reference-l1.json?raw";
import { catalogueDeTest, contexteDeTest, figer } from "../../donnees-de-test";
import { appliquerGeste, type Geste } from "./operations";
import { INVARIANTS, typeDuCatalogue, verifierModele } from "./regles";
import type { CodeDeRefus, EtatStudio, ModeleBundle, Refus } from "./types";

/**
 * Le même verdict que le serveur, cas par cas (conception du lot L1, partie 4.5).
 *
 * Les règles du modèle existent en TypeScript (ici) et en Python (sur le
 * serveur). Pour qu'elles ne divergent pas, un seul fichier de cas, pris aux
 * formats OSCAR à une étiquette fixe, dit le verdict attendu de chaque cas :
 * accepté, ou refusé avec tel code. Le serveur le joue dans
 * `tests/test_studio_regles_du_modele.py` ; ce test joue la copie que garde
 * l'interface, avec les vraies opérations du navigateur pour les cas qui
 * portent un geste.
 */

const COPIES: Readonly<Record<string, string>> = {
  "regles_du_modele/regles-du-modele.cas.json": texteDesCas,
  "exemples/bundle/valides/bundle-reference-l1.json": texteDeLaReference,
};

interface Cas {
  readonly nom: string;
  readonly invariant: CodeDeRefus;
  readonly document: ModeleBundle;
  readonly geste?: Geste;
  readonly verdict: { readonly accepte: boolean; readonly code?: CodeDeRefus };
}

const CAS = (fichierDesCas as unknown as { cas: Cas[] }).cas;

/**
 * Les phrases de la table 3.4 de la conception, écrites ici une seconde fois,
 * à part du code, comme dans le test du serveur : le test ne se contente pas
 * de relire ce que le code produit. {} marque ce que la phrase nomme.
 */
const MESSAGES: Readonly<Record<CodeDeRefus, readonly string[]>> = {
  SERVICE_HORS_ZONE: [
    "Un service se place dans une zone d'environnement, jamais directement dans le bundle. Déposez-le dans : {}.",
    "Une application se place dans une zone d'environnement, jamais directement dans le bundle. Déposez-la dans : {}.",
  ],
  ZONE_INCOMPATIBLE: [
    "La zone « {} » est une zone {} : elle reçoit des {}. Placez ce service dans : {}.",
    "La zone « {} » est une zone {} : elle reçoit des {}. Placez cette application dans : {}.",
  ],
  ZONE_DANS_UNE_ZONE: ["Une zone se place directement dans le bundle, jamais dans une autre zone."],
  SALLE_EN_DOUBLE: ["Ce bundle a déjà sa salle temps réel. Il n'en a qu'une : toutes ses unités s'y retrouvent."],
  SALLE_SANS_ZONE: [
    "La salle temps réel se pose seule avec la première zone. Ajoutez d'abord une zone.",
    "La salle temps réel reste tant que le bundle a une zone. Elle part avec la dernière.",
  ],
  ZONE_EXTERNE_EN_DOUBLE: ["Ce bundle a déjà sa zone Externe. Posez-y tous les serveurs qui ne sont pas chez vous."],
  ZONE_EXTERNE_RESERVEE: [
    "La zone Externe ne reçoit que des connexions vers des serveurs hors de vos machines. "
    + "Placez ce service dans une zone robot ou serveur.",
    "La zone Externe ne reçoit que des connexions vers des serveurs hors de vos machines. "
    + "Placez cette application dans une zone application web, ordinateur de bureau, appareil mobile ou casque.",
  ],
  UNITE_HORS_COMPOSANT: [
    "Une unité se place dans un service ou une application. Choisissez-en un, puis « Ajouter une unité »."],
  STRUCTURE_FIXE: [
    "Une unité a toujours un traitement de base et une interface de communication : ils naissent et partent avec elle."],
  CANAL_MAUVAIS_BUS: [
    "Ce canal de réception ne peut pas être placé dans un bus d'émission. Placez-le dans un bus de réception.",
    "Ce canal d'émission ne peut pas être placé dans un bus de réception. Placez-le dans un bus d'émission.",
  ],
  PARENT_INCOMPATIBLE: [
    "Un {} ne se place pas dans {}. Placez-le dans : {}.",
    "Une {} ne se place pas dans {}. Placez-la dans : {}.",
  ],
  PARENT_ABSENT: ["L'élément parent {} n'existe pas dans ce brouillon. Rechargez le Studio."],
  JUSTIFICATION_ABSENTE: [
    "Une zone facultative demande une justification : dites pourquoi le bundle fonctionne sans elle."],
  IDENTIFIANT_EN_DOUBLE: [
    "Deux éléments portent le même identifiant interne. Rechargez le Studio ; si cela se reproduit, signalez-le."],
  CODE_EN_DOUBLE: [
    "Le code {} est déjà pris dans ce bundle. Choisissez-en un autre.",
    "Le code {} est déjà pris dans cette unité. Choisissez-en un autre.",
  ],
  CODE_FIGE: [
    "Ce code a déjà été publié (version {}) : il ne change plus. Renommez plutôt le nom affiché.",
    "Ce code a déjà été publié : il ne change plus. Renommez plutôt le nom affiché.",
  ],
  TYPE_INCONNU_DU_CATALOGUE: [
    "Le type {} en version {} n'est pas au catalogue. Choisissez un type proposé par la palette."],
  LIAISON_SENS_INVERSE: ["Une liaison va toujours d'une sortie vers une entrée."],
  LIAISON_EXTREMITE_ABSENTE: ["Une extrémité de cette liaison n'existe plus."],
};

function suitLaTable(code: CodeDeRefus, message: string): boolean {
  return MESSAGES[code].some((modele) => {
    const motif = modele.split("{}").map((morceau) => morceau.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".+");
    return new RegExp(`^${motif}$`).test(message);
  });
}

function etat(document: ModeleBundle): EtatStudio {
  return figer({ modele: document, miseEnPage: { format: "oscar.mise-en-page/1", blocs: {} } });
}

describe("la copie des formats OSCAR", () => {
  it("est celle de l'étiquette, fichier par fichier (empreintes de SOURCE.txt)", () => {
    expect(texteDeLaSource).toContain("etiquette: formats-oscar-v1.1.0");
    const empreintes = [...texteDeLaSource.matchAll(/^([0-9a-f]{64}) {2}(\S+)$/gm)];
    expect(empreintes.map(([, , chemin]) => chemin)).toEqual(Object.keys(COPIES));
    for (const [, attendue, chemin] of empreintes) {
      const lue = createHash("sha256").update(COPIES[chemin ?? ""] ?? "", "utf8").digest("hex");
      expect(lue, chemin).toBe(attendue);
    }
  });

  it("couvre chaque invariant, accepté et refusé, dans l'ordre des règles", () => {
    const fichier = fichierDesCas as unknown as { invariants: { code: string }[]; catalogue: { code: string; version: string; sorte: string }[] };
    expect(fichier.invariants.map((invariant) => invariant.code)).toEqual(INVARIANTS);
    expect(Object.keys(MESSAGES).sort()).toEqual([...INVARIANTS].sort());
    for (const code of INVARIANTS) {
      const verdicts = CAS.filter((cas) => cas.invariant === code).map((cas) => cas.verdict.accepte);
      expect(verdicts, code).toContain(true);
      expect(verdicts, code).toContain(false);
    }
    // Les cas supposent le catalogue du lot L1 : celui que sert le serveur le contient.
    const catalogue = contexteDeTest().catalogue;
    for (const type of fichier.catalogue) {
      expect(typeDuCatalogue(catalogue, type.code, type.version)?.sorte, type.code).toBe(type.sorte);
    }
    expect(catalogueDeTest.types.length).toBeGreaterThanOrEqual(fichier.catalogue.length);
  });
});

describe("chaque cas partagé rend le même verdict qu'au serveur", () => {
  it.each(CAS.map((cas) => [cas.nom, cas] as const))("%s", (_nom, cas) => {
    const contexte = contexteDeTest();
    const avant = etat(cas.document);
    let refus: readonly Refus[];
    if (cas.geste) {
      // Le document de départ d'un geste est lui-même valide.
      expect(verifierModele(avant.modele, contexte.catalogue)).toEqual([]);
      const resultat = appliquerGeste(avant, cas.geste, contexte);
      refus = resultat.accepte
        ? verifierModele(resultat.etat.modele, contexte.catalogue, { avant: avant.modele })
        : resultat.tousLesRefus;
      expect(resultat.accepte).toBe(cas.verdict.accepte);
    } else {
      refus = verifierModele(avant.modele, contexte.catalogue, { avant: avant.modele });
    }
    if (cas.verdict.accepte) {
      expect(refus).toEqual([]);
      return;
    }
    // Un cas refusé n'enfreint qu'un invariant : on attend ce code-là, et lui seul.
    expect([...new Set(refus.map((un) => un.code))], JSON.stringify(refus)).toEqual([cas.verdict.code]);
    for (const un of refus) expect(suitLaTable(un.code, un.message), un.message).toBe(true);
  });
});
