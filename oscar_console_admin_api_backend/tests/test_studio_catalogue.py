"""Le catalogue du Studio (lot L1, élément L1-1).

Le catalogue dit quels types existent : les zones d'environnement, la salle
temps réel, le service, l'application, l'unité, et les pièces de la structure
d'une unité. Il vit dans des fichiers versionnés de la console
(app/seed_data/catalogue_studio/), recopiés en base au démarrage. Un brouillon
cite un type par son code et sa version, sans le recopier.

Règle d'immuabilité : une version publiée d'un type ne change plus. Un fichier
qui change le contenu d'un {code, version} déjà en base arrête le démarrage,
en nommant le fichier.
"""

import json
import shutil
import uuid

import pytest
import sqlalchemy as sa
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal
from app.models import TypeCatalogue, User, UserOrganisation, Organisation
from app.security import hash_password
from app.seed import run_seed
from app.studio_modele.catalogue import (
    DOSSIER_DU_CATALOGUE,
    CatalogueInvalide,
    charger_catalogue,
    familles,
    synchroniser_catalogue,
)
from app.studio_modele.sortes import SORTES

FAMILLES_DANS_L_ORDRE = [
    "FAMILLE_PALETTE_ENVIRONNEMENTS",
    "FAMILLE_PALETTE_TEMPS_REEL",
    "FAMILLE_PALETTE_APPAREILS",
    "FAMILLE_PALETTE_MESSAGERIE_EVENEMENTS",
    "FAMILLE_PALETTE_RESEAU_INTERNET",
    "FAMILLE_PALETTE_STOCKAGE",
    "FAMILLE_PALETTE_PROGRAMMES_EXISTANTS",
    "FAMILLE_PALETTE_SERVICES_APPLICATIONS",
]

# Les sept environnements de la spécification (§5.1), et la zone Externe.
ENVIRONNEMENTS = {
    "TYPE_ENVIRONNEMENT_EXECUTION_ROBOT", "TYPE_ENVIRONNEMENT_EXECUTION_SERVEUR",
    "TYPE_ENVIRONNEMENT_EXECUTION_NAVIGATEUR_WEB", "TYPE_ENVIRONNEMENT_EXECUTION_ORDINATEUR_BUREAU",
    "TYPE_ENVIRONNEMENT_EXECUTION_APPAREIL_MOBILE", "TYPE_ENVIRONNEMENT_EXECUTION_CASQUE_REALITE_VIRTUELLE",
    "TYPE_ENVIRONNEMENT_EXECUTION_SIMULATEUR", "TYPE_ENVIRONNEMENT_EXECUTION_EXTERNE",
}


def test_le_catalogue_sert_ses_familles_et_ses_types(client, admin_headers):
    r = client.get("/api/studio/catalogue", headers=admin_headers)
    assert r.status_code == 200, r.text
    catalogue = r.json()

    assert [f["code"] for f in catalogue["familles"]] == FAMILLES_DANS_L_ORDRE
    assert [f["ordre"] for f in catalogue["familles"]] == sorted(f["ordre"] for f in catalogue["familles"])
    assert all(f["nom"] for f in catalogue["familles"])

    types = {t["code"]: t for t in catalogue["types"]}
    assert ENVIRONNEMENTS <= set(types)
    assert {"COMPOSANT_SALLE_TEMPS_REEL", "TYPE_SERVICE_GENERIQUE", "TYPE_APPLICATION_GENERIQUE",
            "TYPE_UNITE_STANDARD", "BANDE_DONNEES", "BUS_RECEPTION", "BUS_EMISSION",
            "CANAL_RECEPTION", "CANAL_EMISSION"} <= set(types)
    robot = types["TYPE_ENVIRONNEMENT_EXECUTION_ROBOT"]
    assert robot == {**robot, "version": "1.0.0", "sorte": "ZONE_ENVIRONNEMENT_EXECUTION",
                     "famille": "FAMILLE_PALETTE_ENVIRONNEMENTS", "parents_autorises": ["BUNDLE_DEPLOIEMENT"],
                     "recoit": ["INSTANCE_SERVICE_CONFIGUREE"], "dans_la_palette": True}
    for champ in ("nom", "description", "exemple", "contenu_cree", "ordre"):
        assert champ in robot
    # La zone Externe existe dans le modèle, mais la palette ne la propose qu'avec ses connexions (L2).
    assert types["TYPE_ENVIRONNEMENT_EXECUTION_EXTERNE"]["dans_la_palette"] is False
    # Rangés par famille, puis dans l'ordre de chaque famille.
    rang = {code: i for i, code in enumerate(FAMILLES_DANS_L_ORDRE)}
    cles = [(rang[t["famille"]], t["ordre"], t["code"]) for t in catalogue["types"]]
    assert cles == sorted(cles)


def test_le_catalogue_demande_d_etre_connecte_et_d_avoir_le_droit(client):
    assert client.get("/api/studio/catalogue").status_code == 401

    s = uuid.uuid4().hex[:6]
    with SessionLocal() as db:
        org = Organisation(nom=f"Boulangerie Petit {s}", slug=f"boulangerie-petit-{s}")
        db.add(org)
        db.flush()
        sans_role = User(email=f"stagiaire-{s}@boulangerie-petit.fr", nom="Stagiaire", statut="active",
                         password_hash=hash_password("un-mot-de-passe-assez-long"), org_id=org.id)
        db.add(sans_role)
        db.flush()
        db.add(UserOrganisation(user_id=sans_role.id, org_id=org.id, is_primary=True))
        db.commit()
    jeton = client.post("/api/auth/login", json={"email": f"stagiaire-{s}@boulangerie-petit.fr",
                                                 "password": "un-mot-de-passe-assez-long"}).json()["access_token"]
    r = client.get("/api/studio/catalogue", headers={"Authorization": f"Bearer {jeton}"})
    assert r.status_code == 403
    assert r.json()["detail"] == "Permission manquante : api:bundle.read:view"


def test_chaque_fichier_du_catalogue_se_charge():
    entrees = charger_catalogue(DOSSIER_DU_CATALOGUE)
    codes_des_familles = {f["code"] for f in familles()}
    assert [f["code"] for f in familles()] == FAMILLES_DANS_L_ORDRE

    vus = set()
    for entree in entrees:
        cle = (entree.type.code, entree.type.version)
        assert cle not in vus, f"{cle} en double"
        vus.add(cle)
        assert entree.fichier.name == f"{entree.type.code}-{entree.type.version}.json"
        assert entree.type.famille in codes_des_familles
        assert entree.type.sorte in SORTES
        assert set(entree.type.recoit) <= set(SORTES)
        assert set(entree.type.contenu_cree) <= set(SORTES)
        assert set(entree.type.parents_autorises) <= set(SORTES) | {"BUNDLE_DEPLOIEMENT"}
        assert len(entree.empreinte) == 64
    codes = {code for code, _ in vus}
    assert ENVIRONNEMENTS <= codes
    # Chaque sorte qui cite un type en a au moins un au catalogue.
    for sorte in ("ZONE_ENVIRONNEMENT_EXECUTION", "COMPOSANT_SALLE_TEMPS_REEL", "INSTANCE_SERVICE_CONFIGUREE",
                  "INSTANCE_APPLICATION_CONFIGUREE", "INSTANCE_UNITE_CONFIGUREE"):
        assert any(entree.type.sorte == sorte for entree in entrees), sorte


@pytest.fixture()
def base_vide():
    """Une base en mémoire, à part : on y synchronise des catalogues d'essai
    sans toucher au catalogue de la base des autres tests."""
    import app.models  # noqa: F401  (déclare toutes les tables)

    moteur = sa.create_engine("sqlite://", future=True)
    Base.metadata.create_all(moteur)
    with Session(moteur) as db:
        yield db
    moteur.dispose()


def copier_le_catalogue(dossier):
    for fichier in DOSSIER_DU_CATALOGUE.iterdir():
        shutil.copy(fichier, dossier / fichier.name)
    return dossier


def test_un_type_publie_ne_change_plus_a_version_egale(base_vide, tmp_path):
    dossier = copier_le_catalogue(tmp_path)
    synchroniser_catalogue(base_vide, dossier)
    nombre = base_vide.execute(sa.select(sa.func.count()).select_from(TypeCatalogue)).scalar_one()
    assert nombre == len(charger_catalogue(dossier))

    # Rejouer la synchronisation ne change rien.
    synchroniser_catalogue(base_vide, dossier)
    assert base_vide.execute(sa.select(sa.func.count()).select_from(TypeCatalogue)).scalar_one() == nombre

    # Une nouvelle version s'ajoute à côté de l'ancienne.
    fichier = dossier / "TYPE_SERVICE_GENERIQUE-1.0.0.json"
    contenu = json.loads(fichier.read_text(encoding="utf-8"))
    nouvelle = {**contenu, "version": "1.1.0", "description": contenu["description"] + " Version corrigée."}
    (dossier / "TYPE_SERVICE_GENERIQUE-1.1.0.json").write_text(json.dumps(nouvelle, ensure_ascii=False),
                                                                encoding="utf-8")
    synchroniser_catalogue(base_vide, dossier)
    versions = base_vide.execute(sa.select(TypeCatalogue.version)
                                 .where(TypeCatalogue.code == "TYPE_SERVICE_GENERIQUE")).scalars().all()
    assert sorted(versions) == ["1.0.0", "1.1.0"]

    # Changer le contenu d'une version déjà publiée arrête tout, en nommant le fichier.
    fichier.write_text(json.dumps({**contenu, "nom": "Service modifié"}, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(CatalogueInvalide) as erreur:
        synchroniser_catalogue(base_vide, dossier)
    assert "TYPE_SERVICE_GENERIQUE-1.0.0.json" in str(erreur.value)
    assert "nouvelle version" in str(erreur.value)
    base_vide.rollback()
    enregistre = base_vide.execute(sa.select(TypeCatalogue).where(
        TypeCatalogue.code == "TYPE_SERVICE_GENERIQUE", TypeCatalogue.version == "1.0.0")).scalar_one()
    assert enregistre.nom == contenu["nom"]


def test_un_fichier_mal_forme_arrete_le_demarrage_en_le_nommant(base_vide, tmp_path):
    dossier = copier_le_catalogue(tmp_path)
    fichier = dossier / "TYPE_UNITE_STANDARD-1.0.0.json"
    contenu = json.loads(fichier.read_text(encoding="utf-8"))
    fichier.write_text(json.dumps({**contenu, "famille": "FAMILLE_PALETTE_INCONNUE"}), encoding="utf-8")
    with pytest.raises(CatalogueInvalide) as erreur:
        synchroniser_catalogue(base_vide, dossier)
    assert "TYPE_UNITE_STANDARD-1.0.0.json" in str(erreur.value)


def test_le_demarrage_remplit_le_catalogue(base_vide):
    run_seed(base_vide)
    codes = set(base_vide.execute(sa.select(TypeCatalogue.code)).scalars())
    assert ENVIRONNEMENTS <= codes
