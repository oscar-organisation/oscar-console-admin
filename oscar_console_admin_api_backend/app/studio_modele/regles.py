"""Les règles du modèle d'un bundle (conception du lot L1, partie 3.4).

Un document au bon format (formats.py) peut encore être faux : un service posé
hors d'une zone, deux salles, un canal de réception dans un bus d'émission...
verifier_modele relit TOUT le document et rend la liste de ses refus, chacun
avec son code, son message en français (qui dit quoi faire), l'élément en cause
et, pour un placement, les parents où il pourrait aller. Une liste vide veut
dire : accepté.

Le serveur la joue à chaque enregistrement, quoi que le navigateur ait déjà
vérifié : c'est lui qui fait foi. Le navigateur joue les mêmes règles après
chaque geste ; un même fichier de cas, pris aux formats OSCAR, vérifie que les
deux rendent le même verdict (tests/test_studio_regles_du_modele.py).

Ce que reçoit chaque type de zone vient du catalogue (le champ « recoit » de
chaque type d'environnement) ; le reste de l'emboîtement est la table 3.4,
écrite ci-dessous dans PARENTS_PERMIS.
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from .formats import FACULTATIVE, Element, ModeleBundle
from .sortes import (
    APPLICATION, BANDE, BUS_EMISSION, BUS_RECEPTION, CANAL_EMISSION, CANAL_RECEPTION, INTERFACE, SALLE,
    SERVICE, TRAITEMENT, UNITE, ZONE,
)

TYPE_ZONE_EXTERNE = "TYPE_ENVIRONNEMENT_EXECUTION_EXTERNE"

# Les dix-neuf règles, dans l'ordre de la table 3.4 (et du fichier des cas).
INVARIANTS = (
    "SERVICE_HORS_ZONE", "ZONE_INCOMPATIBLE", "ZONE_DANS_UNE_ZONE", "SALLE_EN_DOUBLE", "SALLE_SANS_ZONE",
    "ZONE_EXTERNE_EN_DOUBLE", "ZONE_EXTERNE_RESERVEE", "UNITE_HORS_COMPOSANT", "STRUCTURE_FIXE",
    "CANAL_MAUVAIS_BUS", "PARENT_INCOMPATIBLE", "PARENT_ABSENT", "JUSTIFICATION_ABSENTE",
    "IDENTIFIANT_EN_DOUBLE", "CODE_EN_DOUBLE", "CODE_FIGE", "TYPE_INCONNU_DU_CATALOGUE",
    "LIAISON_SENS_INVERSE", "LIAISON_EXTREMITE_ABSENTE",
)

# Le parent permis de chaque sorte ; None veut dire « directement dans le
# bundle ». Les services et les applications vont dans une zone, puis le type
# de la zone dit s'il les reçoit.
PARENTS_PERMIS = {
    ZONE: (None,),
    SALLE: (None,),
    SERVICE: (ZONE,),
    APPLICATION: (ZONE,),
    UNITE: (SERVICE, APPLICATION),
    TRAITEMENT: (UNITE,),
    INTERFACE: (UNITE,),
    BANDE: (INTERFACE,),
    BUS_RECEPTION: (BANDE,),
    BUS_EMISSION: (BANDE,),
    CANAL_RECEPTION: (BUS_RECEPTION,),
    CANAL_EMISSION: (BUS_EMISSION,),
}

# La structure d'une unité : son code est unique dans l'unité, pas dans le bundle.
_STRUCTURE = (TRAITEMENT, INTERFACE, BANDE, BUS_RECEPTION, BUS_EMISSION, CANAL_RECEPTION, CANAL_EMISSION)

# Le nom de chaque sorte dans une phrase, avec son article.
_NOMS = {
    ZONE: ("une", "zone d'environnement"),
    SALLE: ("une", "salle temps réel"),
    SERVICE: ("un", "service"),
    APPLICATION: ("une", "application"),
    UNITE: ("une", "unité"),
    TRAITEMENT: ("un", "traitement"),
    INTERFACE: ("une", "interface de communication"),
    BANDE: ("une", "bande de données"),
    BUS_RECEPTION: ("un", "bus de réception"),
    BUS_EMISSION: ("un", "bus d'émission"),
    CANAL_RECEPTION: ("un", "canal de réception"),
    CANAL_EMISSION: ("un", "canal d'émission"),
}


@dataclass(frozen=True)
class Refus:
    """Une règle enfreinte : son code, ce qu'il faut faire, et où."""

    code: str
    message: str
    element: str | None = None
    parents_compatibles: tuple[str, ...] = ()


# Quand aucun parent possible n'existe encore dans le bundle.
A_AJOUTER_D_ABORD = "un parent à ajouter d'abord"


def _feminin(sorte: str) -> bool:
    return _NOMS[sorte][0] == "une"


def _liste(elements: Iterable[Element], a_defaut: str) -> str:
    noms = list(dict.fromkeys(e.nom or e.code for e in elements))
    return ", ".join(noms) if noms else a_defaut


class _Lecture:
    """Le document, indexé une fois pour toutes les règles."""

    def __init__(self, modele: ModeleBundle, catalogue: Mapping[tuple[str, str], dict]):
        self.catalogue = catalogue
        self.par_id: dict[str, Element] = {}
        self.en_double: list[Element] = []
        for element in modele.elements:
            if element.id in self.par_id:
                self.en_double.append(element)
            else:
                self.par_id[element.id] = element
        # Un identifiant en double est signalé ; les autres règles lisent la
        # première occurrence seulement, pour ne pas compter deux fois la même faute.
        self.elements = list(self.par_id.values())

    def de_sorte(self, *sortes: str) -> list[Element]:
        return [e for e in self.elements if e.sorte in sortes]

    def parent(self, element: Element) -> Element | None:
        return self.par_id.get(element.parent) if element.parent else None

    def definition(self, element: Element) -> dict | None:
        """La définition du type cité, s'il est au catalogue pour cette sorte."""
        if element.type is None:
            return None
        definition = self.catalogue.get((element.type.code, element.type.version))
        return definition if definition and definition.get("sorte") == element.sorte else None

    def est_externe(self, zone: Element) -> bool:
        return zone.type is not None and zone.type.code == TYPE_ZONE_EXTERNE

    def recues(self, zone: Element) -> tuple[str, ...] | None:
        """Ce que reçoit une zone ; None si son type est inconnu (signalé à part)."""
        if zone.type is None:
            # Une zone « à préciser » : la vérification demandera son vrai type.
            return (SERVICE, APPLICATION)
        definition = self.definition(zone)
        return tuple(definition["recoit"]) if definition else None

    def zones_qui_recoivent(self, sorte: str) -> list[Element]:
        return [z for z in self.de_sorte(ZONE)
                if not self.est_externe(z) and sorte in (self.recues(z) or ())]

    def unite_de(self, element: Element) -> Element | None:
        """L'unité qui contient cet élément, en remontant ses parents."""
        vus = {element.id}
        courant = self.parent(element)
        while courant is not None and courant.id not in vus:
            if courant.sorte == UNITE:
                return courant
            vus.add(courant.id)
            courant = self.parent(courant)
        return None

    def parents_proches(self, element: Element, sortes: tuple[str, ...]) -> list[Element]:
        """Les parents possibles d'un élément de structure : ceux de son unité
        d'abord, ceux de tout le bundle si son unité n'en a pas."""
        possibles = self.de_sorte(*sortes)
        unite = self.unite_de(element)
        if unite is not None:
            proches = [p for p in possibles if p.id == unite.id or self.unite_de(p) == unite]
            if proches:
                return proches
        return possibles


def _type_lisible(lecture: _Lecture, zone: Element) -> str:
    definition = lecture.definition(zone)
    nom = definition["nom"] if definition else "à préciser"
    return nom[len("Zone "):] if nom.startswith("Zone ") else nom


def _recues_lisibles(recues: tuple[str, ...]) -> str:
    noms = [{SERVICE: "services", APPLICATION: "applications"}[s] for s in recues if s in (SERVICE, APPLICATION)]
    return " et ".join(noms) if noms else "connexions"


def _placement(lecture: _Lecture, element: Element) -> Refus | None:
    """Le refus du placement de cet élément sous son parent, s'il y en a un."""
    if element.parent is not None and element.parent not in lecture.par_id:
        return Refus("PARENT_ABSENT",
                     f"L'élément parent {element.parent} n'existe pas dans ce brouillon. Rechargez le Studio.",
                     element.id)
    parent = lecture.parent(element)
    sorte_du_parent = parent.sorte if parent else None
    sorte = element.sorte

    if sorte in (ZONE, SALLE):
        if parent is not None:
            return Refus("ZONE_DANS_UNE_ZONE",
                         "Une zone se place directement dans le bundle, jamais dans une autre zone.", element.id)
        return None

    if sorte in (SERVICE, APPLICATION):
        compatibles = lecture.zones_qui_recoivent(sorte)
        ids = tuple(z.id for z in compatibles)
        liste = _liste(compatibles, "une zone à ajouter d'abord")
        if sorte_du_parent != ZONE:
            debut = "Un service" if sorte == SERVICE else "Une application"
            deposez = "Déposez-le" if sorte == SERVICE else "Déposez-la"
            return Refus("SERVICE_HORS_ZONE",
                         f"{debut} se place dans une zone d'environnement, jamais directement dans le bundle. "
                         f"{deposez} dans : {liste}.", element.id, ids)
        if lecture.est_externe(parent):
            ou = ("Placez ce service dans une zone robot ou serveur." if sorte == SERVICE else
                  "Placez cette application dans une zone application web, ordinateur de bureau, "
                  "appareil mobile ou casque.")
            return Refus("ZONE_EXTERNE_RESERVEE",
                         "La zone Externe ne reçoit que des connexions vers des serveurs hors de vos machines. "
                         + ou, element.id, ids)
        recues = lecture.recues(parent)
        if recues is not None and sorte not in recues:
            ce = "ce service" if sorte == SERVICE else "cette application"
            return Refus("ZONE_INCOMPATIBLE",
                         f"La zone « {parent.nom} » est une zone {_type_lisible(lecture, parent)} : "
                         f"elle reçoit des {_recues_lisibles(recues)}. Placez {ce} dans : {liste}.",
                         element.id, ids)
        return None

    if sorte == UNITE:
        if sorte_du_parent not in (SERVICE, APPLICATION):
            compatibles = lecture.de_sorte(SERVICE, APPLICATION)
            return Refus("UNITE_HORS_COMPOSANT",
                         "Une unité se place dans un service ou une application. Choisissez-en un, puis "
                         "« Ajouter une unité ».", element.id, tuple(c.id for c in compatibles))
        return None

    permis = PARENTS_PERMIS[sorte]
    if sorte_du_parent in permis:
        return None
    compatibles = lecture.parents_proches(element, permis)
    ids = tuple(c.id for c in compatibles)
    if sorte in (CANAL_RECEPTION, CANAL_EMISSION) and sorte_du_parent in (BUS_RECEPTION, BUS_EMISSION):
        if sorte == CANAL_RECEPTION:
            message = ("Ce canal de réception ne peut pas être placé dans un bus d'émission. "
                       "Placez-le dans un bus de réception.")
        else:
            message = ("Ce canal d'émission ne peut pas être placé dans un bus de réception. "
                       "Placez-le dans un bus d'émission.")
        return Refus("CANAL_MAUVAIS_BUS", message, element.id, ids)
    article, nom = _NOMS[sorte]
    if parent is None:
        dans = "le bundle"
    else:
        dans = " ".join(_NOMS[parent.sorte])
    placez = "Placez-la" if _feminin(sorte) else "Placez-le"
    return Refus("PARENT_INCOMPATIBLE",
                 f"{article.capitalize()} {nom} ne se place pas dans {dans}. "
                 f"{placez} dans : {_liste(compatibles, A_AJOUTER_D_ABORD)}.",
                 element.id, ids)


def verifier_modele(
    modele: ModeleBundle,
    catalogue: Mapping[tuple[str, str], dict],
    avant: ModeleBundle | None = None,
    publications: Mapping[str, int] | None = None,
) -> list[Refus]:
    """Tous les refus du document ; une liste vide veut dire « accepté ».

    `catalogue` : les définitions des types, par (code, version).
    `avant` : le document enregistré avant celui-ci, s'il y en a un ; il dit
    quels codes sont figés.
    `publications` : pour chaque code figé, le numéro de la première version
    publiée qui le contient, que le message de CODE_FIGE cite.
    """
    lecture = _Lecture(modele, catalogue)
    refus: list[Refus] = []
    message_doublon = ("Deux éléments portent le même identifiant interne. Rechargez le Studio ; "
                       "si cela se reproduit, signalez-le.")

    # Les identifiants, des éléments puis des liaisons.
    for element in lecture.en_double:
        refus.append(Refus("IDENTIFIANT_EN_DOUBLE", message_doublon, element.id))
    liaisons_vues: set[str] = set()
    for liaison in modele.liaisons:
        if liaison.id in liaisons_vues:
            refus.append(Refus("IDENTIFIANT_EN_DOUBLE", message_doublon, liaison.id))
        liaisons_vues.add(liaison.id)

    # Chaque type cité est au catalogue, pour la bonne sorte.
    for element in lecture.elements:
        if element.type is not None and lecture.definition(element) is None:
            refus.append(Refus("TYPE_INCONNU_DU_CATALOGUE",
                               f"Le type {element.type.code} en version {element.type.version} n'est pas au "
                               "catalogue. Choisissez un type proposé par la palette.", element.id))

    # Chaque élément est à sa place.
    for element in lecture.elements:
        refus_du_placement = _placement(lecture, element)
        if refus_du_placement is not None:
            refus.append(refus_du_placement)

    # La salle : une seule, présente si et seulement si une zone existe.
    salles, zones = lecture.de_sorte(SALLE), lecture.de_sorte(ZONE)
    for salle in salles[1:]:
        refus.append(Refus("SALLE_EN_DOUBLE", "Ce bundle a déjà sa salle temps réel. Il n'en a qu'une : "
                                              "toutes ses unités s'y retrouvent.", salle.id))
    if salles and not zones:
        refus.append(Refus("SALLE_SANS_ZONE", "La salle temps réel se pose seule avec la première zone. "
                                              "Ajoutez d'abord une zone.", salles[0].id))
    if zones and not salles:
        refus.append(Refus("SALLE_SANS_ZONE", "La salle temps réel reste tant que le bundle a une zone. "
                                              "Elle part avec la dernière."))

    # Une seule zone Externe.
    for externe in [z for z in zones if lecture.est_externe(z)][1:]:
        refus.append(Refus("ZONE_EXTERNE_EN_DOUBLE", "Ce bundle a déjà sa zone Externe. Posez-y tous les "
                                                     "serveurs qui ne sont pas chez vous.", externe.id))

    # Une unité a exactement un traitement et une interface.
    for unite in lecture.de_sorte(UNITE):
        enfants = [e.sorte for e in lecture.elements if e.parent == unite.id]
        if enfants.count(TRAITEMENT) != 1 or enfants.count(INTERFACE) != 1:
            refus.append(Refus("STRUCTURE_FIXE", "Une unité a toujours un traitement de base et une interface "
                                                 "de communication : ils naissent et partent avec elle.",
                               unite.id))

    # Une zone facultative dit pourquoi le bundle fonctionne sans elle.
    for zone in zones:
        reglages = zone.reglages or {}
        if reglages.get("exigence") == FACULTATIVE and not str(reglages.get("justification") or "").strip():
            refus.append(Refus("JUSTIFICATION_ABSENTE", "Une zone facultative demande une justification : "
                                                        "dites pourquoi le bundle fonctionne sans elle.", zone.id))

    # Un code est unique dans sa portée : le bundle, ou l'unité pour la structure.
    pris: set[tuple[str, str]] = set()
    for element in lecture.elements:
        if element.sorte in _STRUCTURE:
            unite = lecture.unite_de(element)
            if unite is None:
                continue  # hors d'une unité : déjà refusé pour son placement
            portee, ou = unite.id, "dans cette unité"
        else:
            portee, ou = "", "dans ce bundle"
        if (portee, element.code) in pris:
            refus.append(Refus("CODE_EN_DOUBLE", f"Le code {element.code} est déjà pris {ou}. "
                                                 "Choisissez-en un autre.", element.id))
        pris.add((portee, element.code))

    # Un code figé ne change plus, et sa marque ne se retire pas.
    if avant is not None:
        for ancien in avant.elements:
            actuel = lecture.par_id.get(ancien.id)
            if not ancien.code_fige or actuel is None:
                continue
            if actuel.code != ancien.code or not actuel.code_fige:
                version = (publications or {}).get(ancien.code)
                publie = f"publié (version {version})" if version is not None else "publié"
                refus.append(Refus("CODE_FIGE", f"Ce code a déjà été {publie} : il ne change plus. "
                                                "Renommez plutôt le nom affiché.", actuel.id))

    # Une liaison va d'un canal d'émission vers un canal de réception, qui existent.
    for liaison in modele.liaisons:
        source, destination = lecture.par_id.get(liaison.source), lecture.par_id.get(liaison.destination)
        if source is None or destination is None:
            refus.append(Refus("LIAISON_EXTREMITE_ABSENTE", "Une extrémité de cette liaison n'existe plus.",
                               liaison.id))
        elif source.sorte != CANAL_EMISSION or destination.sorte != CANAL_RECEPTION:
            refus.append(Refus("LIAISON_SENS_INVERSE", "Une liaison va toujours d'une sortie vers une entrée.",
                               liaison.id))
    return refus
