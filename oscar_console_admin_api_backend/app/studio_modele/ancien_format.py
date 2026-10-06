"""L'adaptateur de l'ancien format : un bundle de l'ancienne console, relu au nouveau.

Une seule fonction, brouillon_depuis_ancien_format, qui lit une composition de
l'ancien Studio (des blocs et des traits de React Flow : `nodes`, `edges`) et
rend le modèle au nouveau format (oscar.bundle/1), sa mise en page, et un
rapport de reprise. La table de correspondance, champ par champ, est l'annexe A
de la conception du lot L1.

Trois promesses :
- lecture seule : la composition reçue n'est jamais modifiée, et rien n'est
  écrit en base ici ; la version de l'ancien format reste telle quelle ;
- sans perte : ce qui n'a pas encore sa place dans le modèle est gardé dans
  `donnees_reprises` de l'élément, ou dans le rapport (`non_repris` avec sa
  raison, `non_classes` pour les objets d'origine qu'on n'a pas su placer) ;
- rien de deviné : un environnement inconnu donne une zone « à préciser », une
  liaison dont on ne retrouve pas les deux canaux exacts devient un problème.

Elle est déterministe : les identifiants qu'elle crée se déduisent de ceux
qu'elle lit (zon-ancien-robot, trt-<id de l'unité>...), si bien que deux
lectures du même bundle rendent le même document, octet pour octet.

Cet adaptateur disparaîtra quand plus aucun bundle ne sera à l'ancien format.
"""

import copy
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from ..bundle_spec import KIND_BUNDLE, convertir_composition
from .brouillons import PREFIXE_DU_BUNDLE, code_depuis_nom
from .formats import (
    FORMAT_DE_LA_MISE_EN_PAGE, FORMAT_DU_BUNDLE, LONGUEUR_CODE, LONGUEUR_DESCRIPTION, LONGUEUR_IDENTIFIANT,
    LONGUEUR_NOM, MOTIF_CODE, MOTIF_IDENTIFIANT, OBLIGATOIRE, ModeleBundle,
)
from .regles import verifier_modele
from .sortes import (
    APPLICATION, BANDE, BUS_EMISSION, BUS_RECEPTION, CANAL_EMISSION, CANAL_RECEPTION, INTERFACE, SALLE,
    SERVICE, TRAITEMENT, UNITE, ZONE,
)
from .verification import AVERTISSEMENT, ERREUR, probleme

_CODE = re.compile(MOTIF_CODE)
_IDENTIFIANT = re.compile(MOTIF_IDENTIFIANT)

# Les environnements de l'ancien Studio qui ont une zone à eux.
ZONES_CONNUES = {
    "ENVIRONNEMENT_EXECUTION_ROBOT": ("zon-ancien-robot", "ZONE_ENVIRONNEMENT_EXECUTION_ROBOT", "Robot",
                                      "TYPE_ENVIRONNEMENT_EXECUTION_ROBOT", (SERVICE,)),
    "ENVIRONNEMENT_EXECUTION_SERVEUR": ("zon-ancien-serveur", "ZONE_ENVIRONNEMENT_EXECUTION_SERVEUR", "Serveur",
                                        "TYPE_ENVIRONNEMENT_EXECUTION_SERVEUR", (SERVICE,)),
    "ENVIRONNEMENT_EXECUTION_NAVIGATEUR_WEB": ("zon-ancien-navigateur-web",
                                               "ZONE_ENVIRONNEMENT_EXECUTION_NAVIGATEUR_WEB", "Application web",
                                               "TYPE_ENVIRONNEMENT_EXECUTION_NAVIGATEUR_WEB", (APPLICATION,)),
}
# Tout le reste (l'ancienne « application métier », une valeur inconnue ou
# absente) va dans une seule zone « à préciser », sans type.
ZONE_A_PRECISER = ("zon-ancien-a-preciser", "ZONE_ENVIRONNEMENT_EXECUTION_A_PRECISER", "À préciser")

SALLE_REPRISE = {"id": "sal-ancien", "sorte": SALLE, "parent": None, "code": "COMPOSANT_SALLE_TEMPS_REEL",
                 "nom": "Salle temps réel", "type": {"code": "COMPOSANT_SALLE_TEMPS_REEL", "version": "1.0.0"}}

VERSION_DES_TYPES = "1.0.0"
TYPES_DES_COMPOSANTS = {"INSTANCE_SERVICE": (SERVICE, "TYPE_SERVICE_GENERIQUE"),
                        "INSTANCE_APPLICATION": (APPLICATION, "TYPE_APPLICATION_GENERIQUE")}
TYPE_D_UNITE_PAR_DEFAUT = "TYPE_UNITE_STANDARD"

# La place d'un bloc dans sa zone : le plus en haut à gauche se pose au bord
# intérieur de la zone, sous son titre ; les autres gardent leur écart.
MARGE_X, MARGE_Y = 24, 64

# Ce que l'adaptateur ne reprend pas, et pourquoi.
RAISON_REACT_FLOW = "état de l'ancien canevas (React Flow), recalculé par le nouvel écran"
RAISON_STATUT = "état choisi à la main dans l'ancien Studio ; le nouvel état vient de la vérification"
RAISON_EXPANDED = "affichage propre à chacun, gardé dans le navigateur"
RAISON_DIRECTION = "le sens d'un canal se déduit de son bus"
RAISON_STRUCTURE = "le contenant les remplace : le bundle contient les zones, qui contiennent les blocs"
RAISON_CADRE = ("le bundle est le cadre du canevas, pas un élément : il n'a ni identifiant d'élément, "
                "ni position, ni environnement")
RAISON_TRAIT = "dessin de l'ancien trait"

# Pour chaque objet de l'ancien format : les champs lus pour le modèle, ceux
# qui ne sont pas repris (avec leur raison), et ceux gardés dans
# `donnees_reprises`. Un champ qui n'est dans aucune liste est gardé aussi :
# rien ne se perd.
CHAMPS_DU_NOEUD_LUS = ("id", "data", "position")
CHAMPS_DU_NOEUD_NON_REPRIS = {"type": RAISON_REACT_FLOW, "measured": RAISON_REACT_FLOW,
                              "selected": RAISON_REACT_FLOW, "dragging": RAISON_REACT_FLOW,
                              "width": RAISON_REACT_FLOW, "height": RAISON_REACT_FLOW}
CHAMPS_DU_BLOC_LUS = ("kind", "technicalCode", "name", "description", "target", "units")
CHAMPS_DU_BLOC_NON_REPRIS = {"status": RAISON_STATUT, "expanded": RAISON_EXPANDED}
CHAMPS_DE_L_UNITE_LUS = ("id", "technicalCode", "name", "unitType", "processingName", "interfaceName",
                         "dataBandName", "receiveBusName", "sendBusName", "inputs", "outputs")
CHAMPS_DE_L_UNITE_NON_REPRIS = {"expanded": RAISON_EXPANDED}
CHAMPS_DU_CANAL_LUS = ("id", "technicalCode", "name", "description", "channelType", "dataFormat")
CHAMPS_DU_CANAL_NON_REPRIS = {"direction": RAISON_DIRECTION}
CHAMPS_DE_LA_LIAISON_LUS = ("id", "source", "target", "sourceHandle", "targetHandle", "data")
CHAMPS_DE_LA_LIAISON_NON_REPRIS = {"type": RAISON_TRAIT, "style": RAISON_TRAIT, "animated": RAISON_TRAIT,
                                   "markerEnd": RAISON_TRAIT, "selectable": RAISON_TRAIT}

# La structure d'une unité : sorte, préfixe de l'identifiant, champ de
# l'ancien format, code si le champ manque, parent (par son préfixe).
STRUCTURE_D_UNE_UNITE = (
    (TRAITEMENT, "trt", "processingName", "TRAITEMENT_METIER_UNITE_PRINCIPAL", None),
    (INTERFACE, "itf", "interfaceName", "INTERFACE_COMMUNICATION_UNITE_PRINCIPALE", None),
    (BANDE, "bnd", "dataBandName", "BANDE_DONNEES_PRINCIPALE", "itf"),
    (BUS_RECEPTION, "bre", "receiveBusName", "BUS_RECEPTION_PRINCIPAL", "bnd"),
    (BUS_EMISSION, "bem", "sendBusName", "BUS_EMISSION_PRINCIPAL", "bnd"),
)


@dataclass
class Reprise:
    """Le modèle, la mise en page, et le rapport de la reprise."""

    modele: dict
    mise_en_page: dict
    rapport: dict = field(default_factory=dict)


class _Adaptation:
    def __init__(self, codes_publies: Mapping[str, int], catalogue: Mapping[tuple[str, str], dict]):
        self.codes_publies = codes_publies
        self.catalogue = catalogue
        self.elements: list[dict] = []
        self.liaisons: list[dict] = []
        self.blocs: dict[str, dict] = {}
        self.problemes: list[dict] = []
        self.non_repris: list[dict] = []
        self.non_classes: list[dict] = []
        self.zones: dict[str, dict] = {}

    # ---- le rapport ------------------------------------------------------- #
    def ne_pas_reprendre(self, chemin: str, valeur: Any, raison: str) -> None:
        self.non_repris.append({"champ": chemin, "valeur": copy.deepcopy(valeur), "raison": raison})

    def ne_pas_classer(self, objet: Any, raison: str) -> None:
        self.non_classes.append({"objet": copy.deepcopy(objet), "raison": raison})

    def signaler(self, niveau: str, code: str, explication: str, element: str | None) -> None:
        self.problemes.append(probleme(niveau, code, explication, element))

    # ---- les valeurs ------------------------------------------------------ #
    def code(self, valeur: Any, chemin: str, prefixe: str, a_defaut: str) -> str:
        """Le code d'origine s'il est lisible ; sinon un code tiré de lui, et
        le code d'origine gardé dans le rapport."""
        if valeur is None or valeur == "":
            return a_defaut
        if isinstance(valeur, str) and _CODE.fullmatch(valeur) and len(valeur) <= LONGUEUR_CODE:
            return valeur
        remplace = code_depuis_nom(prefixe, str(valeur))
        self.ne_pas_reprendre(chemin, valeur, f"code illisible au nouveau format, remplacé par {remplace}")
        return remplace

    def nom(self, valeur: Any, chemin: str, a_defaut: str) -> str:
        if not isinstance(valeur, str) or not valeur.strip():
            return a_defaut
        if len(valeur) > LONGUEUR_NOM:
            self.ne_pas_reprendre(chemin, valeur, f"nom de plus de {LONGUEUR_NOM} caractères, raccourci")
            return valeur[:LONGUEUR_NOM]
        return valeur

    def identifiant(self, valeur: Any, a_defaut: str) -> str:
        if isinstance(valeur, str) and _IDENTIFIANT.fullmatch(valeur) and len(valeur) <= LONGUEUR_IDENTIFIANT:
            return valeur
        return a_defaut

    def description(self, valeur: Any, chemin: str) -> str | None:
        if not isinstance(valeur, str):
            if valeur is not None:
                self.ne_pas_reprendre(chemin, valeur, "description qui n'est pas un texte")
            return None
        if len(valeur) > LONGUEUR_DESCRIPTION:
            self.ne_pas_reprendre(chemin, valeur, f"description de plus de {LONGUEUR_DESCRIPTION} caractères, "
                                                  "raccourcie")
            return valeur[:LONGUEUR_DESCRIPTION]
        return valeur

    def ajouter(self, element: dict) -> dict:
        if element["code"] in self.codes_publies:
            # Ce code figure déjà dans une version publiée : il ne change plus.
            element["code_fige"] = True
        self.elements.append(element)
        return element

    @staticmethod
    def reste(objet: dict, lus: tuple[str, ...], non_repris: Mapping[str, str]) -> dict:
        """Ce qu'un objet porte en plus des champs lus et non repris."""
        return {cle: copy.deepcopy(valeur) for cle, valeur in objet.items() if cle not in lus and cle not in non_repris}

    def non_repris_de(self, objet: dict, chemin: str, non_repris: Mapping[str, str]) -> None:
        for cle, raison in non_repris.items():
            if cle in objet:
                self.ne_pas_reprendre(f"{chemin}/{cle}", objet[cle], raison)

    # ---- les zones -------------------------------------------------------- #
    def zone_pour(self, cible: Any, sorte: str, nom: str, element_id: str) -> tuple[dict, bool]:
        """La zone où ranger un composant, et si c'est celle de son environnement."""
        connue = ZONES_CONNUES.get(cible) if isinstance(cible, str) else None
        if connue is not None and sorte in connue[4]:
            identifiant, code, nom_de_zone, type_, _ = connue
            if identifiant not in self.zones:
                self.zones[identifiant] = {
                    "id": identifiant, "sorte": ZONE, "parent": None, "code": code, "nom": nom_de_zone,
                    "type": {"code": type_, "version": VERSION_DES_TYPES},
                    "reglages": {"exigence": OBLIGATOIRE}}
            return self.zones[identifiant], True
        if connue is not None:
            # Un service marqué pour un navigateur, une application pour un
            # robot : la zone de son environnement ne le reçoit pas.
            self.signaler(AVERTISSEMENT, "COMPOSANT_A_PLACER",
                          f"« {nom} » était marqué pour l'environnement {cible}, dont la zone ne reçoit pas ce "
                          "genre de composant : il est rangé dans la zone à préciser.", element_id)
        identifiant, code, nom_de_zone = ZONE_A_PRECISER
        if identifiant not in self.zones:
            self.zones[identifiant] = {"id": identifiant, "sorte": ZONE, "parent": None, "code": code,
                                       "nom": nom_de_zone, "reglages": {"exigence": OBLIGATOIRE}}
            self.signaler(ERREUR, "ZONE_A_PRECISER",
                          "Dites si ce qu'elle contient fonctionne dans un navigateur, sur un ordinateur, sur un "
                          "mobile ou sur un serveur.", identifiant)
        return self.zones[identifiant], False


def _liste(objet: Any, cle: str) -> list:
    valeur = objet.get(cle) if isinstance(objet, dict) else None
    return valeur if isinstance(valeur, list) else []


def _donnees(noeud: Any) -> dict:
    donnees = noeud.get("data") if isinstance(noeud, dict) else None
    return donnees if isinstance(donnees, dict) else {}


def _reprendre_un_canal(a: _Adaptation, canal: dict, chemin: str, sorte: str, bus_id: str,
                        canaux: dict[tuple[str, str], tuple[str, str]], unite_id_ancien: str) -> None:
    prefixe = "CANAL_RECEPTION" if sorte == CANAL_RECEPTION else "CANAL_EMISSION"
    identifiant = a.identifiant(canal.get("id"), f"can-{bus_id}-{len(a.elements)}")
    code = a.code(canal.get("technicalCode"), f"{chemin}/technicalCode", prefixe, prefixe)
    element = {"id": identifiant, "sorte": sorte, "parent": bus_id, "code": code,
               "nom": a.nom(canal.get("name"), f"{chemin}/name", code)}
    description = a.description(canal.get("description"), f"{chemin}/description")
    if description is not None:
        element["description"] = description
    reglages = {cle: canal[ancien] for cle, ancien in (("type", "channelType"), ("format", "dataFormat"))
                if ancien in canal}
    if reglages:
        element["reglages"] = reglages
    a.non_repris_de(canal, chemin, CHAMPS_DU_CANAL_NON_REPRIS)
    reste = a.reste(canal, CHAMPS_DU_CANAL_LUS, CHAMPS_DU_CANAL_NON_REPRIS)
    if reste:
        element["donnees_reprises"] = reste
    a.ajouter(element)
    # Pour retrouver le canal d'une poignée « in:<unité>:<canal> ».
    canaux[(unite_id_ancien, str(canal.get("id")))] = (identifiant, sorte)


def _reprendre_une_unite(a: _Adaptation, unite: dict, chemin: str, parent_id: str,
                         canaux: dict[tuple[str, str], tuple[str, str]]) -> None:
    identifiant = a.identifiant(unite.get("id"), f"uni-{parent_id}-{len(a.elements)}")
    code = a.code(unite.get("technicalCode"), f"{chemin}/technicalCode", "INSTANCE_UNITE_CONFIGUREE",
                  "INSTANCE_UNITE_CONFIGUREE")
    donnees_reprises = a.reste(unite, CHAMPS_DE_L_UNITE_LUS, CHAMPS_DE_L_UNITE_NON_REPRIS)
    type_ancien = unite.get("unitType")
    definition = a.catalogue.get((type_ancien, VERSION_DES_TYPES)) if isinstance(type_ancien, str) else None
    if definition is not None and definition.get("sorte") == UNITE:
        type_ = type_ancien
    else:
        type_ = TYPE_D_UNITE_PAR_DEFAUT
        if type_ancien is not None:
            donnees_reprises["type_ancien"] = type_ancien
            a.signaler(AVERTISSEMENT, "TYPE_A_CONFIRMER",
                       f"L'unité « {unite.get('name') or code} » avait le type {type_ancien}, qui n'est pas au "
                       f"catalogue : elle est reprise en {TYPE_D_UNITE_PAR_DEFAUT}.", identifiant)
    element = {"id": identifiant, "sorte": UNITE, "parent": parent_id, "code": code,
               "nom": a.nom(unite.get("name"), f"{chemin}/name", code),
               "type": {"code": type_, "version": VERSION_DES_TYPES}}
    if donnees_reprises:
        element["donnees_reprises"] = donnees_reprises
    a.non_repris_de(unite, chemin, CHAMPS_DE_L_UNITE_NON_REPRIS)
    a.ajouter(element)

    # La structure : une chaîne de l'ancien format devient un vrai élément.
    ids = {}
    for sorte, prefixe, champ, a_defaut, parent in STRUCTURE_D_UNE_UNITE:
        ids[prefixe] = f"{prefixe}-{identifiant}"
        a.ajouter({"id": ids[prefixe], "sorte": sorte, "parent": ids[parent] if parent else identifiant,
                   "code": a.code(unite.get(champ), f"{chemin}/{champ}", sorte, a_defaut)})
    for champ, sorte, bus in (("inputs", CANAL_RECEPTION, "bre"), ("outputs", CANAL_EMISSION, "bem")):
        for numero, canal in enumerate(_liste(unite, champ)):
            if isinstance(canal, dict):
                _reprendre_un_canal(a, canal, f"{chemin}/{champ}/{numero}", sorte, ids[bus], canaux,
                                    str(unite.get("id")))
            else:
                a.ne_pas_classer(canal, "un canal illisible")


def _poignee(poignee: Any) -> tuple[str, str] | None:
    """(unité, canal) d'une poignée « in:<unité>:<canal> » ou « out:... »."""
    if not isinstance(poignee, str):
        return None
    morceaux = poignee.split(":")
    return (morceaux[1], morceaux[2]) if len(morceaux) == 3 else None


def brouillon_depuis_ancien_format(spec: Any, codes_publies: Mapping[str, int],
                                   catalogue: Mapping[tuple[str, str], dict],
                                   entete: dict | None = None) -> Reprise:
    """Le brouillon au nouveau format d'une composition de l'ancien Studio.

    `codes_publies` : les codes déjà publiés du bundle (ils deviennent figés).
    `catalogue` : les définitions des types, par (code, version).
    `entete` : le code, le nom et la description à donner au bundle, quand ce
    n'est pas celui de la composition (un préset copié dans un bundle neuf).
    """
    a = _Adaptation(codes_publies, catalogue)
    # D'abord au format « unité », même pour une composition d'avant le renommage.
    composition = convertir_composition(copy.deepcopy(spec))
    noeuds = _liste(composition, "nodes")
    positions: dict[str, tuple[str, float, float]] = {}
    canaux: dict[tuple[str, str], tuple[str, str]] = {}
    lu_entete: dict | None = None
    chemin_du_bundle = ""

    for numero, noeud in enumerate(noeuds):
        chemin = f"/nodes/{numero}"
        donnees = _donnees(noeud)
        if not isinstance(noeud, dict) or not donnees:
            a.ne_pas_classer(noeud, "un bloc sans contenu lisible")
            continue
        sorte_ancienne = donnees.get("kind")
        if sorte_ancienne == KIND_BUNDLE:
            if lu_entete is not None:
                a.ne_pas_classer(noeud, "un bundle n'a qu'un cadre : ce bloc en était un deuxième")
                a.signaler(AVERTISSEMENT, "PLUSIEURS_BUNDLES",
                           f"La composition avait plusieurs blocs « bundle » ; seul le premier est repris, "
                           f"« {donnees.get('name') or noeud.get('id')} » est gardé dans le rapport.", None)
                continue
            chemin_du_bundle = chemin
            lu_entete = {"code": a.code(donnees.get("technicalCode"), f"{chemin}/data/technicalCode",
                                        PREFIXE_DU_BUNDLE, PREFIXE_DU_BUNDLE),
                         "nom": a.nom(donnees.get("name"), f"{chemin}/data/name", "Bundle repris")}
            description = a.description(donnees.get("description"), f"{chemin}/data/description")
            if description is not None:
                lu_entete["description"] = description
            for cle in ("id", "position", "type", "measured", "selected", "dragging", "width", "height"):
                if cle in noeud:
                    a.ne_pas_reprendre(f"{chemin}/{cle}", noeud[cle], RAISON_CADRE if cle in ("id", "position")
                                       else RAISON_REACT_FLOW)
            for cle, valeur in donnees.items():
                if cle not in ("kind", "technicalCode", "name", "description"):
                    a.ne_pas_reprendre(f"{chemin}/data/{cle}", valeur,
                                       RAISON_STATUT if cle == "status" else RAISON_CADRE)
            for cle, valeur in noeud.items():
                if cle not in CHAMPS_DU_NOEUD_LUS and cle not in CHAMPS_DU_NOEUD_NON_REPRIS:
                    a.ne_pas_reprendre(f"{chemin}/{cle}", valeur, RAISON_REACT_FLOW)
            continue
        if sorte_ancienne not in TYPES_DES_COMPOSANTS:
            a.ne_pas_classer(noeud, f"sorte de bloc inconnue : {sorte_ancienne}")
            a.signaler(AVERTISSEMENT, "SORTE_INCONNUE",
                       f"Le bloc « {donnees.get('name') or noeud.get('id')} » est d'une sorte que le nouveau Studio "
                       f"ne connaît pas ({sorte_ancienne}) : il est gardé dans le rapport.", None)
            continue

        # Un service ou une application, dans la zone de son environnement.
        sorte, type_ = TYPES_DES_COMPOSANTS[sorte_ancienne]
        prefixe = "INSTANCE_SERVICE" if sorte == SERVICE else "INSTANCE_APPLICATION"
        identifiant = a.identifiant(noeud.get("id"), f"cmp-{numero}")
        code = a.code(donnees.get("technicalCode"), f"{chemin}/data/technicalCode", prefixe, prefixe)
        nom = a.nom(donnees.get("name"), f"{chemin}/data/name", code)
        zone, dans_son_environnement = a.zone_pour(donnees.get("target"), sorte, nom, identifiant)
        element = {"id": identifiant, "sorte": sorte, "parent": zone["id"], "code": code, "nom": nom,
                   "type": {"code": type_, "version": VERSION_DES_TYPES}}
        description = a.description(donnees.get("description"), f"{chemin}/data/description")
        if description is not None:
            element["description"] = description
        reste = a.reste(donnees, CHAMPS_DU_BLOC_LUS, CHAMPS_DU_BLOC_NON_REPRIS)
        if not dans_son_environnement and "target" in donnees:
            # L'environnement d'origine aidera à choisir le type de la zone.
            reste["target"] = donnees["target"]
        if reste:
            # La Box IA, la mise en route et ce que l'ancien bloc portait d'autre.
            element["donnees_reprises"] = reste
        a.non_repris_de(donnees, f"{chemin}/data", CHAMPS_DU_BLOC_NON_REPRIS)
        a.non_repris_de(noeud, chemin, CHAMPS_DU_NOEUD_NON_REPRIS)
        for cle, valeur in noeud.items():
            if cle not in CHAMPS_DU_NOEUD_LUS and cle not in CHAMPS_DU_NOEUD_NON_REPRIS:
                a.ne_pas_reprendre(f"{chemin}/{cle}", valeur, RAISON_REACT_FLOW)
        a.ajouter(element)
        position = noeud.get("position")
        if isinstance(position, dict) and all(isinstance(position.get(c), (int, float))
                                              and not isinstance(position.get(c), bool) for c in ("x", "y")):
            positions[identifiant] = (zone["id"], position["x"], position["y"])
        elif "position" in noeud:
            a.ne_pas_reprendre(f"{chemin}/position", position, "position illisible ; le bloc sera placé seul")
        for rang, unite in enumerate(_liste(donnees, "units")):
            if isinstance(unite, dict):
                _reprendre_une_unite(a, unite, f"{chemin}/data/units/{rang}", identifiant, canaux)
            else:
                a.ne_pas_classer(unite, "une unité illisible")

    # Les liaisons de données, d'un canal exact à un autre.
    for numero, lien in enumerate(_liste(composition, "edges")):
        chemin = f"/edges/{numero}"
        genre = _donnees(lien).get("edgeKind")
        if genre == "STRUCTURE":
            a.ne_pas_reprendre(chemin, lien, RAISON_STRUCTURE)
            continue
        if genre != "DONNEES":
            a.ne_pas_classer(lien, f"trait d'une sorte inconnue : {genre}")
            continue
        source = canaux.get(_poignee(lien.get("sourceHandle")) or ("", ""))
        destination = canaux.get(_poignee(lien.get("targetHandle")) or ("", ""))
        identifiant = a.identifiant(lien.get("id"), f"lia-{numero}")
        if source is None or destination is None or source[1] != CANAL_EMISSION \
                or destination[1] != CANAL_RECEPTION:
            # Jamais deviné : une liaison qui ne désigne pas deux canaux exacts,
            # dans le bon sens, est gardée dans le rapport pour être refaite.
            a.ne_pas_classer(lien, "liaison dont un canal manque, ou dans le mauvais sens")
            a.signaler(AVERTISSEMENT, "LIAISON_A_RECONSTRUIRE",
                       "Une liaison de l'ancien Studio ne désigne pas une sortie et une entrée qui existent : "
                       "elle n'est pas reprise. Refaites-la entre les deux bons canaux.", identifiant)
            continue
        a.liaisons.append({"id": identifiant, "source": source[0], "destination": destination[0]})
        a.non_repris_de(lien, chemin, CHAMPS_DE_LA_LIAISON_NON_REPRIS)
        for cle, valeur in lien.items():
            if cle not in CHAMPS_DE_LA_LIAISON_LUS and cle not in CHAMPS_DE_LA_LIAISON_NON_REPRIS:
                a.ne_pas_reprendre(f"{chemin}/{cle}", valeur, RAISON_TRAIT)

    # Les zones d'abord, la salle posée avec la première, puis le contenu.
    zones = list(a.zones.values())
    debut = zones[:1] + ([dict(SALLE_REPRISE)] if zones else []) + zones[1:]
    for element in debut:
        if element["code"] in a.codes_publies:
            element["code_fige"] = True
    elements = debut + a.elements

    # Chaque bloc ramené dans sa zone, en gardant l'ordre visuel d'origine.
    for zone_id in a.zones:
        dans_la_zone = {i: (x, y) for i, (z, x, y) in positions.items() if z == zone_id}
        if dans_la_zone:
            x0 = min(x for x, _ in dans_la_zone.values())
            y0 = min(y for _, y in dans_la_zone.values())
            for identifiant, (x, y) in dans_la_zone.items():
                a.blocs[identifiant] = {"x": x - x0 + MARGE_X, "y": y - y0 + MARGE_Y}

    modele = {"format": FORMAT_DU_BUNDLE,
              "bundle": entete or lu_entete or {"code": PREFIXE_DU_BUNDLE, "nom": "Bundle repris"},
              "elements": elements, "liaisons": a.liaisons}
    if entete is not None and lu_entete is not None:
        a.ne_pas_reprendre(f"{chemin_du_bundle}/data", lu_entete,
                           "le bundle créé garde son propre nom et son propre code")

    # Ce que les règles du modèle refuseraient encore : à corriger avant d'enregistrer.
    for refus in verifier_modele(ModeleBundle.model_validate(modele), catalogue):
        a.signaler(ERREUR, refus.code, refus.message, refus.element)

    mise_en_page = {"format": FORMAT_DE_LA_MISE_EN_PAGE, "blocs": a.blocs}
    rapport = {"problemes": a.problemes, "non_repris": a.non_repris, "non_classes": a.non_classes}
    return Reprise(modele=modele, mise_en_page=mise_en_page, rapport=rapport)
