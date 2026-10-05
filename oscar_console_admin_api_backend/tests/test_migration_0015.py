"""La migration 0015 (les fondations du Studio de L1), jouée pour de vrai.

Chaque test part d'une base vide, la monte jusqu'à 0014 comme en production,
la remplit comme une console d'aujourd'hui (deux organisations, des bundles,
leurs versions, un déploiement, un préset), puis joue la migration : montée,
contrôles, descente, retour exact, remontée.

La base jetable (SQLite, ou PostgreSQL par OSCAR_TEST_MIGRATION_URL) et la
façon de lancer Alembic sont communes à tous les tests de migration :
tests/migrations_jouees.py.
"""

from datetime import datetime, timezone

import sqlalchemy as sa

from migrations_jouees import alembic, base, forme, instantane, lire, monter_jusqu_a_0014  # noqa: F401
from test_unites import composition_nouvelle

MAINTENANT = datetime(2026, 10, 5, 22, 30, tzinfo=timezone.utc)

# Ce que la console contient avant L1. La migration ne doit rien y changer,
# sauf ajouter à chaque bundle son projet.
TABLES_D_AVANT = ("organisations", "users", "robots", "deployment_bundles", "bundle_versions",
                  "bundle_deployments", "composition_presets")
# Ce qu'elle ne doit jamais toucher, même pendant la montée.
TABLES_INTOUCHABLES = ("bundle_versions", "bundle_deployments", "composition_presets")
# Ce qu'elle ajoute.
TABLES_NOUVELLES = {"projets_robotiques", "types_catalogue"}


def remplir_comme_aujourd_hui(moteur) -> None:
    """Deux organisations : la première a deux bundles, dont un publié et
    déployé sur un robot ; la seconde, un bundle encore en brouillon."""
    lignes = {
        "organisations": [
            dict(id="org-durand", nom="Magasins Durand", slug="magasins-durand", statut="active"),
            dict(id="org-centre", nom="Pharmacie du Centre", slug="pharmacie-du-centre", statut="active"),
        ],
        "users": [dict(id="usr-claire", email="claire.martin@magasins-durand.fr", nom="Claire Martin",
                       statut="active", is_superadmin=False)],
        "robots": [dict(id="rob-oscar-02", org_id="org-durand", nom="OSCAR-02", slug="oscar-02",
                        statut="offline", capacites=["camera"], edge_channel="stable")],
        "deployment_bundles": [
            dict(id="bun-accueil", org_id="org-durand", nom="Accueil en magasin", slug="accueil-en-magasin",
                 target="ENVIRONNEMENT_EXECUTION_ROBOT", statut="active", created_by="usr-claire"),
            dict(id="bun-inventaire", org_id="org-durand", nom="Inventaire de nuit", slug="inventaire-de-nuit",
                 target="ENVIRONNEMENT_EXECUTION_ROBOT", statut="archived", created_by=None),
            dict(id="bun-officine", org_id="org-centre", nom="Officine", slug="officine",
                 target="ENVIRONNEMENT_EXECUTION_ROBOT", statut="active", created_by=None),
        ],
        "bundle_versions": [
            dict(id="ver-accueil-1", bundle_id="bun-accueil", numero=1, statut="published",
                 spec=composition_nouvelle(), checksum="ab" * 32, published_at=MAINTENANT),
            dict(id="ver-accueil-2", bundle_id="bun-accueil", numero=2, statut="draft",
                 spec=composition_nouvelle(), checksum="cd" * 32, published_at=None),
            dict(id="ver-officine-1", bundle_id="bun-officine", numero=1, statut="draft",
                 spec={"nodes": [], "edges": []}, checksum=None, published_at=None),
        ],
        "bundle_deployments": [dict(id="dep-oscar-02", org_id="org-durand", version_id="ver-accueil-1",
                                    robot_id="rob-oscar-02", statut="active", report={"conteneurs": 3},
                                    applied_at=MAINTENANT)],
        "composition_presets": [dict(id="pre-m3pro", slug="rosmaster-m3pro-magasin",
                                     nom="ROSMASTER M3 Pro - magasin", famille="rosmaster-m3pro",
                                     spec=composition_nouvelle(), statut="published", ordre=10, revision=1)],
    }
    meta = sa.MetaData()
    meta.reflect(bind=moteur)
    with moteur.begin() as connexion:
        for nom, valeurs in lignes.items():
            connexion.execute(sa.insert(meta.tables[nom]), valeurs)


def projets_par_organisation(moteur) -> dict:
    return {org_id: (code, statut, bool(d_office)) for org_id, code, statut, d_office in lire(
        moteur, "SELECT org_id, code, statut, cree_d_office FROM projets_robotiques ORDER BY org_id")}


def test_la_montee_cree_un_projet_par_organisation_et_y_range_les_bundles(base):
    url, moteur = base
    monter_jusqu_a_0014(url, moteur)
    remplir_comme_aujourd_hui(moteur)

    alembic(url, "upgrade", "head")

    assert TABLES_NOUVELLES <= set(sa.inspect(moteur).get_table_names())
    # Le catalogue vient des fichiers de la console, au démarrage : la
    # migration crée sa table et n'y met rien.
    assert lire(moteur, "SELECT count(*) FROM types_catalogue")[0][0] == 0
    assert projets_par_organisation(moteur) == {
        "org-centre": ("PROJET_ROBOTIQUE_PRINCIPAL", "active", True),
        "org-durand": ("PROJET_ROBOTIQUE_PRINCIPAL", "active", True),
    }
    rangement = lire(moteur, "SELECT b.id, b.org_id, p.org_id FROM deployment_bundles b "
                             "JOIN projets_robotiques p ON p.id = b.projet_id ORDER BY b.id")
    assert [tuple(ligne) for ligne in rangement] == [
        ("bun-accueil", "org-durand", "org-durand"),
        ("bun-inventaire", "org-durand", "org-durand"),
        ("bun-officine", "org-centre", "org-centre"),
    ]
    # Le projet devient obligatoire, et ne se supprime pas tant qu'il a des bundles.
    structure = forme(moteur, "deployment_bundles")
    assert ("projet_id", "VARCHAR(32)", False) in structure["colonnes"]
    assert (("projet_id",), "projets_robotiques", ("id",), "RESTRICT") in structure["cles_etrangeres"]


def test_la_montee_ne_touche_ni_aux_versions_ni_aux_deploiements(base):
    """Les versions publiées, les déploiements et les présets restent tels
    quels, octet pour octet : un robot qui lit une ancienne version la lit
    toujours (R1.3)."""
    url, moteur = base
    monter_jusqu_a_0014(url, moteur)
    remplir_comme_aujourd_hui(moteur)
    avant = instantane(moteur, TABLES_D_AVANT)

    alembic(url, "upgrade", "head")

    apres = instantane(moteur, TABLES_D_AVANT)
    for nom in TABLES_D_AVANT:
        if nom == "deployment_bundles":
            # Seule la colonne nouvelle s'ajoute ; le reste ne bouge pas.
            assert [{k: v for k, v in ligne.items() if k != "projet_id"} for ligne in apres[nom]] == avant[nom]
        else:
            assert apres[nom] == avant[nom], nom


def test_la_descente_rend_la_base_d_avant_et_la_remontee_refait_la_meme(base):
    url, moteur = base
    monter_jusqu_a_0014(url, moteur)
    remplir_comme_aujourd_hui(moteur)
    avant = instantane(moteur, TABLES_D_AVANT)
    forme_avant = forme(moteur, "deployment_bundles")
    formes_intouchables = {nom: forme(moteur, nom) for nom in TABLES_INTOUCHABLES}
    tables_avant = set(sa.inspect(moteur).get_table_names())

    alembic(url, "upgrade", "head")
    forme_montee = forme(moteur, "deployment_bundles")
    projets_montee = projets_par_organisation(moteur)
    assert {nom: forme(moteur, nom) for nom in TABLES_INTOUCHABLES} == formes_intouchables

    # --- Descente : retour exact ----------------------------------------- #
    alembic(url, "downgrade", "0014")
    assert instantane(moteur, TABLES_D_AVANT) == avant
    assert forme(moteur, "deployment_bundles") == forme_avant
    assert {nom: forme(moteur, nom) for nom in TABLES_INTOUCHABLES} == formes_intouchables
    assert set(sa.inspect(moteur).get_table_names()) == tables_avant

    # --- Remontée : le même résultat que la première fois ---------------- #
    alembic(url, "upgrade", "head")
    assert forme(moteur, "deployment_bundles") == forme_montee
    assert projets_par_organisation(moteur) == projets_montee
    sans_projet = lire(moteur, "SELECT count(*) FROM deployment_bundles WHERE projet_id IS NULL")
    assert sans_projet[0][0] == 0


def test_une_organisation_et_ses_bundles_se_suppriment_toujours(base):
    """Supprimer une organisation emporte son projet et ses bundles, comme
    avant L1 emportait ses bundles : le projet ne doit pas l'empêcher."""
    url, moteur = base
    monter_jusqu_a_0014(url, moteur)
    remplir_comme_aujourd_hui(moteur)
    alembic(url, "upgrade", "head")

    with moteur.connect() as connexion:
        if moteur.dialect.name == "sqlite":
            # SQLite n'applique les clés étrangères que si on le lui demande,
            # connexion par connexion, comme le fait l'application.
            connexion.exec_driver_sql("PRAGMA foreign_keys=ON")
        connexion.execute(sa.text("DELETE FROM organisations WHERE id = 'org-centre'"))
        connexion.commit()

    assert set(projets_par_organisation(moteur)) == {"org-durand"}
    restants = lire(moteur, "SELECT id FROM deployment_bundles ORDER BY id")
    assert [ligne[0] for ligne in restants] == ["bun-accueil", "bun-inventaire"]
    assert [ligne[0] for ligne in lire(moteur, "SELECT id FROM bundle_versions ORDER BY id")] == [
        "ver-accueil-1", "ver-accueil-2"]
