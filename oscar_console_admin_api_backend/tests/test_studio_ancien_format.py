"""L'adaptateur de l'ancien format (lot L1, élément L1-5 ; étape S5).

Un bundle composé dans l'ancienne console s'ouvre dans le nouveau Studio par
une reprise : son modèle au nouveau format, sa mise en page, et un rapport.
Rien n'est perdu, rien n'est deviné, et l'ancienne version reste telle quelle
pour les robots qui la lisent (conception, annexe A).

La composition de référence (tests/donnees/ancien-format-complet.json) porte
chaque champ que lit l'ancien serveur (app/bundle_spec.py) : Box IA, mise en
route, quatre environnements dont l'« application métier », traits de
structure et liaisons de données, dont une perdue et une à l'envers.
"""

import copy
import json
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select

from app.bundle_spec import convertir_composition
from app.database import SessionLocal
from app.models import BundleVersion, CompositionPreset
from app.studio_modele.ancien_format import brouillon_depuis_ancien_format
from app.studio_modele.catalogue import charger_catalogue
from app.studio_modele.formats import ModeleBundle
from app.studio_modele.regles import verifier_modele
from test_unites import composition_ancienne

DONNEES = Path(__file__).resolve().parent / "donnees"
COMPLET = json.loads((DONNEES / "ancien-format-complet.json").read_text(encoding="utf-8"))
CATALOGUE = {(e.type.code, e.type.version): e.definition for e in charger_catalogue()}

# Ce que l'adaptateur lit pour le modèle, objet par objet (annexe A). Chaque
# autre champ doit se retrouver dans le rapport ou dans `donnees_reprises`.
LUS_DU_NOEUD = {"id", "data", "position"}
LUS_DU_BLOC = {"kind", "technicalCode", "name", "description", "target", "units"}
LUS_DE_L_UNITE = {"id", "technicalCode", "name", "unitType", "processingName", "interfaceName", "dataBandName",
                  "receiveBusName", "sendBusName", "inputs", "outputs"}
LUS_DU_CANAL = {"id", "technicalCode", "name", "description", "channelType", "dataFormat"}
LUS_DE_LA_LIAISON = {"id", "source", "target", "sourceHandle", "targetHandle", "data"}
STRUCTURE = {"TRAITEMENT_METIER_UNITE": "processingName", "INTERFACE_COMMUNICATION_UNITE": "interfaceName",
             "BANDE_DONNEES": "dataBandName", "BUS_RECEPTION": "receiveBusName", "BUS_EMISSION": "sendBusName"}


def reprendre(spec=None, codes_publies=None, **options):
    return brouillon_depuis_ancien_format(COMPLET if spec is None else spec, codes_publies or {}, CATALOGUE,
                                          **options)


def par_id(modele: dict) -> dict:
    return {e["id"]: e for e in modele["elements"]}


def codes_des_problemes(rapport: dict) -> list[str]:
    return [p["code"] for p in rapport["problemes"]]


# --------------------------------------------------------------------------- #
#  Sans perte
# --------------------------------------------------------------------------- #
def test_un_bundle_de_l_ancienne_console_est_lu_sans_perte():
    reprise = reprendre()
    modele, rapport = reprise.modele, reprise.rapport
    ModeleBundle.model_validate(modele)
    elements = par_id(modele)
    non_repris = {entree["champ"]: entree for entree in rapport["non_repris"]}

    def garde(chemin: str, cle: str, valeur, element: dict | None) -> None:
        """Un champ hors de ceux que lit le modèle : dans le rapport, ou dans les données reprises."""
        if f"{chemin}/{cle}" in non_repris:
            assert non_repris[f"{chemin}/{cle}"]["valeur"] == valeur
            assert non_repris[f"{chemin}/{cle}"]["raison"]
        else:
            assert element is not None and element.get("donnees_reprises", {}).get(cle) == valeur, (chemin, cle)

    # Le bloc « bundle » devient l'en-tête du modèle.
    bundle = COMPLET["nodes"][0]
    assert modele["bundle"] == {"code": bundle["data"]["technicalCode"], "nom": bundle["data"]["name"],
                                "description": bundle["data"]["description"]}
    for cle, valeur in bundle.items():
        if cle != "data":
            garde("/nodes/0", cle, valeur, None)
    for cle, valeur in bundle["data"].items():
        if cle not in {"kind", "technicalCode", "name", "description"}:
            garde("/nodes/0/data", cle, valeur, None)

    for numero, noeud in enumerate(COMPLET["nodes"][1:], start=1):
        chemin, donnees = f"/nodes/{numero}", noeud["data"]
        composant = elements[noeud["id"]]
        assert (composant["code"], composant["nom"], composant.get("description")) == (
            donnees["technicalCode"], donnees["name"], donnees["description"])
        assert reprise.mise_en_page["blocs"][noeud["id"]]
        for cle, valeur in noeud.items():
            if cle not in LUS_DU_NOEUD:
                garde(chemin, cle, valeur, composant)
        for cle, valeur in donnees.items():
            if cle not in LUS_DU_BLOC:
                garde(f"{chemin}/data", cle, valeur, composant)
        for rang, unite in enumerate(donnees["units"]):
            chemin_unite = f"{chemin}/data/units/{rang}"
            element_unite = elements[unite["id"]]
            assert (element_unite["parent"], element_unite["code"], element_unite["nom"]) == (
                noeud["id"], unite["technicalCode"], unite["name"])
            # Chaque chaîne de la structure devient un vrai élément de l'unité.
            structure = {e["sorte"]: e["code"] for e in modele["elements"]
                         if e["sorte"] in STRUCTURE and e["id"].endswith(unite["id"])}
            assert structure == {sorte: unite[champ] for sorte, champ in STRUCTURE.items()}
            for cle, valeur in unite.items():
                if cle not in LUS_DE_L_UNITE:
                    garde(chemin_unite, cle, valeur, element_unite)
            for champ, sorte in (("inputs", "CANAL_RECEPTION"), ("outputs", "CANAL_EMISSION")):
                for position, canal in enumerate(unite[champ]):
                    element_canal = elements[canal["id"]]
                    assert element_canal["sorte"] == sorte
                    assert (element_canal["code"], element_canal["nom"], element_canal["description"]) == (
                        canal["technicalCode"], canal["name"], canal["description"])
                    assert element_canal["reglages"] == {"type": canal["channelType"], "format": canal["dataFormat"]}
                    for cle, valeur in canal.items():
                        if cle not in LUS_DU_CANAL:
                            garde(f"{chemin_unite}/{champ}/{position}", cle, valeur, element_canal)

    liaisons = {lien["id"]: lien for lien in modele["liaisons"]}
    non_classes = [entree["objet"] for entree in rapport["non_classes"]]
    for numero, lien in enumerate(COMPLET["edges"]):
        chemin = f"/edges/{numero}"
        if lien["data"]["edgeKind"] == "STRUCTURE":
            assert non_repris[chemin]["valeur"] == lien
        elif lien["id"] in liaisons:
            for cle, valeur in lien.items():
                if cle not in LUS_DE_LA_LIAISON:
                    garde(chemin, cle, valeur, None)
        else:
            assert lien in non_classes
    assert liaisons == {
        "liaison-commande": {"id": "liaison-commande", "source": "tx-commande", "destination": "rx-commande"},
        "liaison-etat": {"id": "liaison-etat", "source": "tx-etat", "destination": "rx-etat-robot"},
    }


def test_chaque_ancien_environnement_devient_une_zone():
    modele, rapport = reprendre().modele, reprendre().rapport
    elements = par_id(modele)
    zones = {e["id"]: e for e in modele["elements"] if e["sorte"] == "ZONE_ENVIRONNEMENT_EXECUTION"}
    assert {i: (z["nom"], z.get("type", {}).get("code"), z["reglages"]["exigence"]) for i, z in zones.items()} == {
        "zon-ancien-robot": ("Robot", "TYPE_ENVIRONNEMENT_EXECUTION_ROBOT",
                             "EXIGENCE_ACTIVATION_ENVIRONNEMENT_OBLIGATOIRE"),
        "zon-ancien-serveur": ("Serveur", "TYPE_ENVIRONNEMENT_EXECUTION_SERVEUR",
                               "EXIGENCE_ACTIVATION_ENVIRONNEMENT_OBLIGATOIRE"),
        "zon-ancien-navigateur-web": ("Application web", "TYPE_ENVIRONNEMENT_EXECUTION_NAVIGATEUR_WEB",
                                      "EXIGENCE_ACTIVATION_ENVIRONNEMENT_OBLIGATOIRE"),
        # L'« application métier » n'a pas de zone à elle : jamais devinée.
        "zon-ancien-a-preciser": ("À préciser", None, "EXIGENCE_ACTIVATION_ENVIRONNEMENT_OBLIGATOIRE"),
    }
    assert {i: elements[i]["parent"] for i in ("instance_service-1a2b3c4d", "instance_service-4d5e6f7a",
                                              "instance_application-5e6f7a8b", "instance_application-6f7a8b9c")} == {
        "instance_service-1a2b3c4d": "zon-ancien-robot",
        "instance_service-4d5e6f7a": "zon-ancien-serveur",
        "instance_application-5e6f7a8b": "zon-ancien-navigateur-web",
        "instance_application-6f7a8b9c": "zon-ancien-a-preciser",
    }
    # L'environnement d'origine reste, pour choisir le vrai type de la zone.
    assert elements["instance_application-6f7a8b9c"]["donnees_reprises"]["target"] == \
        "ENVIRONNEMENT_EXECUTION_APPLICATION_METIER"
    (zone_a_preciser,) = [p for p in rapport["problemes"] if p["code"] == "ZONE_A_PRECISER"]
    assert (zone_a_preciser["niveau"], zone_a_preciser["element"]) == ("ERREUR", "zon-ancien-a-preciser")


def test_un_service_marque_pour_un_navigateur_va_dans_la_zone_a_preciser():
    spec = copy.deepcopy(COMPLET)
    spec["nodes"][3]["data"]["target"] = "ENVIRONNEMENT_EXECUTION_NAVIGATEUR_WEB"
    reprise = reprendre(spec)
    assert par_id(reprise.modele)["instance_service-3c4d5e6f"]["parent"] == "zon-ancien-a-preciser"
    assert "COMPOSANT_A_PLACER" in codes_des_problemes(reprise.rapport)


def test_l_adaptateur_pose_la_salle():
    modele = reprendre().modele
    salles = [e for e in modele["elements"] if e["sorte"] == "COMPOSANT_SALLE_TEMPS_REEL"]
    assert salles == [{"id": "sal-ancien", "sorte": "COMPOSANT_SALLE_TEMPS_REEL", "parent": None,
                       "code": "COMPOSANT_SALLE_TEMPS_REEL", "nom": "Salle temps réel",
                       "type": {"code": "COMPOSANT_SALLE_TEMPS_REEL", "version": "1.0.0"}}]
    # Posée avec la première zone.
    assert [e["sorte"] for e in modele["elements"][:2]] == ["ZONE_ENVIRONNEMENT_EXECUTION", "COMPOSANT_SALLE_TEMPS_REEL"]
    # Une composition sans composant n'a ni zone ni salle.
    vide = reprendre({"nodes": [COMPLET["nodes"][0]], "edges": []}).modele
    assert vide["elements"] == []


def test_la_reprise_respecte_les_regles_du_modele():
    reprise = reprendre()
    assert verifier_modele(ModeleBundle.model_validate(reprise.modele), CATALOGUE) == []
    assert "ERREUR" not in {p["niveau"] for p in reprise.rapport["problemes"] if p["code"] != "ZONE_A_PRECISER"}


def test_une_liaison_dont_un_canal_manque_devient_un_probleme_a_resoudre():
    rapport = reprendre().rapport
    a_refaire = [p for p in rapport["problemes"] if p["code"] == "LIAISON_A_RECONSTRUIRE"]
    assert sorted(p["element"] for p in a_refaire) == ["liaison-a-l-envers", "liaison-perdue"]
    gardees = [entree["objet"]["id"] for entree in rapport["non_classes"]]
    assert sorted(gardees) == ["liaison-a-l-envers", "liaison-perdue"]


def test_plusieurs_noeuds_bundle_deviennent_un_probleme():
    spec = copy.deepcopy(COMPLET)
    second = copy.deepcopy(spec["nodes"][0])
    second["id"] = "bundle_deploiement-ffff0000"
    second["data"]["name"] = "Un autre bundle"
    spec["nodes"].append(second)
    reprise = reprendre(spec)
    assert reprise.modele["bundle"]["nom"] == "Accueil et inventaire du magasin"
    assert "PLUSIEURS_BUNDLES" in codes_des_problemes(reprise.rapport)
    assert second in [entree["objet"] for entree in reprise.rapport["non_classes"]]


def test_un_bloc_d_une_sorte_inconnue_est_garde_dans_le_rapport():
    spec = copy.deepcopy(COMPLET)
    inconnu = {"id": "capteur-1", "type": "architecture", "position": {"x": 0, "y": 0},
               "data": {"kind": "CAPTEUR_LIDAR", "name": "Lidar avant"}}
    spec["nodes"].append(inconnu)
    reprise = reprendre(spec)
    assert "SORTE_INCONNUE" in codes_des_problemes(reprise.rapport)
    assert inconnu in [entree["objet"] for entree in reprise.rapport["non_classes"]]


def test_un_type_d_unite_hors_du_catalogue_est_a_confirmer():
    reprise = reprendre()
    bras = par_id(reprise.modele)["unite-33cc44dd"]
    assert bras["type"] == {"code": "TYPE_UNITE_STANDARD", "version": "1.0.0"}
    assert bras["donnees_reprises"]["type_ancien"] == "TYPE_UNITE_CONTROLE_ACTION_ROBOT"
    (probleme,) = [p for p in reprise.rapport["problemes"] if p["code"] == "TYPE_A_CONFIRMER"]
    assert probleme["element"] == "unite-33cc44dd"


def test_un_code_deja_publie_est_fige():
    reprise = reprendre(codes_publies={"INSTANCE_SERVICE_ACTIONS_ROBOT": 1, "CANAL_RECEPTION_COMMANDE_DEPLACEMENT": 2,
                                       "TRAITEMENT_METIER_UNITE_PRINCIPAL": 1})
    figes = {e["id"] for e in reprise.modele["elements"] if e.get("code_fige")}
    traitements = {e["id"] for e in reprise.modele["elements"] if e["sorte"] == "TRAITEMENT_METIER_UNITE"}
    assert figes == {"instance_service-1a2b3c4d", "rx-commande"} | traitements
    assert not any(e.get("code_fige") for e in reprendre().modele["elements"])


def test_les_blocs_sont_ramenes_dans_leur_zone_en_gardant_leur_ordre():
    blocs = reprendre().mise_en_page["blocs"]
    # Zone robot : trois services ; le plus haut à gauche se pose au bord de la zone.
    assert blocs["instance_service-1a2b3c4d"] == {"x": 24, "y": 64}
    assert blocs["instance_service-2b3c4d5e"] == {"x": 24, "y": 64 + 430}
    assert blocs["instance_service-3c4d5e6f"] == {"x": 24, "y": 64 + 720}
    assert blocs["instance_service-4d5e6f7a"] == {"x": 24, "y": 64}
    assert set(blocs) == {n["id"] for n in COMPLET["nodes"][1:]}


def test_l_adaptateur_est_deterministe_et_ne_touche_pas_a_ce_qu_il_lit():
    avant = copy.deepcopy(COMPLET)
    premiere, seconde = reprendre(), reprendre()
    assert json.dumps(premiere.modele, ensure_ascii=False) == json.dumps(seconde.modele, ensure_ascii=False)
    assert json.dumps(premiere.mise_en_page) == json.dumps(seconde.mise_en_page)
    assert json.dumps(premiere.rapport, ensure_ascii=False) == json.dumps(seconde.rapport, ensure_ascii=False)
    assert COMPLET == avant


def test_l_adaptateur_lit_aussi_une_composition_d_avant_les_unites():
    """Une composition à « agents » passe d'abord par convertir_composition."""
    ancienne = brouillon_depuis_ancien_format(composition_ancienne(), {}, CATALOGUE)
    nouvelle = brouillon_depuis_ancien_format(convertir_composition(composition_ancienne()), {}, CATALOGUE)
    assert ancienne.modele == nouvelle.modele
    codes = {e["code"] for e in ancienne.modele["elements"]}
    assert "INSTANCE_UNITE_CAMERA_AVANT" in codes
    assert not any("AGENT" in code for code in codes)
    assert verifier_modele(ModeleBundle.model_validate(ancienne.modele), CATALOGUE) == []


# --------------------------------------------------------------------------- #
#  Par l'API
# --------------------------------------------------------------------------- #
def uniq(prefixe: str) -> str:
    return f"{prefixe}-{uuid.uuid4().hex[:8]}"


@pytest.fixture()
def entetes(client, admin_headers):
    org = client.post("/api/organisations", headers=admin_headers,
                      json={"nom": uniq("Magasins Durand"), "slug": uniq("magasins-durand")}).json()
    return {**admin_headers, "X-Organization-ID": org["id"]}


def publiable() -> dict:
    """La composition complète, telle que l'ancienne console accepte de la
    publier : sans les deux liaisons cassées, et sans Box IA (celles de la
    composition n'existent pas dans cette base)."""
    spec = copy.deepcopy(COMPLET)
    spec["edges"] = [lien for lien in spec["edges"] if lien["id"] not in {"liaison-perdue", "liaison-a-l-envers"}]
    for noeud in spec["nodes"]:
        noeud["data"].pop("aiBoxId", None)
    return spec


def bundle_publie_a_l_ancien_format(client, entetes) -> tuple[dict, dict]:
    bundle = client.post("/api/studio/bundles", headers=entetes, json={"nom": uniq("Accueil en magasin")}).json()
    assert client.put(f"/api/studio/bundles/{bundle['id']}/draft", headers=entetes,
                      json={"spec": publiable()}).status_code == 200
    publiee = client.post(f"/api/studio/bundles/{bundle['id']}/publish", headers=entetes, json={})
    assert publiee.status_code == 200, publiee.text
    return bundle, publiee.json()


def test_un_bundle_ancien_s_ouvre_par_l_api(client, entetes):
    bundle, publiee = bundle_publie_a_l_ancien_format(client, entetes)
    assert client.get(f"/api/studio/bundles/{bundle['id']}", headers=entetes).json()["format_brouillon"] == "ancien"
    lu = client.get(f"/api/studio/bundles/{bundle['id']}/brouillon", headers=entetes).json()
    assert lu["revision"] == 0
    assert lu["origine"] == {"sorte": "ANCIEN_FORMAT", "version_id": publiee["id"], "numero": publiee["numero"]}
    attendue = reprendre(publiable())
    assert lu["reprise"] == attendue.rapport
    assert lu["mise_en_page"] == attendue.mise_en_page
    assert lu["modele"]["bundle"] == attendue.modele["bundle"]
    # Les mêmes éléments, chaque code de la version publiée en plus figé.
    assert [{k: v for k, v in e.items() if k != "code_fige"} for e in lu["modele"]["elements"]] == \
        attendue.modele["elements"]
    assert all(e.get("code_fige") for e in lu["modele"]["elements"]
               if e["sorte"] not in {"ZONE_ENVIRONNEMENT_EXECUTION", "COMPOSANT_SALLE_TEMPS_REEL"})


def test_l_adaptateur_ne_modifie_jamais_l_ancienne_version(client, entetes):
    bundle, publiee = bundle_publie_a_l_ancien_format(client, entetes)

    def ancienne():
        with SessionLocal() as db:
            version = db.get(BundleVersion, publiee["id"])
            return json.dumps(version.spec, sort_keys=True), version.checksum, version.statut

    avant = ancienne()
    lu = client.get(f"/api/studio/bundles/{bundle['id']}/brouillon", headers=entetes).json()
    assert ancienne() == avant
    # Le premier enregistrement de la reprise ne la touche pas non plus.
    r = client.put(f"/api/studio/bundles/{bundle['id']}/brouillon", headers=entetes,
                   json={"modele": lu["modele"], "mise_en_page": lu["mise_en_page"], "revision_attendue": 0})
    assert r.status_code == 200, r.text
    assert r.json()["revision"] == 1
    assert ancienne() == avant
    enregistre = client.get(f"/api/studio/bundles/{bundle['id']}/brouillon", headers=entetes).json()
    assert (enregistre["origine"], enregistre["reprise"]) == (lu["origine"], lu["reprise"])
    # Un code figé par la reprise ne change plus.
    change = copy.deepcopy(lu["modele"])
    par_id(change)["instance_service-1a2b3c4d"]["code"] = "INSTANCE_SERVICE_ACTIONS"
    r = client.put(f"/api/studio/bundles/{bundle['id']}/brouillon", headers=entetes,
                   json={"modele": change, "mise_en_page": lu["mise_en_page"], "revision_attendue": 1})
    assert r.status_code == 422
    assert r.json()["code"] == "CODE_FIGE"
    assert r.json()["detail"] == ("Ce code a déjà été publié (version 1) : il ne change plus. "
                                  "Renommez plutôt le nom affiché.")


def test_un_preset_devient_un_brouillon_au_nouveau_format(client, entetes):
    slug = uniq("rosmaster-m3pro-accueil")
    with SessionLocal() as db:
        db.add(CompositionPreset(slug=slug, nom="ROSMASTER M3 Pro - accueil", famille="rosmaster-m3pro",
                                 spec=COMPLET, statut="published"))
        db.commit()
    r = client.post("/api/studio/bundles", headers=entetes,
                    json={"nom": "Accueil du magasin de Lyon", "depart": {"sorte": "PRESET", "slug": slug}})
    assert r.status_code == 201, r.text
    lu = client.get(f"/api/studio/bundles/{r.json()['id']}/brouillon", headers=entetes).json()
    assert (lu["revision"], lu["origine"]) == (1, {"sorte": "PRESET", "slug": slug})
    # Le bundle garde son nom ; le contenu vient du préset.
    assert lu["modele"]["bundle"]["nom"] == "Accueil du magasin de Lyon"
    assert lu["modele"]["bundle"]["code"] == "BUNDLE_DEPLOIEMENT_ACCUEIL_DU_MAGASIN_DE_LYON"
    assert lu["modele"]["elements"] == reprendre().modele["elements"]
    assert lu["reprise"]["problemes"]
    with SessionLocal() as db:
        assert db.execute(select(CompositionPreset.spec).where(CompositionPreset.slug == slug)).scalar_one() == COMPLET

    inconnu = client.post("/api/studio/bundles", headers=entetes,
                          json={"nom": uniq("Accueil"), "depart": {"sorte": "PRESET", "slug": "preset-inconnu"}})
    assert (inconnu.status_code, inconnu.json()["detail"]) == (404, "Préset inconnu")
    sans_slug = client.post("/api/studio/bundles", headers=entetes,
                            json={"nom": uniq("Accueil"), "depart": {"sorte": "PRESET"}})
    assert sans_slug.status_code == 422
