"""Le format du bundle au nouveau Studio, contre sa source (lot L1, étape S3).

Les formats OSCAR ont une seule source, le dépôt oscar-tools ; la console en
garde une copie prise à une étiquette fixe (tests/donnees/formats_oscar_v1/,
voir son SOURCE.txt). Ces tests vérifient :
- que la copie n'a pas été modifiée depuis l'étiquette ;
- que le format de la console (app/studio_modele/formats.py) accepte et refuse
  les mêmes exemples que la source, au même endroit du document ;
- que les codes et les motifs de la console sont ceux de la source.
"""

import copy
import hashlib
import json
import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.studio_modele import formats
from app.studio_modele.catalogue import charger_catalogue, familles
from app.studio_modele.formats import MiseEnPage, ModeleBundle
from app.studio_modele.sortes import SORTES

COPIE = Path(__file__).resolve().parent / "donnees" / "formats_oscar_v1"


def json_de(chemin: str):
    return json.loads((COPIE / chemin).read_text(encoding="utf-8"))


def definitions(schema: str) -> dict:
    return json_de(f"schemas/{schema}")["$defs"]


# --------------------------------------------------------------------------- #
#  La copie
# --------------------------------------------------------------------------- #
def test_la_copie_des_formats_est_celle_de_l_etiquette():
    source = (COPIE / "SOURCE.txt").read_text(encoding="utf-8")
    assert re.search(r"^etiquette: formats-oscar-v1\.1\.0$", source, re.M)
    assert re.search(r"^commit: 5122f7713039f4dbf5ce03d65b0faa92987d51ca$", source, re.M)
    empreintes = dict(
        (chemin, empreinte) for empreinte, chemin in re.findall(r"^([0-9a-f]{64})  (\S+)$", source, re.M)
    )
    copies = sorted(str(f.relative_to(COPIE)) for f in COPIE.rglob("*") if f.is_file() and f.name != "SOURCE.txt")
    # Rien d'ajouté ni de retiré à côté de la liste, et chaque fichier tel qu'à l'étiquette.
    assert sorted(empreintes) == copies
    for chemin, empreinte in empreintes.items():
        assert hashlib.sha256((COPIE / chemin).read_bytes()).hexdigest() == empreinte, chemin


# --------------------------------------------------------------------------- #
#  Les exemples de la source : le même verdict, au même endroit
# --------------------------------------------------------------------------- #
VERDICTS = {chemin: verdict for chemin, verdict in json_de("exemples/verdicts-attendus.json")["verdicts"].items()
            if chemin.startswith("bundle/")}


def lieu(erreur: dict) -> str:
    """L'endroit d'une erreur, écrit comme dans la source : /elements/4/id."""
    return "".join(f"/{morceau}" for morceau in erreur["loc"])


@pytest.mark.parametrize("chemin", sorted(VERDICTS))
def test_les_exemples_du_bundle_rendent_le_verdict_de_la_source(chemin):
    attendu = VERDICTS[chemin]
    document = json_de(f"exemples/{chemin}")
    if attendu["accepte"]:
        ModeleBundle.model_validate(document)
        return
    with pytest.raises(ValidationError) as erreur:
        ModeleBundle.model_validate(document)
    lieux = [lieu(e) for e in erreur.value.errors()]
    for refus in attendu["refus"]:
        # Pydantic situe l'erreur au champ ou à l'élément ; la source, parfois un
        # cran plus haut ou plus bas. On exige le même élément du document.
        assert any(trouve.startswith(refus["chemin"]) or refus["chemin"].startswith(trouve)
                   for trouve in lieux), (refus, lieux)


def test_les_documents_des_cas_partages_sont_au_format():
    for cas in json_de("regles_du_modele/regles-du-modele.cas.json")["cas"]:
        ModeleBundle.model_validate(cas["document"])


def test_une_valeur_nulle_n_est_pas_un_champ_absent():
    """Comme le schéma : un nom absent est permis à une bande, un nom à null non."""
    document = json_de("exemples/bundle/valides/bundle-reference-l1.json")
    ModeleBundle.model_validate(document)
    abime = copy.deepcopy(document)
    abime["elements"][8]["nom"] = None
    with pytest.raises(ValidationError):
        ModeleBundle.model_validate(abime)
    abime = copy.deepcopy(document)
    abime["elements"][8]["code_fige"] = "oui"
    with pytest.raises(ValidationError):
        ModeleBundle.model_validate(abime)


# --------------------------------------------------------------------------- #
#  Les codes et les motifs
# --------------------------------------------------------------------------- #
def test_les_codes_de_la_console_sont_ceux_des_formats():
    codes = definitions("codes-stables.schema.json")
    assert list(SORTES) == codes["sorte_d_element_du_bundle"]["enum"]
    assert [famille["code"] for famille in familles()] == codes["famille_palette"]["enum"]
    assert list(formats.EXIGENCES) == codes["exigence_activation_environnement"]["enum"]

    catalogue = {(e.type.code, e.type.version): e.type for e in charger_catalogue()}
    zones = sorted(code for (code, _), t in catalogue.items() if t.sorte == "ZONE_ENVIRONNEMENT_EXECUTION")
    assert zones == sorted(codes["type_environnement_execution"]["enum"])
    for nom in ("type_service_generique", "type_application_generique", "type_unite_standard",
                "composant_salle_temps_reel"):
        assert any(code == codes[nom]["const"] for code, _ in catalogue), nom

    # Le catalogue que supposent les cas partagés est celui de la console.
    for type_ in json_de("regles_du_modele/regles-du-modele.cas.json")["catalogue"]:
        assert catalogue[(type_["code"], type_["version"])].sorte == type_["sorte"]


def test_les_motifs_et_les_longueurs_sont_ceux_des_formats():
    bundle = definitions("bundle.schema.json")
    codes = definitions("codes-stables.schema.json")
    communs = definitions("types-communs.schema.json")
    assert formats.MOTIF_IDENTIFIANT == bundle["identifiant"]["pattern"]
    assert formats.LONGUEUR_IDENTIFIANT == bundle["identifiant"]["maxLength"]
    assert formats.MOTIF_CODE == codes["code_stable"]["pattern"]
    assert formats.LONGUEUR_CODE == codes["code_stable"]["maxLength"]
    assert formats.MOTIF_VERSION == communs["version_semantique"]["pattern"]
    assert formats.LONGUEUR_NOM == communs["nom_lisible"]["maxLength"]
    assert formats.LONGUEUR_DESCRIPTION == bundle["description"]["maxLength"]
    assert formats.LONGUEUR_JUSTIFICATION == bundle["reglages_de_zone"]["properties"]["justification"]["maxLength"]


# --------------------------------------------------------------------------- #
#  La mise en page, un document à part
# --------------------------------------------------------------------------- #
def test_la_mise_en_page_se_lit_a_part():
    MiseEnPage.model_validate({"format": "oscar.mise-en-page/1",
                               "blocs": {"zon-01": {"x": 40, "y": 120}, "svc-01": {"x": 24.5, "y": 64}}})
    MiseEnPage.model_validate({"format": "oscar.mise-en-page/1", "blocs": {}})
    for abimee in (
        {"format": "oscar.mise-en-page/2", "blocs": {}},
        {"format": "oscar.mise-en-page/1", "blocs": {"zon-01": {"x": "40", "y": 120}}},
        {"format": "oscar.mise-en-page/1", "blocs": {"zon 01": {"x": 40, "y": 120}}},
        {"format": "oscar.mise-en-page/1", "blocs": {"zon-01": {"x": 40, "y": 120, "largeur": 300}}},
        {"format": "oscar.mise-en-page/1", "blocs": {}, "vue": {"zoom": 1}},
    ):
        with pytest.raises(ValidationError):
            MiseEnPage.model_validate(abimee)
