"""Les règles du modèle d'un bundle (lot L1, conception partie 3.4 ; étape S3).

Le serveur revérifie tout le document à chaque enregistrement : un élément ne
se place que là où il a le droit d'être, la salle existe si et seulement si une
zone existe, les codes sont uniques dans leur portée... Chaque refus a un code
et un message en français qui dit quoi faire.

Les mêmes règles tournent dans le navigateur. Pour qu'elles ne divergent pas,
un seul fichier de cas, pris aux formats OSCAR (tests/donnees/formats_oscar_v1/),
dit le verdict attendu de chaque cas : les deux côtés doivent le rendre.
"""

import copy
import json
import re
from pathlib import Path

import pytest

from app.studio_modele.catalogue import charger_catalogue
from app.studio_modele.formats import ModeleBundle
from app.studio_modele.regles import INVARIANTS, PARENTS_PERMIS, verifier_modele
from gestes_partages import appliquer

DONNEES = Path(__file__).resolve().parent / "donnees"
FICHIER_DES_CAS = json.loads(
    (DONNEES / "formats_oscar_v1" / "regles_du_modele" / "regles-du-modele.cas.json").read_text(encoding="utf-8"))
REFERENCE = json.loads(
    (DONNEES / "formats_oscar_v1" / "exemples" / "bundle" / "valides" / "bundle-reference-l1.json")
    .read_text(encoding="utf-8"))
CATALOGUE = {(e.type.code, e.type.version): e.definition for e in charger_catalogue()}

# Les messages de la table 3.4 de la conception, écrits ici une seconde fois,
# à part du code, pour que le test ne se contente pas de relire ce que le code
# produit. {} marque ce que le message nomme (une zone, un code...).
MESSAGES = {
    "SERVICE_HORS_ZONE": [
        "Un service se place dans une zone d'environnement, jamais directement dans le bundle. "
        "Déposez-le dans : {}.",
        "Une application se place dans une zone d'environnement, jamais directement dans le bundle. "
        "Déposez-la dans : {}.",
    ],
    "ZONE_INCOMPATIBLE": [
        "La zone « {} » est une zone {} : elle reçoit des {}. Placez ce service dans : {}.",
        "La zone « {} » est une zone {} : elle reçoit des {}. Placez cette application dans : {}.",
    ],
    "ZONE_DANS_UNE_ZONE": ["Une zone se place directement dans le bundle, jamais dans une autre zone."],
    "SALLE_EN_DOUBLE": ["Ce bundle a déjà sa salle temps réel. Il n'en a qu'une : toutes ses unités s'y retrouvent."],
    "SALLE_SANS_ZONE": [
        "La salle temps réel se pose seule avec la première zone. Ajoutez d'abord une zone.",
        "La salle temps réel reste tant que le bundle a une zone. Elle part avec la dernière.",
    ],
    "ZONE_EXTERNE_EN_DOUBLE": [
        "Ce bundle a déjà sa zone Externe. Posez-y tous les serveurs qui ne sont pas chez vous."],
    "ZONE_EXTERNE_RESERVEE": [
        "La zone Externe ne reçoit que des connexions vers des serveurs hors de vos machines. "
        "Placez ce service dans une zone robot ou serveur.",
        "La zone Externe ne reçoit que des connexions vers des serveurs hors de vos machines. "
        "Placez cette application dans une zone application web, ordinateur de bureau, appareil mobile "
        "ou casque.",
    ],
    "UNITE_HORS_COMPOSANT": [
        "Une unité se place dans un service ou une application. Choisissez-en un, puis « Ajouter une unité »."],
    "STRUCTURE_FIXE": [
        "Une unité a toujours un traitement de base et une interface de communication : "
        "ils naissent et partent avec elle."],
    "CANAL_MAUVAIS_BUS": [
        "Ce canal de réception ne peut pas être placé dans un bus d'émission. Placez-le dans un bus de réception.",
        "Ce canal d'émission ne peut pas être placé dans un bus de réception. Placez-le dans un bus d'émission.",
    ],
    "PARENT_INCOMPATIBLE": [
        "Un {} ne se place pas dans {}. Placez-le dans : {}.",
        "Une {} ne se place pas dans {}. Placez-la dans : {}.",
    ],
    "PARENT_ABSENT": ["L'élément parent {} n'existe pas dans ce brouillon. Rechargez le Studio."],
    "JUSTIFICATION_ABSENTE": [
        "Une zone facultative demande une justification : dites pourquoi le bundle fonctionne sans elle."],
    "IDENTIFIANT_EN_DOUBLE": [
        "Deux éléments portent le même identifiant interne. Rechargez le Studio ; si cela se reproduit, "
        "signalez-le."],
    "CODE_EN_DOUBLE": [
        "Le code {} est déjà pris dans ce bundle. Choisissez-en un autre.",
        "Le code {} est déjà pris dans cette unité. Choisissez-en un autre.",
    ],
    "CODE_FIGE": [
        "Ce code a déjà été publié (version {}) : il ne change plus. Renommez plutôt le nom affiché.",
        "Ce code a déjà été publié : il ne change plus. Renommez plutôt le nom affiché.",
    ],
    "TYPE_INCONNU_DU_CATALOGUE": [
        "Le type {} en version {} n'est pas au catalogue. Choisissez un type proposé par la palette."],
    "LIAISON_SENS_INVERSE": ["Une liaison va toujours d'une sortie vers une entrée."],
    "LIAISON_EXTREMITE_ABSENTE": ["Une extrémité de cette liaison n'existe plus."],
}


def suit_la_table(code: str, message: str) -> bool:
    modeles = [re.escape(modele).replace(re.escape("{}"), ".+") for modele in MESSAGES[code]]
    return any(re.fullmatch(modele, message) for modele in modeles)


def verifier(document: dict, avant: dict | None = None, publications=None):
    return verifier_modele(ModeleBundle.model_validate(document), CATALOGUE,
                           avant=ModeleBundle.model_validate(avant) if avant else None,
                           publications=publications)


def reference() -> dict:
    return copy.deepcopy(REFERENCE)


def element(document: dict, element_id: str) -> dict:
    return next(e for e in document["elements"] if e["id"] == element_id)


# --------------------------------------------------------------------------- #
#  Les cas partagés avec le navigateur
# --------------------------------------------------------------------------- #
def test_le_fichier_des_cas_couvre_chaque_invariant():
    assert [i["code"] for i in FICHIER_DES_CAS["invariants"]] == list(INVARIANTS)
    assert set(MESSAGES) == set(INVARIANTS)
    for code in INVARIANTS:
        verdicts = [c["verdict"]["accepte"] for c in FICHIER_DES_CAS["cas"] if c["invariant"] == code]
        assert True in verdicts and False in verdicts, code


@pytest.mark.parametrize("cas", FICHIER_DES_CAS["cas"], ids=lambda cas: cas["nom"])
def test_chaque_cas_partage_rend_son_verdict(cas):
    avant = cas["document"]
    apres = appliquer(avant, cas["geste"]) if "geste" in cas else avant
    if "geste" in cas:
        # Le document de départ d'un geste est lui-même valide.
        assert verifier(avant) == []
    refus = verifier(apres, avant=avant)
    if cas["verdict"]["accepte"]:
        assert refus == []
        return
    # Un cas refusé n'enfreint qu'un invariant : on attend ce code-là, et lui seul.
    assert {r.code for r in refus} == {cas["verdict"]["code"]}, [(r.code, r.message) for r in refus]
    for r in refus:
        assert suit_la_table(r.code, r.message), r.message


# --------------------------------------------------------------------------- #
#  Chaque règle, avec son message exact
# --------------------------------------------------------------------------- #
def test_le_bundle_de_reference_est_accepte():
    assert verifier(reference()) == []


def test_une_deuxieme_salle_est_refusee():
    document = reference()
    document["elements"].append({**element(document, "sal-01"), "id": "sal-02", "code": "COMPOSANT_SALLE_TEMPS_REEL_BIS"})
    (refus,) = verifier(document)
    assert (refus.code, refus.element) == ("SALLE_EN_DOUBLE", "sal-02")
    assert refus.message == ("Ce bundle a déjà sa salle temps réel. Il n'en a qu'une : "
                             "toutes ses unités s'y retrouvent.")


def test_un_service_hors_zone_est_refuse():
    document = reference()
    element(document, "svc-01")["parent"] = None
    (refus,) = verifier(document)
    assert (refus.code, refus.element) == ("SERVICE_HORS_ZONE", "svc-01")
    # L'exemple de la conception, partie 5.1 : les zones qui reçoivent des services.
    assert refus.message == ("Un service se place dans une zone d'environnement, jamais directement dans le "
                             "bundle. Déposez-le dans : Robot M3 Pro, Serveur de traitement.")
    assert refus.parents_compatibles == ("zon-01", "zon-02")


def test_une_application_dans_une_zone_robot_est_refusee():
    document = reference()
    element(document, "app-01")["parent"] = "zon-01"
    (refus,) = verifier(document)
    assert (refus.code, refus.element) == ("ZONE_INCOMPATIBLE", "app-01")
    assert refus.message == ("La zone « Robot M3 Pro » est une zone robot : elle reçoit des services. "
                             "Placez cette application dans : Téléopération web.")
    assert refus.parents_compatibles == ("zon-03",)


def test_une_zone_dans_une_zone_est_refusee():
    document = reference()
    element(document, "zon-02")["parent"] = "zon-01"
    (refus,) = verifier(document)
    assert (refus.code, refus.element) == ("ZONE_DANS_UNE_ZONE", "zon-02")
    assert refus.message == "Une zone se place directement dans le bundle, jamais dans une autre zone."


def test_une_unite_hors_d_un_composant_est_refusee():
    document = reference()
    element(document, "uni-01")["parent"] = "zon-01"
    (refus,) = verifier(document)
    assert (refus.code, refus.element) == ("UNITE_HORS_COMPOSANT", "uni-01")
    assert refus.message == ("Une unité se place dans un service ou une application. Choisissez-en un, puis "
                             "« Ajouter une unité ».")


def test_la_salle_existe_si_et_seulement_si_une_zone_existe():
    sans_zone = {**reference(), "elements": [element(reference(), "sal-01")], "liaisons": []}
    (refus,) = verifier(sans_zone)
    assert (refus.code, refus.element) == ("SALLE_SANS_ZONE", "sal-01")
    assert refus.message == "La salle temps réel se pose seule avec la première zone. Ajoutez d'abord une zone."

    sans_salle = reference()
    sans_salle["elements"] = [e for e in sans_salle["elements"] if e["id"] != "sal-01"]
    (refus,) = verifier(sans_salle)
    assert refus.code == "SALLE_SANS_ZONE"
    assert refus.message == "La salle temps réel reste tant que le bundle a une zone. Elle part avec la dernière."

    assert verifier({**reference(), "elements": [], "liaisons": []}) == []


def zone_externe(identifiant: str, code: str = "ZONE_ENVIRONNEMENT_EXECUTION_EXTERNE") -> dict:
    return {"id": identifiant, "sorte": "ZONE_ENVIRONNEMENT_EXECUTION", "parent": None, "code": code,
            "nom": "Externe", "type": {"code": "TYPE_ENVIRONNEMENT_EXECUTION_EXTERNE", "version": "1.0.0"},
            "reglages": {"exigence": "EXIGENCE_ACTIVATION_ENVIRONNEMENT_OBLIGATOIRE"}}


def test_la_zone_externe_est_permise_une_fois_et_refuse_les_services():
    document = reference()
    document["elements"].append(zone_externe("zon-x"))
    assert verifier(document) == []

    deux = copy.deepcopy(document)
    deux["elements"].append(zone_externe("zon-y", "ZONE_ENVIRONNEMENT_EXECUTION_EXTERNE_BIS"))
    (refus,) = verifier(deux)
    assert (refus.code, refus.element) == ("ZONE_EXTERNE_EN_DOUBLE", "zon-y")
    assert refus.message == "Ce bundle a déjà sa zone Externe. Posez-y tous les serveurs qui ne sont pas chez vous."

    element(document, "svc-02")["parent"] = "zon-x"
    (refus,) = verifier(document)
    assert (refus.code, refus.element) == ("ZONE_EXTERNE_RESERVEE", "svc-02")
    assert refus.message == ("La zone Externe ne reçoit que des connexions vers des serveurs hors de vos "
                             "machines. Placez ce service dans une zone robot ou serveur.")


def test_une_zone_facultative_sans_justification_est_refusee():
    for reglages in ({"exigence": "EXIGENCE_ACTIVATION_ENVIRONNEMENT_FACULTATIVE"},
                     {"exigence": "EXIGENCE_ACTIVATION_ENVIRONNEMENT_FACULTATIVE", "justification": "   "}):
        document = reference()
        element(document, "zon-02")["reglages"] = reglages
        (refus,) = verifier(document)
        assert (refus.code, refus.element) == ("JUSTIFICATION_ABSENTE", "zon-02")
        assert refus.message == ("Une zone facultative demande une justification : dites pourquoi le bundle "
                                 "fonctionne sans elle.")


def test_les_codes_sont_uniques_dans_leur_portee():
    # Le bundle de référence a trois unités aux mêmes codes de structure : permis.
    assert verifier(reference()) == []

    deux_services = reference()
    element(deux_services, "svc-02")["code"] = "INSTANCE_SERVICE_CONFIGUREE_ACTIONS_ROBOT"
    (refus,) = verifier(deux_services)
    assert (refus.code, refus.element) == ("CODE_EN_DOUBLE", "svc-02")
    assert refus.message == ("Le code INSTANCE_SERVICE_CONFIGUREE_ACTIONS_ROBOT est déjà pris dans ce bundle. "
                             "Choisissez-en un autre.")

    deux_canaux = reference()
    deux_canaux["elements"].append({**element(deux_canaux, "can-01"), "id": "can-03"})
    (refus,) = verifier(deux_canaux)
    assert (refus.code, refus.element) == ("CODE_EN_DOUBLE", "can-03")
    assert refus.message == ("Le code CANAL_RECEPTION_COMMANDE_BASE est déjà pris dans cette unité. "
                             "Choisissez-en un autre.")


def test_un_parent_incompatible_nomme_les_parents_possibles_les_plus_proches():
    document = reference()
    element(document, "bre-01")["parent"] = "itf-01"
    (refus,) = verifier(document)
    assert (refus.code, refus.element) == ("PARENT_INCOMPATIBLE", "bre-01")
    # La bande de la même unité, pas celles des autres unités.
    assert refus.message == ("Un bus de réception ne se place pas dans une interface de communication. "
                             "Placez-le dans : Bande principale.")
    assert refus.parents_compatibles == ("bnd-01",)


def test_un_canal_dans_un_bus_de_l_autre_sens_est_refuse():
    document = reference()
    element(document, "can-02")["parent"] = "bre-02"
    (refus,) = verifier(document)
    assert (refus.code, refus.element) == ("CANAL_MAUVAIS_BUS", "can-02")
    assert refus.message == ("Ce canal d'émission ne peut pas être placé dans un bus de réception. "
                             "Placez-le dans un bus d'émission.")
    assert refus.parents_compatibles == ("bem-02",)


def test_un_parent_absent_et_un_type_inconnu_sont_nommes():
    document = reference()
    element(document, "svc-02")["parent"] = "zon-disparue"
    element(document, "app-01")["type"] = {"code": "TYPE_APPLICATION_GENERIQUE", "version": "9.0.0"}
    refus = verifier(document)
    assert sorted((r.code, r.element, r.message) for r in refus) == [
        ("PARENT_ABSENT", "svc-02", "L'élément parent zon-disparue n'existe pas dans ce brouillon. Rechargez le Studio."),
        ("TYPE_INCONNU_DU_CATALOGUE", "app-01", "Le type TYPE_APPLICATION_GENERIQUE en version 9.0.0 n'est pas au "
                                                "catalogue. Choisissez un type proposé par la palette."),
    ]


def test_un_code_fige_ne_change_pas_et_le_message_dit_sa_version():
    avant = reference()
    element(avant, "svc-01")["code_fige"] = True
    apres = copy.deepcopy(avant)
    element(apres, "svc-01")["code"] = "INSTANCE_SERVICE_CONFIGUREE_ACTIONS"
    (refus,) = verifier(apres, avant=avant, publications={"INSTANCE_SERVICE_CONFIGUREE_ACTIONS_ROBOT": 2})
    assert (refus.code, refus.element) == ("CODE_FIGE", "svc-01")
    assert refus.message == ("Ce code a déjà été publié (version 2) : il ne change plus. "
                             "Renommez plutôt le nom affiché.")

    # Retirer la marque pour changer le code ensuite est refusé de même.
    sans_marque = copy.deepcopy(avant)
    del element(sans_marque, "svc-01")["code_fige"]
    assert [r.code for r in verifier(sans_marque, avant=avant)] == ["CODE_FIGE"]

    # Le nom affiché, lui, change librement.
    renomme = copy.deepcopy(avant)
    element(renomme, "svc-01")["nom"] = "Service des actions"
    assert verifier(renomme, avant=avant) == []


def test_les_liaisons_vont_d_une_sortie_vers_une_entree_existante():
    inverse = reference()
    inverse["liaisons"] = [{"id": "lia-01", "source": "can-01", "destination": "can-02"}]
    (refus,) = verifier(inverse)
    assert (refus.code, refus.element) == ("LIAISON_SENS_INVERSE", "lia-01")
    assert refus.message == "Une liaison va toujours d'une sortie vers une entrée."

    orpheline = reference()
    orpheline["liaisons"] = [{"id": "lia-01", "source": "can-02", "destination": "can-perdu"}]
    (refus,) = verifier(orpheline)
    assert (refus.code, refus.element) == ("LIAISON_EXTREMITE_ABSENTE", "lia-01")
    assert refus.message == "Une extrémité de cette liaison n'existe plus."


def test_une_zone_a_preciser_recoit_services_et_applications():
    """Une zone sans type (l'adaptateur en crée pour ce qu'il ne sait pas
    placer) reçoit tout ; c'est la vérification qui demandera son type."""
    document = reference()
    del element(document, "zon-03")["type"]
    element(document, "svc-02")["parent"] = "zon-03"
    assert verifier(document) == []


def test_le_catalogue_et_les_regles_disent_le_meme_emboitement():
    """La palette lit l'emboîtement dans le catalogue, le serveur dans ses
    règles : les deux doivent dire la même chose."""
    for definition in CATALOGUE.values():
        sorte = definition["sorte"]
        attendus = ["BUNDLE_DEPLOIEMENT" if parent is None else parent for parent in PARENTS_PERMIS[sorte]]
        assert definition["parents_autorises"] == attendus, definition["code"]
        if sorte != "ZONE_ENVIRONNEMENT_EXECUTION":
            enfants = {enfant for enfant, parents in PARENTS_PERMIS.items() if sorte in parents}
            assert set(definition["recoit"]) == enfants, definition["code"]
