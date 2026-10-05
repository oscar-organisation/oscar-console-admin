"""La migration 0014 (« agent » devient « unité »), jouée pour de vrai.

Chaque test part d'une base vide, la monte par Alembic jusqu'à 0013 comme en
production, la remplit de données à l'ancien format, puis joue la migration :
montée, contrôle de chaque champ et de chaque empreinte, descente, contrôle du
retour exact, et remontée.

Alembic tourne dans un processus à part, par la même commande que
docker-entrypoint.sh (`alembic upgrade head`), sur sa propre base : la base des
autres tests n'est pas touchée.

Par défaut, la base est un fichier SQLite jetable. Pour jouer les mêmes tests
sur PostgreSQL, la base de production, on donne l'adresse d'une base vide et
jetable dans OSCAR_TEST_MIGRATION_URL ; chaque test en efface alors tout le
contenu (schéma public) avant de commencer.
"""

import copy
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
from datetime import datetime, timezone

import pytest
import sqlalchemy as sa

from app.bundle_spec import convertir_composition, empreinte, manifeste_runtime
from test_unites import composition_ancienne, composition_nouvelle

DOSSIER_API = pathlib.Path(__file__).resolve().parents[1]
FICHIER_MIGRATION = DOSSIER_API / "alembic" / "versions" / "0014_agent_devient_unite.py"

# Les tables que la migration lit ou écrit, et celles qu'elle ne doit pas toucher.
TABLES = ("robots", "bundle_versions", "composition_presets", "features", "role_permissions",
          "permission_group_permissions", "audit_logs", "bundle_deployments")

MAINTENANT = datetime(2026, 10, 5, 9, 30, tzinfo=timezone.utc)


def _migration():
    """Le fichier de la migration, chargé comme un module, pour ses calculs v1."""
    spec = importlib.util.spec_from_file_location("migration_0014", FICHIER_MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def base(tmp_path):
    url = os.environ.get("OSCAR_TEST_MIGRATION_URL") or f"sqlite:///{tmp_path / 'migration.db'}"
    moteur = sa.create_engine(url, future=True)
    if moteur.dialect.name == "postgresql":
        with moteur.begin() as connexion:
            connexion.execute(sa.text("DROP SCHEMA public CASCADE"))
            connexion.execute(sa.text("CREATE SCHEMA public"))
    yield url, moteur
    moteur.dispose()


def alembic(url: str, *arguments: str) -> None:
    environnement = {**os.environ, "DATABASE_URL": url}
    resultat = subprocess.run([sys.executable, "-m", "alembic", *arguments], cwd=DOSSIER_API,
                              env=environnement, capture_output=True, text=True)
    assert resultat.returncode == 0, resultat.stderr


def monter_jusqu_a_0013(url: str, moteur) -> None:
    """Une base vide, amenée à la révision 0013.

    Sur PostgreSQL, toute la chaîne des migrations joue, de 0001 à 0013. Sur
    SQLite, c'est impossible : dès 0002, des migrations modifient des tables
    par ALTER, ce que SQLite ne sait pas faire. La base « à 0013 » y est donc
    construite depuis les modèles de l'application, les deux colonnes du robot
    remises sous leur nom d'avant 0014, puis marquée 0013 : le chemin que
    docker-entrypoint.sh prend déjà pour une base existante sans Alembic.
    """
    if moteur.dialect.name != "sqlite":
        alembic(url, "upgrade", "0013")
        return
    import app.models  # noqa: F401  (déclare toutes les tables)
    from app.database import Base

    Base.metadata.create_all(moteur)
    with moteur.begin() as connexion:
        for ancienne, nouvelle in _migration().COLONNES_DU_ROBOT:
            connexion.execute(sa.text(f"ALTER TABLE robots RENAME COLUMN {nouvelle} TO {ancienne}"))
    alembic(url, "stamp", "0013")


def instantane(moteur) -> dict:
    """Tout ce que contiennent les tables, les colonnes JSON lues comme le
    texte enregistré : le retour doit être exact au caractère près."""
    meta = sa.MetaData()
    meta.reflect(bind=moteur, only=TABLES)
    contenu = {}
    with moteur.connect() as connexion:
        for nom in TABLES:
            table = meta.tables[nom]
            colonnes = [sa.cast(c, sa.Text).label(c.name) if isinstance(c.type, sa.JSON) else c
                        for c in table.columns]
            lignes = connexion.execute(sa.select(*colonnes)).mappings().all()
            contenu[nom] = sorted((dict(ligne) for ligne in lignes), key=lambda l: str(l["id"]))
    return contenu


def colonnes(moteur, table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(moteur).get_columns(table)}


def forme_de_la_table_robots(moteur) -> dict:
    """Colonnes, index, contraintes : sur SQLite, renommer une colonne
    reconstruit la table, et rien ne doit s'y perdre."""
    inspecteur = sa.inspect(moteur)
    return {
        "colonnes": [(c["name"], str(c["type"]), c["nullable"]) for c in inspecteur.get_columns("robots")],
        "index": sorted((i["name"], tuple(i["column_names"]), bool(i["unique"]))
                        for i in inspecteur.get_indexes("robots")),
        "uniques": sorted(tuple(u["column_names"]) for u in inspecteur.get_unique_constraints("robots")),
        "cles_etrangeres": sorted((tuple(f["constrained_columns"]), f["referred_table"])
                                  for f in inspecteur.get_foreign_keys("robots")),
    }


def lire(moteur, requete: str, **parametres) -> list:
    with moteur.connect() as connexion:
        return connexion.execute(sa.text(requete), parametres).fetchall()


def spec_enregistree(moteur, table: str, ligne_id: str):
    texte = lire(moteur, f"SELECT CAST(spec AS TEXT) FROM {table} WHERE id = :id", id=ligne_id)[0][0]
    return json.loads(texte)


def remplir_a_l_ancien_format(moteur) -> dict:
    """Des données comme celles d'une console d'avant le renommage."""
    migration = _migration()
    v1, empreinte_v1 = migration.ANCIEN, migration._empreinte
    brouillon = composition_ancienne()
    brouillon["nodes"][2]["data"]["agents"][1]["name"] = "Module 2"

    lignes = {
        "organisations": [dict(id="org1", nom="Magasins Durand", slug="magasins-durand", statut="active")],
        "users": [dict(id="usr1", email="chef.projet@magasins-durand.fr", nom="Chef de projet",
                       statut="active", is_superadmin=False)],
        "robots": [
            dict(id="rob1", org_id="org1", nom="OSCAR-02", slug="oscar-02", statut="offline",
                 capacites=["camera"], edge_channel="stable",
                 agent_key_hash="a" * 64, agent_key_issued_at=MAINTENANT),
            dict(id="rob2", org_id="org1", nom="OSCAR-03", slug="oscar-03", statut="offline",
                 capacites=[], edge_channel="beta", agent_key_hash=None, agent_key_issued_at=None),
        ],
        "deployment_bundles": [dict(id="bun1", org_id="org1", nom="Robot magasin", slug="robot-magasin",
                                    target="ENVIRONNEMENT_EXECUTION_ROBOT", statut="active")],
        "bundle_versions": [
            # Publiée, empreinte exacte au format v1.
            dict(id="ver1", bundle_id="bun1", numero=1, statut="published", spec=composition_ancienne(),
                 checksum=empreinte_v1(composition_ancienne(), v1), published_at=MAINTENANT),
            # Publiée plus tôt, avec une empreinte que le calcul d'aujourd'hui ne
            # redonnerait pas : la descente doit pourtant la rendre telle quelle.
            dict(id="ver2", bundle_id="bun1", numero=2, statut="archived", spec=composition_ancienne(),
                 checksum="0123456789abcdef" * 4, published_at=MAINTENANT),
            # Le brouillon en cours.
            dict(id="ver3", bundle_id="bun1", numero=3, statut="draft", spec=brouillon,
                 checksum=empreinte_v1(brouillon, v1), published_at=None),
            # Une ancienne version sans empreinte, à la composition vide : rien à inventer.
            dict(id="ver4", bundle_id="bun1", numero=0, statut="archived", spec={"nodes": [], "edges": []},
                 checksum=None, published_at=None),
        ],
        "composition_presets": [
            dict(id="pre1", slug="rosmaster-m3pro-magasin", nom="ROSMASTER M3 Pro - magasin",
                 famille="rosmaster-m3pro", spec=composition_ancienne(), statut="published",
                 ordre=10, revision=1),
            dict(id="pre2", slug="forme-inattendue", nom="Forme inattendue", famille="essai",
                 spec={"nodes": "pas une liste"}, statut="draft", ordre=100, revision=1),
            dict(id="pre3", slug="pas-un-objet", nom="Pas un objet", famille="essai",
                 spec=[1, 2, 3], statut="draft", ordre=100, revision=1),
        ],
        "features": [
            dict(id="fea1", code="api:robot.agent_key", label="Émettre la clé d'agent embarqué d'un robot",
                 type="api", module="robots", actions=["view", "execute"]),
            dict(id="fea2", code="api:robot.read", label="Lire les robots", type="api", module="robots",
                 actions=["view"]),
        ],
        "roles": [dict(id="rol1", org_id="org1", nom="Intégrateur", is_system=False, visibility="private")],
        "role_permissions": [
            dict(role_id="rol1", feature_id="fea1", actions=["view", "execute"]),
            dict(role_id="rol1", feature_id="fea2", actions=["view"]),
        ],
        "permission_groups": [dict(id="grp1", org_id="org1", nom="Déploiement", visibility="private")],
        "permission_group_permissions": [dict(group_id="grp1", feature_id="fea1", actions=["execute"])],
        "audit_logs": [dict(id="aud1", ts=MAINTENANT, actor_label="Chef de projet",
                            action="ROBOT_AGENT_KEY_ISSUE", resource="OSCAR-02", result="success")],
        "bundle_deployments": [dict(id="dep1", org_id="org1", version_id="ver1", robot_id="rob1",
                                    statut="active", report={"conteneurs": 3}, applied_at=MAINTENANT)],
    }
    meta = sa.MetaData()
    meta.reflect(bind=moteur)
    with moteur.begin() as connexion:
        for nom, valeurs in lignes.items():
            connexion.execute(sa.insert(meta.tables[nom]), valeurs)
    return lignes


def test_montee_controle_descente_retour_exact_et_remontee(base):
    url, moteur = base
    monter_jusqu_a_0013(url, moteur)
    lignes = remplir_a_l_ancien_format(moteur)
    avant = instantane(moteur)
    forme_avant = forme_de_la_table_robots(moteur)

    # --- Montée ---------------------------------------------------------- #
    alembic(url, "upgrade", "head")
    apres = instantane(moteur)

    # Les colonnes du robot ont changé de nom, pas de valeur.
    assert {"machine_key_hash", "machine_key_issued_at"} <= colonnes(moteur, "robots")
    assert not {"agent_key_hash", "agent_key_issued_at"} & colonnes(moteur, "robots")
    for ligne_avant, ligne_apres in zip(avant["robots"], apres["robots"]):
        assert ligne_apres["machine_key_hash"] == ligne_avant["agent_key_hash"]
        assert ligne_apres["machine_key_issued_at"] == ligne_avant["agent_key_issued_at"]
    assert apres["robots"][0]["machine_key_hash"] == "a" * 64

    # Chaque composition est au format « unité », exactement comme l'application
    # la convertit, et l'empreinte est celle que le serveur recalcule.
    for ligne in lignes["bundle_versions"]:
        enregistree = spec_enregistree(moteur, "bundle_versions", ligne["id"])
        assert enregistree == convertir_composition(ligne["spec"])
        checksum = next(v["checksum"] for v in apres["bundle_versions"] if v["id"] == ligne["id"])
        if ligne["checksum"] is None:
            assert checksum is None
        else:
            assert checksum == empreinte(manifeste_runtime(enregistree))
    assert spec_enregistree(moteur, "bundle_versions", "ver1") == composition_nouvelle()
    assert next(v for v in apres["bundle_versions"] if v["id"] == "ver2")["checksum"] == \
        next(v for v in apres["bundle_versions"] if v["id"] == "ver1")["checksum"]

    assert spec_enregistree(moteur, "composition_presets", "pre1") == composition_nouvelle()
    # Les formes inattendues restent telles quelles, au caractère près.
    for preset_id in ("pre2", "pre3"):
        assert next(p for p in apres["composition_presets"] if p["id"] == preset_id) == \
            next(p for p in avant["composition_presets"] if p["id"] == preset_id)

    # La permission change de code, pas d'identifiant : le rôle et le groupe la gardent.
    assert [(f["id"], f["code"]) for f in apres["features"]] == [
        ("fea1", "api:robot.machine_key"), ("fea2", "api:robot.read")]
    assert apres["role_permissions"] == avant["role_permissions"]
    assert apres["permission_group_permissions"] == avant["permission_group_permissions"]

    # L'histoire ne se réécrit pas.
    assert apres["audit_logs"] == avant["audit_logs"]
    assert apres["bundle_deployments"] == avant["bundle_deployments"]
    assert sa.inspect(moteur).has_table("sauvegarde_avant_0014")

    # --- Descente : retour exact ----------------------------------------- #
    alembic(url, "downgrade", "0013")
    assert instantane(moteur) == avant
    assert forme_de_la_table_robots(moteur) == forme_avant
    assert not sa.inspect(moteur).has_table("sauvegarde_avant_0014")

    # --- Remontée : le même résultat que la première fois ---------------- #
    alembic(url, "upgrade", "head")
    assert instantane(moteur) == apres


def test_une_composition_modifiee_apres_la_montee_n_est_pas_ecrasee(base):
    """La descente ne rend pas une sauvegarde périmée : le travail fait après
    la montée est gardé, reconverti à l'ancien format."""
    url, moteur = base
    monter_jusqu_a_0013(url, moteur)
    remplir_a_l_ancien_format(moteur)
    alembic(url, "upgrade", "head")

    # Le brouillon est modifié avec la nouvelle console : une unité de plus.
    modifie = spec_enregistree(moteur, "bundle_versions", "ver3")
    nouvelle_unite = copy.deepcopy(modifie["nodes"][2]["data"]["units"][1])
    nouvelle_unite.update(id="unit-4d5e6f70", name="Unité 3", technicalCode="INSTANCE_UNITE_3")
    modifie["nodes"][2]["data"]["units"].append(nouvelle_unite)
    with moteur.begin() as connexion:
        connexion.execute(sa.text("UPDATE bundle_versions SET spec = :spec, checksum = :checksum "
                                  "WHERE id = 'ver3'"),
                          {"spec": json.dumps(modifie), "checksum": empreinte(manifeste_runtime(modifie))})

    alembic(url, "downgrade", "0013")
    migration = _migration()
    rendue = spec_enregistree(moteur, "bundle_versions", "ver3")
    unites = rendue["nodes"][2]["data"]["agents"]
    assert [u["technicalCode"] for u in unites] == [
        "INSTANCE_AGENT_PILOTAGE_DEPLACEMENT", "INSTANCE_AGENT_MODULE_1", "INSTANCE_AGENT_3"]
    assert {u["agentType"] for u in unites} == {"TYPE_AGENT_CONTROLE_ACTION_ROBOT", "TYPE_AGENT_STANDARD"}
    assert unites[2]["id"] == "unit-4d5e6f70"
    checksum = lire(moteur, "SELECT checksum FROM bundle_versions WHERE id = 'ver3'")[0][0]
    assert checksum == migration._empreinte(rendue, migration.ANCIEN)
    # Les autres reviennent exactement.
    assert spec_enregistree(moteur, "bundle_versions", "ver1") == composition_ancienne()


def test_une_permission_deja_creee_sous_son_nouveau_nom_est_fusionnee(base):
    """Si l'application a démarré sur le nouveau code avant la migration, les
    deux permissions existent : personne ne doit perdre son droit."""
    url, moteur = base
    monter_jusqu_a_0013(url, moteur)
    remplir_a_l_ancien_format(moteur)
    with moteur.begin() as connexion:
        connexion.execute(sa.text(
            "INSERT INTO features (id, code, label, type, module, actions) "
            "VALUES ('fea3', 'api:robot.machine_key', 'Clé', 'api', 'robots', '[\"view\"]')"))
        connexion.execute(sa.text(
            "INSERT INTO roles (id, org_id, nom, is_system, visibility) "
            "VALUES ('rol2', 'org1', 'Opérateur', false, 'private')"))
        connexion.execute(sa.text(
            "INSERT INTO role_permissions (role_id, feature_id, actions) VALUES "
            "('rol2', 'fea1', '[\"view\"]'), ('rol2', 'fea3', '[\"view\"]')"))

    alembic(url, "upgrade", "head")
    codes = [ligne[0] for ligne in lire(moteur, "SELECT code FROM features ORDER BY code")]
    assert codes == ["api:robot.machine_key", "api:robot.read"]
    droits = lire(moteur, "SELECT role_id, feature_id FROM role_permissions "
                          "WHERE feature_id = 'fea3' ORDER BY role_id")
    assert [tuple(d) for d in droits] == [("rol1", "fea3"), ("rol2", "fea3")]
    groupes = lire(moteur, "SELECT group_id FROM permission_group_permissions WHERE feature_id = 'fea3'")
    assert [g[0] for g in groupes] == ["grp1"]
