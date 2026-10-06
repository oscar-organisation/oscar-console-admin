"""Ce qui sert à tous les tests qui jouent une migration pour de vrai.

Chaque test part d'une base vide et jetable, la monte par Alembic jusqu'à la
révision voulue, la remplit, puis joue la migration qu'il vérifie.

Alembic tourne dans un processus à part, par la même commande que
docker-entrypoint.sh (`alembic upgrade head`), sur sa propre base : la base des
autres tests n'est pas touchée.

Par défaut, la base est un fichier SQLite jetable. Pour jouer les mêmes tests
sur PostgreSQL, la base de production, on donne l'adresse d'une base vide et
jetable dans OSCAR_TEST_MIGRATION_URL ; chaque test en efface alors tout le
contenu (schéma public) avant de commencer.
"""

import os
import pathlib
import subprocess
import sys

import pytest
import sqlalchemy as sa

DOSSIER_API = pathlib.Path(__file__).resolve().parents[1]


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


def alembic_en_echec(url: str, *arguments: str) -> str:
    """Joue une commande Alembic qui doit échouer, et rend ce qu'elle a écrit."""
    environnement = {**os.environ, "DATABASE_URL": url}
    resultat = subprocess.run([sys.executable, "-m", "alembic", *arguments], cwd=DOSSIER_API,
                              env=environnement, capture_output=True, text=True)
    assert resultat.returncode != 0, "la commande Alembic devait échouer"
    return resultat.stderr


def lire(moteur, requete: str, **parametres) -> list:
    with moteur.connect() as connexion:
        return connexion.execute(sa.text(requete), parametres).fetchall()


def monter_jusqu_a_0014(url: str, moteur) -> None:
    """Une base vide, amenée à la révision 0014 : la dernière avant le Studio de L1.

    Sur PostgreSQL, toute la chaîne des migrations joue, de 0001 à 0014. Sur
    SQLite, c'est impossible : dès 0002, des migrations modifient des tables
    par ALTER, ce que SQLite ne sait pas faire. La base y est donc construite
    depuis les modèles de l'application, qui décrivent la base d'aujourd'hui,
    puis ramenée à 0014 en jouant à l'envers les migrations qui suivent 0014,
    sur cette base encore vide.
    """
    if moteur.dialect.name != "sqlite":
        alembic(url, "upgrade", "0014")
        return
    import app.models  # noqa: F401  (déclare toutes les tables)
    from app.database import Base

    Base.metadata.create_all(moteur)
    alembic(url, "stamp", "head")
    alembic(url, "downgrade", "0014")


def instantane(moteur, tables) -> dict:
    """Tout ce que contiennent ces tables, les colonnes JSON lues comme le
    texte enregistré : un retour doit être exact au caractère près."""
    meta = sa.MetaData()
    meta.reflect(bind=moteur, only=list(tables))
    contenu = {}
    with moteur.connect() as connexion:
        for nom in tables:
            table = meta.tables[nom]
            colonnes = [sa.cast(c, sa.Text).label(c.name) if isinstance(c.type, sa.JSON) else c
                        for c in table.columns]
            lignes = connexion.execute(sa.select(*colonnes)).mappings().all()
            contenu[nom] = sorted((dict(ligne) for ligne in lignes), key=lambda l: str(l["id"]))
    return contenu


def forme(moteur, table: str) -> dict:
    """Colonnes, index, contraintes d'une table. Sur SQLite, ajouter ou retirer
    une colonne reconstruit la table, et rien ne doit s'y perdre, pas même la
    règle « supprimer en cascade » d'une clé étrangère."""
    inspecteur = sa.inspect(moteur)
    return {
        "colonnes": [(c["name"], str(c["type"]), c["nullable"]) for c in inspecteur.get_columns(table)],
        "index": sorted((i["name"], tuple(i["column_names"]), bool(i["unique"]))
                        for i in inspecteur.get_indexes(table)),
        "uniques": sorted(tuple(u["column_names"]) for u in inspecteur.get_unique_constraints(table)),
        "cles_etrangeres": sorted(
            (tuple(f["constrained_columns"]), f["referred_table"], tuple(f["referred_columns"]),
             (f.get("options") or {}).get("ondelete") or "")
            for f in inspecteur.get_foreign_keys(table)
        ),
    }
