"""Le brouillon d'un bundle au nouveau format (lot L1, élément L1-4 ; étape S4).

Le brouillon est le travail en cours du Studio : un modèle (oscar.bundle/1) et
sa mise en page, enregistrés par révision entière. Chaque enregistrement dit
de quelle révision il part : si quelqu'un a enregistré entre-temps, le serveur
refuse sans rien écraser. Le serveur revérifie tout le document à chaque fois.
Enregistrer et vérifier ne créent jamais ni version ni déploiement.
"""

import copy
import json
import uuid
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import (
    AiModelBoxAssignment, BrouillonBundle, BundleDeployment, BundleVersion, Feature, LiveKitToken,
    Organisation, Role, RolePermission, User, UserOrganisation, UserRole,
)
from app.security import hash_password

DONNEES = Path(__file__).resolve().parent / "donnees"
MODELE_DE_REFERENCE = json.loads(
    (DONNEES / "formats_oscar_v1" / "exemples" / "bundle" / "valides" / "bundle-reference-l1.json")
    .read_text(encoding="utf-8"))
MISE_EN_PAGE_DE_REFERENCE = json.loads((DONNEES / "mise-en-page-reference-L1.json").read_text(encoding="utf-8"))


def uniq(prefixe: str) -> str:
    return f"{prefixe}-{uuid.uuid4().hex[:8]}"


def nouvelle_organisation(client, admin_headers) -> dict:
    org = client.post("/api/organisations", headers=admin_headers,
                      json={"nom": uniq("Magasins Durand"), "slug": uniq("magasins-durand")}).json()
    return {**admin_headers, "X-Organization-ID": org["id"]}


@pytest.fixture()
def entetes(client, admin_headers):
    return nouvelle_organisation(client, admin_headers)


@pytest.fixture()
def bundle(client, entetes):
    r = client.post("/api/studio/bundles", headers=entetes,
                    json={"nom": uniq("Téléopération du M3"), "description": "Piloter le M3 à distance.",
                          "depart": {"sorte": "VIDE"}})
    assert r.status_code == 201, r.text
    return r.json()


def chemin(bundle: dict, suite: str = "") -> str:
    return f"/api/studio/bundles/{bundle['id']}/brouillon{suite}"


def enregistrer(client, entetes, bundle, modele, mise_en_page=None, revision=1):
    return client.put(chemin(bundle), headers=entetes, json={
        "modele": modele, "mise_en_page": mise_en_page or MISE_EN_PAGE_DE_REFERENCE,
        "revision_attendue": revision})


def reference() -> dict:
    return copy.deepcopy(MODELE_DE_REFERENCE)


def element(modele: dict, element_id: str) -> dict:
    return next(e for e in modele["elements"] if e["id"] == element_id)


# --------------------------------------------------------------------------- #
#  Créer, enregistrer, relire
# --------------------------------------------------------------------------- #
def test_un_bundle_cree_vide_a_son_brouillon_a_la_revision_un(client, entetes, bundle):
    assert bundle["format_brouillon"] == "oscar.bundle/1"
    r = client.get(chemin(bundle), headers=entetes)
    assert r.status_code == 200, r.text
    brouillon = r.json()
    assert brouillon["bundle_id"] == bundle["id"]
    assert (brouillon["format"], brouillon["revision"], brouillon["etat"]) == (
        "oscar.bundle/1", 1, "ETAT_BROUILLON_BUNDLE_EN_EDITION")
    assert brouillon["origine"] == {"sorte": "VIDE"}
    assert brouillon["reprise"] is None
    assert brouillon["modele"]["format"] == "oscar.bundle/1"
    assert brouillon["modele"]["bundle"]["nom"] == bundle["nom"]
    assert brouillon["modele"]["bundle"]["code"].startswith("BUNDLE_DEPLOIEMENT_TELEOPERATION_DU_M3_")
    assert (brouillon["modele"]["elements"], brouillon["modele"]["liaisons"]) == ([], [])
    assert brouillon["mise_en_page"] == {"format": "oscar.mise-en-page/1", "blocs": {}}
    assert brouillon["modifie_le"] and brouillon["modifie_par"]


def test_le_bundle_de_reference_se_relit_a_l_identique(client, entetes, bundle):
    r = enregistrer(client, entetes, bundle, reference())
    assert r.status_code == 200, r.text
    assert r.json()["revision"] == 2
    assert len(r.json()["empreinte_modele"]) == 64

    relu = client.get(chemin(bundle), headers=entetes).json()
    assert relu["modele"] == MODELE_DE_REFERENCE
    assert relu["mise_en_page"] == MISE_EN_PAGE_DE_REFERENCE
    assert relu["revision"] == 2
    assert [e["sorte"] for e in relu["modele"]["elements"]].count("COMPOSANT_SALLE_TEMPS_REEL") == 1


def test_robot_serveur_et_application_dans_le_meme_brouillon(client, entetes, bundle):
    assert enregistrer(client, entetes, bundle, reference()).status_code == 200
    relu = client.get(chemin(bundle), headers=entetes).json()
    types = {e["type"]["code"] for e in relu["modele"]["elements"] if e["sorte"] == "ZONE_ENVIRONNEMENT_EXECUTION"}
    assert types == {"TYPE_ENVIRONNEMENT_EXECUTION_ROBOT", "TYPE_ENVIRONNEMENT_EXECUTION_SERVEUR",
                     "TYPE_ENVIRONNEMENT_EXECUTION_NAVIGATEUR_WEB"}
    liste = client.get("/api/studio/bundles", headers=entetes).json()
    (dans_la_liste,) = [b for b in liste if b["id"] == bundle["id"]]
    # Les compteurs se lisent sur le brouillon : deux services et une application, trois unités.
    assert (dans_la_liste["component_count"], dans_la_liste["unit_count"], dans_la_liste["agent_count"]) == (3, 3, 3)


def test_le_brouillon_cite_un_type_sans_le_recopier(client, entetes, bundle):
    assert enregistrer(client, entetes, bundle, reference()).status_code == 200
    with SessionLocal() as db:
        enregistre = db.execute(select(BrouillonBundle).where(BrouillonBundle.bundle_id == bundle["id"])).scalar_one()
        types = [e["type"] for e in enregistre.modele["elements"] if "type" in e]
    assert types and all(set(t) == {"code", "version"} for t in types)


def test_enregistrer_le_meme_contenu_ne_change_pas_la_revision(client, entetes, bundle):
    assert enregistrer(client, entetes, bundle, reference()).json()["revision"] == 2
    encore = enregistrer(client, entetes, bundle, reference(), revision=2)
    assert encore.status_code == 200
    assert encore.json()["revision"] == 2


def test_deplacer_un_bloc_ne_change_pas_l_empreinte_du_modele(client, entetes, bundle):
    premiere = enregistrer(client, entetes, bundle, reference()).json()
    deplacee = copy.deepcopy(MISE_EN_PAGE_DE_REFERENCE)
    deplacee["blocs"]["svc-02"] = {"x": 480, "y": 400}
    seconde = enregistrer(client, entetes, bundle, reference(), deplacee, revision=2).json()
    assert seconde["revision"] == 3
    assert seconde["empreinte_modele"] == premiere["empreinte_modele"]
    assert client.get(chemin(bundle), headers=entetes).json()["mise_en_page"] == deplacee

    renomme = reference()
    element(renomme, "svc-02")["nom"] = "Service vidéo du robot"
    troisieme = enregistrer(client, entetes, bundle, renomme, deplacee, revision=3).json()
    assert troisieme["empreinte_modele"] != premiere["empreinte_modele"]


# --------------------------------------------------------------------------- #
#  Ce qui est refusé, sans rien écrire
# --------------------------------------------------------------------------- #
def test_un_brouillon_refuse_n_est_pas_enregistre(client, entetes, bundle):
    assert enregistrer(client, entetes, bundle, reference()).status_code == 200
    avant = client.get(chemin(bundle), headers=entetes).json()

    hors_zone = reference()
    element(hors_zone, "svc-01")["parent"] = None
    r = enregistrer(client, entetes, bundle, hors_zone, revision=2)
    assert r.status_code == 422
    assert r.json() == {
        "detail": "Un service se place dans une zone d'environnement, jamais directement dans le bundle. "
                  "Déposez-le dans : Robot M3 Pro, Serveur de traitement.",
        "code": "SERVICE_HORS_ZONE",
        "element": "svc-01",
        "parents_compatibles": ["zon-01", "zon-02"],
    }
    assert client.get(chemin(bundle), headers=entetes).json() == avant


def test_une_deuxieme_salle_est_refusee_par_le_serveur(client, entetes, bundle):
    deux_salles = reference()
    deux_salles["elements"].append({**element(deux_salles, "sal-01"), "id": "sal-02",
                                    "code": "COMPOSANT_SALLE_TEMPS_REEL_BIS"})
    r = enregistrer(client, entetes, bundle, deux_salles)
    assert (r.status_code, r.json()["code"], r.json()["element"]) == (422, "SALLE_EN_DOUBLE", "sal-02")


def test_un_type_inconnu_du_catalogue_est_refuse(client, entetes, bundle):
    inconnu = reference()
    element(inconnu, "svc-01")["type"] = {"code": "TYPE_SERVICE_GENERIQUE", "version": "7.0.0"}
    r = enregistrer(client, entetes, bundle, inconnu)
    assert r.status_code == 422
    assert r.json()["code"] == "TYPE_INCONNU_DU_CATALOGUE"
    assert r.json()["detail"] == ("Le type TYPE_SERVICE_GENERIQUE en version 7.0.0 n'est pas au catalogue. "
                                  "Choisissez un type proposé par la palette.")


def test_une_revision_depassee_est_refusee_sans_ecraser(client, entetes, bundle):
    assert enregistrer(client, entetes, bundle, reference()).status_code == 200
    avant = client.get(chemin(bundle), headers=entetes).json()

    autre_poste = reference()
    element(autre_poste, "svc-02")["nom"] = "Modifié depuis un autre poste"
    r = enregistrer(client, entetes, bundle, autre_poste, revision=1)
    assert r.status_code == 409
    assert r.json() == {
        "detail": "Ce brouillon a été modifié depuis un autre poste (révision 2). Rechargez-le pour voir ces "
                  "changements ; vos modifications restent proposées à côté.",
        "code": "BROUILLON_MODIFIE_AILLEURS",
        "revision_serveur": 2,
    }
    assert client.get(chemin(bundle), headers=entetes).json() == avant


def test_un_format_inconnu_est_refuse(client, entetes, bundle):
    r = enregistrer(client, entetes, bundle, {**reference(), "format": "oscar.bundle/2"})
    assert r.status_code == 422
    assert r.json() == {"detail": "Ce serveur lit le format oscar.bundle/1, pas « oscar.bundle/2 ». "
                                  "Rechargez le Studio.", "code": "FORMAT_INCONNU"}
    r = enregistrer(client, entetes, bundle, reference(), {"format": "oscar.mise-en-page/9", "blocs": {}})
    assert (r.status_code, r.json()["code"]) == (422, "FORMAT_INCONNU")
    assert "oscar.mise-en-page/1" in r.json()["detail"]


def test_une_structure_mal_formee_est_refusee(client, entetes, bundle):
    abime = reference()
    element(abime, "trt-01")["id"] = "trt 01"
    r = enregistrer(client, entetes, bundle, abime)
    assert r.status_code == 422
    assert r.json()["code"] == "STRUCTURE_INVALIDE"
    assert r.json()["detail"] == ("La composition est mal formée (modele/elements/6/id). Rechargez le Studio ; "
                                  "si cela se reproduit, signalez-le.")
    assert client.get(chemin(bundle), headers=entetes).json()["revision"] == 1


def test_un_code_fige_ne_change_pas_par_l_api(client, entetes, bundle):
    fige = reference()
    element(fige, "svc-01")["code_fige"] = True
    assert enregistrer(client, entetes, bundle, fige).status_code == 200
    change = copy.deepcopy(fige)
    element(change, "svc-01")["code"] = "INSTANCE_SERVICE_CONFIGUREE_ACTIONS"
    r = enregistrer(client, entetes, bundle, change, revision=2)
    assert (r.status_code, r.json()["code"]) == (422, "CODE_FIGE")


# --------------------------------------------------------------------------- #
#  Vérifier, sans rien écrire ni rien exécuter
# --------------------------------------------------------------------------- #
def compter(db) -> dict:
    return {table.__tablename__: db.execute(select(func.count()).select_from(table)).scalar_one()
            for table in (BundleVersion, BundleDeployment, AiModelBoxAssignment, LiveKitToken)}


def test_enregistrer_et_verifier_ne_creent_ni_version_ni_deploiement(client, entetes, bundle):
    with SessionLocal() as db:
        avant = compter(db)
    assert enregistrer(client, entetes, bundle, reference()).status_code == 200
    assert client.post(chemin(bundle, "/verification"), headers=entetes).status_code == 200
    with SessionLocal() as db:
        assert compter(db) == avant


def test_verifier_n_ecrit_rien(client, entetes, bundle):
    assert enregistrer(client, entetes, bundle, reference()).status_code == 200
    avant = client.get(chemin(bundle), headers=entetes).json()
    r = client.post(chemin(bundle, "/verification"), headers=entetes)
    assert r.status_code == 200, r.text
    assert client.get(chemin(bundle), headers=entetes).json() == avant


def test_la_verification_rend_les_problemes_a_corriger_et_a_regarder(client, entetes, bundle):
    a_regarder = reference()
    del element(a_regarder, "zon-03")["type"]          # une zone « à préciser »
    a_regarder["liaisons"] = []                        # deux canaux temps réel non reliés
    a_regarder["elements"] = [e for e in a_regarder["elements"]
                              if e["id"] not in {"uni-03", "trt-03", "itf-03", "bnd-03", "bre-03", "bem-03"}]
    assert enregistrer(client, entetes, bundle, a_regarder).status_code == 200

    rapport = client.post(chemin(bundle, "/verification"), headers=entetes).json()
    assert rapport["revision"] == 2
    assert (rapport["erreurs"], rapport["avertissements"]) == (1, 3)
    assert problemes_par_code(rapport) == {
        "ZONE_A_PRECISER": [("ERREUR", "zon-03")],
        "COMPOSANT_SANS_UNITE": [("AVERTISSEMENT", "svc-02")],
        "CANAL_NON_RELIE": [("AVERTISSEMENT", "can-01"), ("AVERTISSEMENT", "can-02")],
    }

    # Deux formats différents aux deux bouts d'une liaison : une erreur.
    formats_differents = reference()
    element(formats_differents, "can-01")["reglages"]["format"] = "OBJET_JSON"
    assert enregistrer(client, entetes, bundle, formats_differents, revision=2).status_code == 200
    rapport = client.post(chemin(bundle, "/verification"), headers=entetes).json()
    assert problemes_par_code(rapport) == {"FORMATS_DIFFERENTS": [("ERREUR", "lia-01")]}
    assert (rapport["erreurs"], rapport["avertissements"]) == (1, 0)


def problemes_par_code(rapport: dict) -> dict:
    par_code = {}
    for probleme in rapport["problemes"]:
        assert set(probleme) == {"niveau", "code", "titre", "explication", "correction", "element"}
        assert probleme["titre"] and probleme["explication"] and probleme["correction"]
        par_code.setdefault(probleme["code"], []).append((probleme["niveau"], probleme["element"]))
    return par_code


def test_la_verification_demande_un_brouillon_au_nouveau_format(client, entetes):
    ancien = client.post("/api/studio/bundles", headers=entetes, json={"nom": uniq("Accueil en magasin")}).json()
    r = client.post(chemin(ancien, "/verification"), headers=entetes)
    assert r.status_code == 409
    assert r.json() == {"detail": "Ce bundle n'a pas encore de brouillon au nouveau format : ouvrez-le dans le "
                                  "Studio.", "code": "BROUILLON_ABSENT"}


# --------------------------------------------------------------------------- #
#  Qui peut lire et écrire
# --------------------------------------------------------------------------- #
def test_le_brouillon_d_une_autre_organisation_est_introuvable(client, admin_headers, bundle):
    voisine = nouvelle_organisation(client, admin_headers)
    for reponse in (
        client.get(chemin(bundle), headers=voisine),
        enregistrer(client, voisine, bundle, reference()),
        client.post(chemin(bundle, "/verification"), headers=voisine),
    ):
        assert reponse.status_code == 404
        assert reponse.json()["detail"] == "Bundle introuvable"


def test_sans_le_droit_d_ecrire_rien_ne_s_enregistre(client, entetes, bundle):
    s = uuid.uuid4().hex[:6]
    org_id = entetes["X-Organization-ID"]
    with SessionLocal() as db:
        role = Role(nom=f"Lecteur du Studio {s}", visibility="private", org_id=org_id)
        db.add(role)
        db.flush()
        lecture = db.execute(select(Feature).where(Feature.code == "api:bundle.read")).scalar_one()
        db.add(RolePermission(role_id=role.id, feature_id=lecture.id, actions=["view"]))
        lecteur = User(email=f"lecteur-{s}@magasins-durand.fr", nom="Lecteur", statut="active",
                       password_hash=hash_password("un-mot-de-passe-assez-long"), org_id=org_id)
        db.add(lecteur)
        db.flush()
        db.add_all([UserOrganisation(user_id=lecteur.id, org_id=org_id, is_primary=True),
                    UserRole(user_id=lecteur.id, role_id=role.id, scope_type="org", scope_id=org_id)])
        db.commit()
    jeton = client.post("/api/auth/login", json={"email": f"lecteur-{s}@magasins-durand.fr",
                                                 "password": "un-mot-de-passe-assez-long"}).json()["access_token"]
    sien = {"Authorization": f"Bearer {jeton}", "X-Organization-ID": org_id}

    assert client.get(chemin(bundle), headers=sien).status_code == 200
    r = enregistrer(client, sien, bundle, reference())
    assert r.status_code == 403
    assert r.json()["detail"] == "Permission manquante : api:bundle.write:update"
    assert client.get(chemin(bundle), headers=entetes).json()["revision"] == 1


def test_chaque_probleme_a_son_titre_et_sa_correction():
    from app.studio_modele.regles import INVARIANTS
    from app.studio_modele.verification import TITRES

    assert set(INVARIANTS) <= set(TITRES)
    assert all(titre and correction for titre, correction in TITRES.values())
