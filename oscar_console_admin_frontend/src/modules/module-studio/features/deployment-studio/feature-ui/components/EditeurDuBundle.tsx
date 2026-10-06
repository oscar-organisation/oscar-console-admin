import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, Cable, Check, CircleHelp, History, LayoutGrid, Layers3, LoaderCircle, Plus, Redo2, RotateCw, Undo2, X } from "lucide-react";
import type { BrouillonServeur } from "../../feature-data/studioApi";
import {
  abandonnerLaCopieLocale,
  abandonnerLeGeste,
  annuler,
  copieLocaleEnTexte,
  jouer,
  ouvrirLaVersionDuServeur,
  previsualiser,
  reessayer,
  remplacerLaVersionDuServeur,
  reprendreLaCopieLocale,
  retablir,
  verifier,
  type EtatDuBrouillon,
} from "../../feature-domain/brouillonStore";
import { peutAnnuler, peutRetablir } from "../../feature-domain/modele/historique";
import { identifiantAleatoire } from "../../feature-domain/modele/identifiants";
import {
  apercuDEmboitement,
  consequencesDUneSuppression,
  type ChampsReglables,
  type ContexteDesOperations,
  type Geste,
  type ResultatDUnGeste,
} from "../../feature-domain/modele/operations";
import {
  canauxReliables,
  cheminDe,
  enfantsPermis,
  gesteDAjout,
  nomAffiche,
  parentsPossibles,
  parentsQuiAcceptent,
  refusDUnAjout,
  refusDUneLiaison,
  refusDUneSuppression,
  typesDeLaPalette,
} from "../../feature-domain/modele/possibilites";
import { indexerCatalogue } from "../../feature-domain/modele/regles";
import {
  SORTES,
  type CatalogueStudio,
  type EnTeteDuBundle,
  type EtatStudio,
  type Position,
  type Sorte,
  type TypeDuCatalogue,
} from "../../feature-domain/modele/types";
import { guideDejaVu, retenirLeGuideVu } from "../affichage";
import { useRaccourcis, voisin, type ActionDuClavier, type ZoneDuClavier } from "../clavier/raccourcis";
import {
  CLE_DU_GROUPE_DES_LIAISONS,
  cleDeLaSelection,
  SELECTION_DU_BUNDLE,
  selectionValide,
  type Selection,
} from "../selection";
import { MOTS_DE_L_ENREGISTREMENT, pluriel } from "../textes";
import ApercuChangementParent from "./ApercuChangementParent";
import Arborescence from "./Arborescence";
import { ID_DU_CADRE, disposer } from "./canevas/disposition";
import GuideDuStudio from "./GuideDuStudio";
import { ranger } from "./canevas/rangement";
import ConfirmationSuppression, { type CibleDeSuppression } from "./ConfirmationSuppression";
import ConflitEnregistrement from "./ConflitEnregistrement";
import EspaceComposition, { type Centrage, type PointDeLEcran } from "./EspaceComposition";
import type { Reglage } from "./inspecteur/reglage";
import Inspecteur from "./inspecteur/Inspecteur";
import Legende from "./Legende";
import MenuAjouter, { type ChoixDuMenu } from "./MenuAjouter";
import MenuDuBundle from "./MenuDuBundle";
import PanneauProblemes, { type GroupeDeProblemes } from "./PanneauProblemes";
import Palette from "./Palette";
import RepriseBrouillonLocal from "./RepriseBrouillonLocal";

/**
 * L'éditeur d'un bundle au nouveau Studio (conception du lot L1, partie 6.1),
 * dans le dessin de l'ancien éditeur : la barre du haut, la palette et la
 * structure à gauche, le canevas au centre, les propriétés à droite, la barre
 * d'état en bas.
 *
 * Ce composant tient ce qui est propre à l'écran (la sélection, les fenêtres
 * ouvertes, les messages) et joue chaque geste par le magasin du brouillon,
 * c'est-à-dire par les opérations du modèle. Il ne contient aucune règle : ce
 * qu'il propose (où déposer, quoi ajouter, où déplacer) vient des opérations
 * jouées à blanc (feature-domain/modele/possibilites.ts).
 */

/** Un message passager en bas du canevas ; « Annuler » le défait d'un clic. */
interface Annonce {
  readonly texte: string;
  readonly annulable: boolean;
  readonly jeton: number;
}

/** Un refus affiché près de l'endroit du geste, avec les parents possibles éclairés. */
interface RefusAffiche {
  readonly message: string;
  readonly point: PointDeLEcran | null;
  readonly compatibles: readonly string[];
}

type MenuOuvert =
  /** « Ajouter dans X » : ce que X peut recevoir. */
  | { readonly mode: "enfants"; readonly parent: string | null }
  /** « Où ajouter X ? » : les endroits qui l'accepteraient. */
  | { readonly mode: "parents"; readonly type: TypeDuCatalogue; readonly explication: string };

const DUREE_DE_L_ANNONCE_MS = 5000;
const DUREE_DE_L_APPARITION_MS = 700;

export interface ProprietesDeLEditeur {
  readonly etat: EtatStudio;
  readonly catalogue: CatalogueStudio;
  readonly serveur: BrouillonServeur;
  /** Tout l'état du brouillon : l'historique (annuler, rétablir), l'enregistrement, la vérification. */
  readonly brouillon: EtatDuBrouillon;
}

export default function EditeurDuBundle({ etat, catalogue, serveur, brouillon }: ProprietesDeLEditeur) {
  const { enregistrement, messageDEnregistrement, prochainEssaiDans, historique } = brouillon;
  const racine = useRef<HTMLDivElement>(null);
  const contexte = useMemo((): ContexteDesOperations => ({
    catalogue: indexerCatalogue(catalogue),
    nouvelIdentifiant: identifiantAleatoire,
  }), [catalogue]);
  const { modele } = etat;
  const disposition = useMemo(() => disposer(modele, etat.miseEnPage, contexte.catalogue), [modele, etat.miseEnPage, contexte]);

  const [selectionChoisie, setSelection] = useState<Selection | null>(SELECTION_DU_BUNDLE);
  // Une sélection qui ne vise plus rien (annulée, supprimée) revient au bundle.
  const selection = selectionValide(selectionChoisie, modele);
  const [onglet, setOnglet] = useState<"composants" | "structure">("composants");
  const [replies, setReplies] = useState<ReadonlySet<string>>(new Set());
  const [typeGlisse, setTypeGlisse] = useState<TypeDuCatalogue | null>(null);
  const [deplacement, setDeplacement] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuOuvert | null>(null);
  const [apercu, setApercu] = useState<{ readonly id: string; readonly parent: string } | null>(null);
  const [suppression, setSuppression] = useState<CibleDeSuppression | null>(null);
  const [refus, setRefus] = useState<RefusAffiche | null>(null);
  const [annonce, setAnnonce] = useState<Annonce | null>(null);
  const [nouveaux, setNouveaux] = useState<ReadonlySet<string>>(new Set());
  // « Localiser » (le panneau des problèmes) centre le canevas sur un bloc.
  const [centrage, setCentrage] = useState<Centrage | null>(null);
  const [panneauOuvert, setPanneauOuvert] = useState(false);
  const [guideOuvert, setGuideOuvert] = useState(() => !guideDejaVu());
  const jetons = useRef(0);

  const parId = useMemo(() => new Map(modele.elements.map((element) => [element.id, element])), [modele]);
  const nomDe = useCallback((id: string | null) => {
    if (id === null) return modele.bundle.nom;
    const element = parId.get(id);
    return element ? nomAffiche(element) : id;
  }, [modele.bundle.nom, parId]);

  // Les messages passagers et l'animation d'apparition s'effacent seuls.
  useEffect(() => {
    if (!annonce) return undefined;
    const minuterie = window.setTimeout(() => setAnnonce(null), DUREE_DE_L_ANNONCE_MS);
    return () => window.clearTimeout(minuterie);
  }, [annonce]);
  useEffect(() => {
    if (nouveaux.size === 0) return undefined;
    const minuterie = window.setTimeout(() => setNouveaux(new Set()), DUREE_DE_L_APPARITION_MS);
    return () => window.clearTimeout(minuterie);
  }, [nouveaux]);

  const annoncer = useCallback((texte: string, annulable = true) => {
    jetons.current += 1;
    setAnnonce({ texte, annulable, jeton: jetons.current });
  }, []);

  /** Joue un geste ; un refus s'affiche près du point, avec les parents possibles éclairés. */
  const jouerEtMontrer = useCallback((geste: Geste, point: PointDeLEcran | null = null): ResultatDUnGeste | null => {
    const resultat = jouer(geste);
    if (!resultat) return null;
    if (!resultat.accepte) {
      setRefus({ message: resultat.refus.message, point, compatibles: resultat.refus.parentsCompatibles });
      return resultat;
    }
    setRefus(null);
    if (resultat.changements.ajoutes.length > 0) setNouveaux(new Set(resultat.changements.ajoutes));
    return resultat;
  }, []);

  /** Ajoute un type du catalogue dans un parent ; le nouvel élément est sélectionné, son panneau ouvert. */
  const ajouterUnType = useCallback((type: TypeDuCatalogue, parent: string | null, position?: Position, point: PointDeLEcran | null = null) => {
    const resultat = jouerEtMontrer(gesteDAjout(type, parent, position), point);
    if (!resultat?.accepte) return;
    const [premier] = resultat.changements.ajoutes;
    if (premier) setSelection({ sorte: "element", id: premier });
    annoncer(`${type.nom} ajouté dans « ${nomDe(parent)} ».`);
  }, [annoncer, jouerEtMontrer, nomDe]);

  /** Le type de la palette qui ajoute un élément de cette sorte (les boutons du canevas). */
  const typeDeLaSorte = useCallback((sorte: Sorte): TypeDuCatalogue | undefined =>
    typesDeLaPalette(catalogue).find((type) => type.sorte === sorte), [catalogue]);

  const ajouterUneSorte = useCallback((sorte: Sorte, parent: string) => {
    const type = typeDeLaSorte(sorte);
    if (type) ajouterUnType(type, parent);
  }, [ajouterUnType, typeDeLaSorte]);

  // Les parents à éclairer : pendant un glissement depuis la palette, pendant le déplacement
  // d'un bloc, ou ceux que propose le dernier refus.
  const compatibles = useMemo((): ReadonlySet<string> => {
    if (typeGlisse) return new Set(parentsQuiAcceptent(etat, typeGlisse, contexte).map((id) => id ?? ID_DU_CADRE));
    if (deplacement) {
      const element = parId.get(deplacement);
      const ici = element?.parent ? [element.parent] : [];
      return new Set([...ici, ...parentsPossibles(etat, deplacement, contexte).map((possible) => possible.id)]);
    }
    return new Set(refus?.compatibles ?? []);
  }, [typeGlisse, deplacement, refus, etat, contexte, parId]);

  /** Un clic sur une carte de la palette : dans l'élément choisi s'il la reçoit, sinon « Où l'ajouter ? ». */
  const choisirDansLaPalette = (type: TypeDuCatalogue) => {
    const parent = selection?.sorte === "element" ? selection.id : null;
    const raison = refusDUnAjout(etat, type, parent, contexte);
    if (raison === null) {
      ajouterUnType(type, parent);
      return;
    }
    setMenu({ mode: "parents", type, explication: raison.message });
  };

  // Ce que montre le menu ouvert : ses titres et ses choix (les règles, jouées à blanc).
  const menuOuvert = useMemo(() => {
    if (!menu) return null;
    if (menu.mode === "enfants") {
      const types = enfantsPermis(etat, menu.parent, catalogue, contexte);
      return {
        surtitre: "Ajouter",
        titre: `Ajouter dans « ${nomDe(menu.parent)} »`,
        explication: null,
        siVide: "Rien ne s’ajoute ici : cet élément ne reçoit pas d’autre élément.",
        choix: types.map((type): ChoixDuMenu => ({ cle: `${type.code}@${type.version}`, nom: type.nom, description: type.description, code: type.code })),
      };
    }
    const parents = parentsQuiAcceptent(etat, menu.type, contexte);
    return {
      surtitre: "Où l’ajouter ?",
      titre: `Où ajouter « ${menu.type.nom} » ?`,
      explication: parents.length > 0 ? `Il ne va pas dans l’élément choisi. ${menu.explication}` : menu.explication,
      siVide: "Aucun endroit ne l’accepte pour l’instant.",
      choix: parents.map((parent): ChoixDuMenu => ({
        cle: parent ?? ID_DU_CADRE,
        nom: nomDe(parent),
        description: parent === null ? "Le bundle" : cheminDe(modele, parent).slice(1, -1).join(" › ") || "Dans le bundle",
      })),
    };
  }, [menu, etat, catalogue, contexte, nomDe, modele]);

  /** Un choix du menu : ajouter ce type dans ce parent. */
  const choisirDansLeMenu = (cle: string) => {
    if (!menu) return;
    setMenu(null);
    if (menu.mode === "parents") {
      ajouterUnType(menu.type, cle === ID_DU_CADRE ? null : cle);
      return;
    }
    const type = enfantsPermis(etat, menu.parent, catalogue, contexte).find((candidat) => `${candidat.code}@${candidat.version}` === cle);
    if (type) ajouterUnType(type, menu.parent);
  };

  const reglageDe = useCallback((id: string): Reglage<ChampsReglables> => ({
    regler: (champs) => {
      const resultat = jouer({ operation: "regler", id, champs });
      return resultat && !resultat.accepte ? resultat.refus : null;
    },
    apercu: (champs) => { previsualiser({ operation: "regler", id, champs }); },
    abandonner: abandonnerLeGeste,
  }), []);
  const reglageDuBundle = useMemo((): Reglage<Partial<EnTeteDuBundle>> => ({
    regler: (champs) => {
      const resultat = jouer({ operation: "reglerBundle", champs });
      return resultat && !resultat.accepte ? resultat.refus : null;
    },
    apercu: (champs) => { previsualiser({ operation: "reglerBundle", champs }); },
    abandonner: abandonnerLeGeste,
  }), []);

  const retirerUneLiaison = useCallback((id: string) => {
    const liaison = modele.liaisons.find((candidat) => candidat.id === id);
    const resultat = jouerEtMontrer({ operation: "delier", liaison: id });
    if (resultat?.accepte && liaison) {
      setSelection(SELECTION_DU_BUNDLE);
      annoncer(`Liaison retirée : ${nomDe(liaison.source)} vers ${nomDe(liaison.destination)}.`);
    }
  }, [annoncer, jouerEtMontrer, modele.liaisons, nomDe]);

  const demanderLaSuppression = (cible: Selection) => {
    if (cible.sorte === "bundle") return;
    if (cible.sorte === "liaison") {
      retirerUneLiaison(cible.id);
      return;
    }
    setSuppression({
      sorte: "element",
      id: cible.id,
      consequences: consequencesDUneSuppression(etat, cible.id),
      refus: refusDUneSuppression(etat, cible.id, contexte),
    });
  };

  const confirmerLaSuppression = () => {
    if (!suppression || suppression.sorte !== "element") return;
    const element = parId.get(suppression.id);
    const resultat = jouerEtMontrer({ operation: "supprimer", id: suppression.id });
    setSuppression(null);
    if (resultat?.accepte && element) {
      setSelection(element.parent ? { sorte: "element", id: element.parent } : SELECTION_DU_BUNDLE);
      annoncer(`« ${nomAffiche(element)} » supprimé, avec ce qu’il contenait.`);
    }
  };

  const confirmerLeDeplacement = () => {
    if (!apercu) return;
    const resultat = jouerEtMontrer({ operation: "emboiter", id: apercu.id, parent: apercu.parent });
    setApercu(null);
    if (resultat?.accepte) annoncer(`« ${nomDe(apercu.id)} » déplacé dans « ${nomDe(apercu.parent)} ».`);
  };

  const rangerLeBundle = () => {
    const resultat = jouerEtMontrer({ operation: "mettreEnPage", blocs: ranger(modele, etat.miseEnPage).blocs });
    if (resultat?.accepte && resultat.etat !== etat) annoncer("Bundle rangé : zones dans le sens de la donnée, blocs en grille.");
    else annoncer("Le bundle est déjà rangé.", false);
  };

  // Les familles présentes sur le canevas, dans l'ordre du catalogue, pour la légende.
  const famillesPresentes = useMemo(() => {
    const presentes = new Set<string>();
    if (disposition.compteurs.zones > 0) presentes.add("FAMILLE_PALETTE_ENVIRONNEMENTS");
    if (modele.elements.some((element) => element.sorte === SORTES.SALLE)) presentes.add("FAMILLE_PALETTE_TEMPS_REEL");
    if (disposition.compteurs.composants > 0) presentes.add("FAMILLE_PALETTE_SERVICES_APPLICATIONS");
    return [...catalogue.familles].sort((a, b) => a.ordre - b.ordre).filter((famille) => presentes.has(famille.code));
  }, [catalogue.familles, disposition.compteurs, modele.elements]);

  // Les problèmes connus : ceux de la reprise d'un ancien bundle, tant qu'il n'est pas enregistré.
  const reprise = serveur.origine.sorte === "ANCIEN_FORMAT" ? serveur.origine : null;
  const { verification, verificationPerimee, verificationEnCours, messageDeVerification } = brouillon;
  const groupesDeProblemes = useMemo((): GroupeDeProblemes[] => [
    ...(verification ? [{ titre: verificationPerimee ? "Vérification du serveur (avant vos derniers changements)" : "Vérification du serveur", problemes: verification.problemes }] : []),
    // Les points de la reprise valent tant que le brouillon repris n'a pas été vérifié par le serveur.
    ...(serveur.reprise && !verification ? [{ titre: "Reprise de l’ancienne console", problemes: serveur.reprise.problemes }] : []),
  ], [serveur.reprise, verification, verificationPerimee]);
  // Chaque problème compte pour son élément et pour ceux qui le contiennent : le badge d'un bloc les dit tous.
  const problemesParElement = useMemo(() => {
    const comptes = new Map<string, number>();
    for (const groupe of groupesDeProblemes) {
      for (const probleme of groupe.problemes) {
        const vus = new Set<string>();
        let courant = probleme.element ? parId.get(probleme.element) : undefined;
        while (courant && !vus.has(courant.id)) {
          vus.add(courant.id);
          comptes.set(courant.id, (comptes.get(courant.id) ?? 0) + 1);
          courant = courant.parent ? parId.get(courant.parent) : undefined;
        }
      }
    }
    return comptes;
  }, [groupesDeProblemes, parId]);
  const nombreDeProblemes = groupesDeProblemes.reduce((somme, groupe) => somme + groupe.problemes.length, 0);
  const pointsDeLaReprise = serveur.reprise?.problemes.length ?? 0;

  /** « Vérifier » : ce qu'on voit est enregistré, puis le serveur rend ses problèmes, dans le panneau. */
  const lancerLaVerification = () => {
    setPanneauOuvert(true);
    void verifier();
  };

  /** « Localiser » : l'élément est choisi, et le canevas se centre sur le bloc qui le porte. */
  const localiser = (id: string) => {
    setSelection({ sorte: "element", id });
    const blocs = new Set(disposition.noeuds.map((noeud) => noeud.id));
    let courant = parId.get(id);
    while (courant && !blocs.has(courant.id)) courant = courant.parent ? parId.get(courant.parent) : undefined;
    jetons.current += 1;
    if (courant) setCentrage({ noeud: courant.id, jeton: jetons.current });
  };

  /** Choisir au clavier : la sélection change, l'arborescence s'ouvre jusqu'à elle, le canevas la montre. */
  const choisirAuClavier = (nouvelle: Selection, zone: ZoneDuClavier) => {
    setRefus(null);
    setSelection(nouvelle);
    if (nouvelle.sorte === "bundle") return;
    // Les ancêtres repliés de l'arborescence s'ouvrent : l'élément choisi doit s'y voir.
    const ouvrir = new Set<string>(["bundle"]);
    if (nouvelle.sorte === "liaison") ouvrir.add(CLE_DU_GROUPE_DES_LIAISONS);
    let courant = nouvelle.sorte === "element" ? parId.get(nouvelle.id) : undefined;
    while (courant?.parent) {
      ouvrir.add(cleDeLaSelection({ sorte: "element", id: courant.parent }));
      courant = parId.get(courant.parent);
    }
    setReplies((avant) => new Set([...avant].filter((cle) => !ouvrir.has(cle))));
    if (zone === "arbre") {
      // Le focus suit la sélection dans l'arborescence, une fois la ligne affichée.
      window.requestAnimationFrame(() => racine.current
        ?.querySelector<HTMLElement>(`[data-cle="${cleDeLaSelection(nouvelle)}"]`)?.focus());
    } else if (nouvelle.sorte === "element") {
      localiser(nouvelle.id);
    }
  };

  const agirAuClavier = (action: ActionDuClavier, zone: ZoneDuClavier) => {
    switch (action.sorte) {
      case "annuler":
        annuler();
        return;
      case "retablir":
        retablir();
        return;
      case "naviguer": {
        const suivante = voisin(modele, selection ?? SELECTION_DU_BUNDLE, action.direction);
        if (suivante) choisirAuClavier(suivante, zone);
        return;
      }
      case "ouvrir":
        // Les propriétés de l'élément, sur leur premier champ.
        racine.current?.querySelector<HTMLElement>(".inspector input, .inspector select, .inspector textarea, .inspector button")?.focus();
        return;
      case "fermer":
        // Ce qui est ouvert se ferme d'abord ; ensuite, la sélection se libère.
        if (refus) setRefus(null);
        else if (panneauOuvert) setPanneauOuvert(false);
        else if (guideOuvert) setGuideOuvert(false);
        else setSelection(SELECTION_DU_BUNDLE);
        return;
      case "ajouter":
        if (selection?.sorte !== "liaison") setMenu({ mode: "enfants", parent: selection?.sorte === "element" ? selection.id : null });
        return;
      case "supprimer":
        if (selection) demanderLaSuppression(selection);
        return;
      case "deplacer": {
        if (selection?.sorte !== "element") return;
        const noeud = disposition.noeuds.find((candidat) => candidat.id === selection.id);
        if (!noeud || noeud.type === "bundle") return;
        jouerEtMontrer({ operation: "placer", id: selection.id, position: { x: noeud.position.x + action.dx, y: noeud.position.y + action.dy } });
      }
    }
  };
  useRaccourcis(racine, agirAuClavier);

  // Ce qui est choisi se dit aussi à un lecteur d'écran.
  const descriptionDeLaSelection = !selection || selection.sorte === "bundle"
    ? `Bundle ${modele.bundle.nom}`
    : selection.sorte === "liaison"
      ? (() => {
        const liaison = modele.liaisons.find((candidat) => candidat.id === selection.id);
        return liaison ? `Liaison de ${nomDe(liaison.source)} vers ${nomDe(liaison.destination)}` : "";
      })()
      : cheminDe(modele, selection.id).slice(1).reverse().join(", dans ");

  // D'où vient ce brouillon, en mots, à côté de son code.
  const origineEnMots = serveur.origine.sorte === "ANCIEN_FORMAT"
    ? `Repris de la version ${serveur.origine.numero}`
    : serveur.origine.sorte === "PRESET"
      ? `Depuis le préset ${serveur.origine.slug}`
      : brouillon.revision > 0 ? `Brouillon, révision ${brouillon.revision}` : "Bundle neuf";

  const apercuOuvert = apercu ? apercuDEmboitement(etat, apercu.id, apercu.parent, contexte) : null;
  const zonesDeDepart = useMemo(() => typesDeLaPalette(catalogue).filter((type) => type.sorte === SORTES.ZONE).slice(0, 3), [catalogue]);
  const { compteurs } = disposition;
  const motDeLEnregistrement = enregistrement === "ECHEC" && prochainEssaiDans !== null
    ? `Non enregistré, nouvel essai dans ${prochainEssaiDans} s`
    : MOTS_DE_L_ENREGISTREMENT[enregistrement];

  return (
    <div className="studio-scope studio-scope--editor espace-composition" ref={racine}>
      <main className="studio-shell">
        {reprise && (
          <section className="ec-reprise" aria-label="Reprise d’un bundle de l’ancienne console">
            <History size={14} aria-hidden="true" />
            <span>
              Repris de l’ancienne console, version {reprise.numero}
              {pointsDeLaReprise > 0 ? ` : ${pluriel(pointsDeLaReprise, "point")} à revoir.` : ", sans perte."}
              {" "}L’ancienne version ne change pas ; ce brouillon s’enregistre au premier changement.
            </span>
            {pointsDeLaReprise > 0 && (
              <button type="button" className="ec-lien" onClick={() => setPanneauOuvert(true)}>
                <AlertCircle size={13} aria-hidden="true" /> Voir les points à revoir
              </button>
            )}
          </section>
        )}

        <div className="studio-layout">
          <aside className="library-panel" aria-label="Composants et structure">
            <div className="library-tabs" role="tablist" aria-label="Panneau de gauche">
              <button type="button" role="tab" aria-selected={onglet === "composants"} className={onglet === "composants" ? "is-active" : ""} onClick={() => setOnglet("composants")}>
                <Layers3 size={15} aria-hidden="true" /> Composants
              </button>
              <button type="button" role="tab" aria-selected={onglet === "structure"} className={onglet === "structure" ? "is-active" : ""} onClick={() => setOnglet("structure")}>
                <Cable size={15} aria-hidden="true" /> Structure
              </button>
            </div>
            {onglet === "composants" ? (
              <Palette
                catalogue={catalogue}
                onChoisir={choisirDansLaPalette}
                onDebutDuGlissement={(type) => { setRefus(null); setTypeGlisse(type); }}
                onFinDuGlissement={() => setTypeGlisse(null)}
              />
            ) : (
              <div className="project-tree">
                <p className="project-tree__caption">Hiérarchie réelle du bundle</p>
                <Arborescence
                  modele={modele}
                  selection={selection}
                  onSelectionner={setSelection}
                  replies={replies}
                  onBasculer={(cle) => setReplies((avant) => {
                    const apres = new Set(avant);
                    if (apres.has(cle)) apres.delete(cle); else apres.add(cle);
                    return apres;
                  })}
                />
              </div>
            )}
          </aside>

          <div className="canvas-shell">
            <EspaceComposition
              disposition={disposition}
              modele={modele}
              selection={selection}
              onSelectionner={(choix) => { setRefus(null); setSelection(choix); }}
              compatibles={compatibles}
              objetGlisse={typeGlisse ? { sorte: typeGlisse.sorte as Sorte } : null}
              problemes={problemesParElement}
              nouveaux={nouveaux}
              canauxReliablesDepuis={(canal) => canauxReliables(etat, canal, contexte)}
              refusDUneLiaison={(source, destination) => refusDUneLiaison(etat, source, destination, contexte)}
              onDeposer={(parent, position, point) => {
                if (typeGlisse) ajouterUnType(typeGlisse, parent, position, point);
                setTypeGlisse(null);
              }}
              onDebutDuDeplacement={(id) => { setRefus(null); setDeplacement(id); }}
              onPlacer={(id, position) => { jouerEtMontrer({ operation: "placer", id, position }); }}
              onChangerDeParent={(id, parent, point) => {
                if (parent === null) {
                  // Hors de toute zone : la règle dit pourquoi, et le bloc reste où il était.
                  const essai = apercuDEmboitement(etat, id, null, contexte);
                  if (essai && !essai.resultat.accepte) {
                    setRefus({ message: essai.resultat.refus.message, point, compatibles: essai.resultat.refus.parentsCompatibles });
                  }
                  return;
                }
                const essai = apercuDEmboitement(etat, id, parent, contexte);
                if (essai && !essai.resultat.accepte) {
                  setRefus({ message: essai.resultat.refus.message, point, compatibles: essai.resultat.refus.parentsCompatibles });
                  return;
                }
                setSelection({ sorte: "element", id });
                setApercu({ id, parent });
              }}
              onFinDuDeplacement={() => setDeplacement(null)}
              onRelier={(source, destination, point) => {
                const resultat = jouerEtMontrer({ operation: "relier", source, destination }, point);
                const [liaison] = resultat?.accepte ? resultat.changements.liaisonsAjoutees : [];
                if (liaison) {
                  setSelection({ sorte: "liaison", id: liaison });
                  annoncer(`Liaison créée : ${nomDe(source)} vers ${nomDe(destination)}.`);
                }
              }}
              onLiaisonImpossible={(message, point) => setRefus({ message, point, compatibles: [] })}
              onAjouter={ajouterUneSorte}
              onRetirerUneLiaison={retirerUneLiaison}
              centrage={centrage}
            >
              {compteurs.zones === 0 && (
                <section className="ec-depart" aria-label="Pour commencer">
                  <strong>Commencez par une zone</strong>
                  <p>
                    Une zone est l’endroit où tournent vos programmes : le robot, un serveur, le navigateur de
                    l’opérateur. La salle temps réel arrive avec la première.
                  </p>
                  <div className="ec-depart__choix">
                    {zonesDeDepart.map((type) => (
                      <button key={type.code} type="button" className="secondary-button" onClick={() => ajouterUnType(type, null)}>
                        <Plus size={14} aria-hidden="true" /> {type.nom}
                      </button>
                    ))}
                  </div>
                  <small>Ou glissez une zone depuis la palette, à gauche.</small>
                </section>
              )}
              {disposition.chevauchements.length > 0 && (
                <div className="ec-conseil" role="status">
                  Des blocs se recouvrent : « Ranger » les remet en ordre, et vous pourrez annuler.
                  <button type="button" className="secondary-button" onClick={rangerLeBundle}>
                    <LayoutGrid size={14} aria-hidden="true" /> Ranger
                  </button>
                </div>
              )}
              <Legende familles={famillesPresentes} />
              {guideOuvert && <GuideDuStudio onFermer={() => { retenirLeGuideVu(); setGuideOuvert(false); }} />}
              {panneauOuvert && (
                <PanneauProblemes
                  groupes={groupesDeProblemes}
                  enCours={verificationEnCours}
                  message={messageDeVerification}
                  verifie={verification !== null && !verificationPerimee}
                  nomDe={(id) => (parId.has(id) ? nomDe(id) : null)}
                  onLocaliser={localiser}
                  onFermer={() => setPanneauOuvert(false)}
                />
              )}
              {refus && (
                <div
                  className={`ec-refus${refus.point ? " ec-refus--au-point" : ""}`}
                  role="alert"
                  style={refus.point ? { left: refus.point.x + 14, top: refus.point.y + 14 } : undefined}
                >
                  <p>{refus.message}</p>
                  <button className="icon-button icon-button--tiny" type="button" aria-label="Fermer ce message" onClick={() => setRefus(null)}>
                    <X size={13} aria-hidden="true" />
                  </button>
                </div>
              )}
              {annonce && (
                <div className="toast ec-annonce" role="status" key={annonce.jeton}>
                  <Check size={15} aria-hidden="true" /> {annonce.texte}
                  {annonce.annulable && (
                    <button type="button" className="ec-annonce__annuler" onClick={() => { annuler(); setAnnonce(null); }}>
                      <Undo2 size={13} aria-hidden="true" /> Annuler
                    </button>
                  )}
                </div>
              )}
            </EspaceComposition>
          </div>

          <Inspecteur
            etat={etat}
            catalogue={catalogue}
            contexte={contexte}
            selection={selection}
            reglageDe={reglageDe}
            reglageDuBundle={reglageDuBundle}
            onAjouter={(parent) => setMenu({ mode: "enfants", parent })}
            onAjouterUnCanal={(bus, entree) => ajouterUneSorte(entree ? SORTES.CANAL_RECEPTION : SORTES.CANAL_EMISSION, bus)}
            onChangerDeParent={(id, parent) => setApercu({ id, parent })}
            onSupprimer={demanderLaSuppression}
          />
        </div>

        {/* La barre du haut vient après les trois colonnes dans la page, et s'affiche en haut : Tab parcourt
            ainsi la palette, l'arborescence, le canevas, les propriétés, puis la barre (conception, partie 6.5). */}
        <header className="studio-topbar">
          <Link to="/studio" className="back-button" aria-label="Revenir à la liste des bundles" title="Revenir à la liste des bundles">
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <div className="topbar-divider" />
          <div className="project-heading">
            <span>Bundle</span>
            <strong>{modele.bundle.nom}</strong>
          </div>
          <div className="ec-identite-du-bundle">
            <code className="ec-code-du-bundle" title="Identifiant technique du bundle">{modele.bundle.code}</code>
            <span className="ec-origine">{origineEnMots}</span>
          </div>
          <span className={`save-state ec-etat-enregistrement ec-etat-enregistrement--${enregistrement.toLowerCase()}`} role="status" title={messageDEnregistrement ?? undefined}>
            {enregistrement === "ENREGISTRE" && <Check size={13} aria-hidden="true" />}
            {enregistrement === "EN_COURS" && <LoaderCircle className="spin" size={13} aria-hidden="true" />}
            {" "}{motDeLEnregistrement}
          </span>
          {(enregistrement === "ECHEC" || enregistrement === "REFUSE") && (
            <button className="secondary-button ec-reessayer" type="button" onClick={() => void reessayer()} title={messageDEnregistrement ?? undefined}>
              <RotateCw size={14} aria-hidden="true" /> Réessayer
            </button>
          )}
          <div className="topbar-actions">
            <div className="ec-historique" role="group" aria-label="Historique des gestes">
              <button className="secondary-button ec-bouton-icone" type="button" onClick={annuler} disabled={!historique || !peutAnnuler(historique)}
                aria-label="Annuler" title="Annuler le dernier geste (Ctrl+Z)">
                <Undo2 size={16} aria-hidden="true" />
              </button>
              <button className="secondary-button ec-bouton-icone" type="button" onClick={retablir} disabled={!historique || !peutRetablir(historique)}
                aria-label="Rétablir" title="Rétablir le geste annulé (Ctrl+Maj+Z ou Ctrl+Y)">
                <Redo2 size={16} aria-hidden="true" />
              </button>
            </div>
            <button className="secondary-button" type="button" onClick={rangerLeBundle} title="Ranger les zones et les blocs proprement (vous pourrez annuler)">
              <LayoutGrid size={15} aria-hidden="true" /> Ranger
            </button>
            <button className="secondary-button" type="button" onClick={() => setGuideOuvert((ouvert) => !ouvert)} aria-expanded={guideOuvert}>
              <CircleHelp size={15} aria-hidden="true" /> Guide
            </button>
            <button
              className={`primary-button validation-button${verification && verification.erreurs > 0 ? " has-errors" : ""}`}
              type="button"
              onClick={lancerLaVerification}
              disabled={verificationEnCours}
              title="Le serveur relit le brouillon enregistré et dit ce qu’il reste à corriger ; rien n’est publié ni déployé"
            >
              {verificationEnCours ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <AlertCircle size={15} aria-hidden="true" />}
              {" "}Vérifier {nombreDeProblemes > 0 && <b aria-label={`${nombreDeProblemes} problème${nombreDeProblemes > 1 ? "s" : ""}`}>{nombreDeProblemes}</b>}
            </button>
            <MenuDuBundle bundleId={serveur.bundle_id} nomDuBundle={modele.bundle.nom} />
          </div>
        </header>

        <footer className="studio-statusbar">
          <span><i className={`status-dot ${enregistrement === "ENREGISTRE" ? "status-dot--online" : "ec-point-attente"}`} /> {motDeLEnregistrement}</span>
          <span>{pluriel(compteurs.zones, "zone")}</span>
          <span>{pluriel(compteurs.composants, "composant")}</span>
          <span>{pluriel(compteurs.unites, "unité")}</span>
          <span>{compteurs.liaisons} liaison{compteurs.liaisons > 1 ? "s" : ""} de données</span>
          <span className="statusbar-spacer" />
          {disposition.nonAffiches.length > 0 && (
            <span className="ec-pied__alerte">{pluriel(disposition.nonAffiches.length, "élément")} hors de sa place, non dessiné</span>
          )}
        </footer>
      </main>

      <p className="ec-invisible" aria-live="polite">Choisi : {descriptionDeLaSelection}</p>
      {brouillon.propositionDeReprise && (
        <RepriseBrouillonLocal
          proposition={brouillon.propositionDeReprise}
          nomDuBundle={modele.bundle.nom}
          copieEnTexte={copieLocaleEnTexte() ?? ""}
          onReprendre={reprendreLaCopieLocale}
          onAbandonner={abandonnerLaCopieLocale}
          onRemplacer={() => void remplacerLaVersionDuServeur()}
        />
      )}
      {enregistrement === "CONFLIT" && (
        <ConflitEnregistrement
          base={brouillon.base}
          present={etat}
          serveur={brouillon.versionEnConflit}
          message={messageDEnregistrement}
          onOuvrirLaVersionDuServeur={() => void ouvrirLaVersionDuServeur()}
          onRemplacer={() => void remplacerLaVersionDuServeur()}
        />
      )}
      {menuOuvert && (
        <MenuAjouter
          surtitre={menuOuvert.surtitre}
          titre={menuOuvert.titre}
          explication={menuOuvert.explication}
          choix={menuOuvert.choix}
          cleVisee={null}
          siVide={menuOuvert.siVide}
          onChoisir={choisirDansLeMenu}
          onFermer={() => setMenu(null)}
        />
      )}
      {apercu && apercuOuvert && (
        <ApercuChangementParent modele={modele} apercu={apercuOuvert} onConfirmer={confirmerLeDeplacement} onFermer={() => setApercu(null)} />
      )}
      {suppression && (
        <ConfirmationSuppression modele={modele} cible={suppression} onConfirmer={confirmerLaSuppression} onFermer={() => setSuppression(null)} />
      )}
    </div>
  );
}
