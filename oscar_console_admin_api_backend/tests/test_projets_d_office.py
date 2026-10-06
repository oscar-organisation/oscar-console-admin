"""Le projet robotique créé d'office (lot L1, élément L1-10).

Chaque organisation reçoit, dès sa création, un projet robotique de code
PROJET_ROBOTIQUE_PRINCIPAL, et chaque bundle y est rangé. Aucun écran ne le
montre encore (il viendra avec la gestion des projets) : ces tests le lisent
donc dans la base.
"""

import uuid

from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import DeploymentBundle, ProjetRobotique, Site
from app.studio_modele import projets
from app.studio_modele.projets import CODE_PROJET_D_OFFICE, projet_d_office


def uniq(prefixe: str) -> str:
    return f"{prefixe}-{uuid.uuid4().hex[:8]}"


def projets_de(org_id: str) -> list[ProjetRobotique]:
    with SessionLocal() as db:
        return db.execute(select(ProjetRobotique).where(ProjetRobotique.org_id == org_id)).scalars().all()


def nouvelle_organisation(client, admin_headers) -> str:
    r = client.post("/api/organisations", headers=admin_headers,
                    json={"nom": uniq("Magasins Durand"), "slug": uniq("magasins-durand")})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_chaque_organisation_creee_a_son_projet_d_office(client, admin_headers):
    creee = nouvelle_organisation(client, admin_headers)
    accueil = client.post("/api/organisations/onboard", headers=admin_headers, json={
        "organisation": {"nom": uniq("Pharmacie du Centre"), "slug": uniq("pharmacie-du-centre")},
        "site": {"nom": "Officine de Lyon", "code": uniq("FR-LYO")},
        "administrator": {"nom": "Claire Martin", "email": f"claire.martin.{uuid.uuid4().hex[:6]}@pharmacie-centre.fr",
                          "password": "Une-phrase-de-passe-solide"},
    })
    assert accueil.status_code == 201, accueil.text

    for org_id in (creee, accueil.json()["organisation_id"]):
        trouves = projets_de(org_id)
        assert [(p.code, p.statut, p.cree_d_office) for p in trouves] == [
            (CODE_PROJET_D_OFFICE, "active", True)]
        assert trouves[0].nom


def test_un_bundle_cree_rejoint_le_projet_de_son_organisation(client, admin_headers):
    org_id = nouvelle_organisation(client, admin_headers)
    entetes = {**admin_headers, "X-Organization-ID": org_id}
    r = client.post("/api/studio/bundles", headers=entetes, json={"nom": uniq("Accueil en magasin")})
    assert r.status_code == 201, r.text
    bundle = r.json()

    (projet,) = projets_de(org_id)
    assert bundle["projet_id"] == projet.id
    assert [b["projet_id"] for b in client.get("/api/studio/bundles", headers=entetes).json()] == [projet.id]
    assert client.get(f"/api/studio/bundles/{bundle['id']}", headers=entetes).json()["projet_id"] == projet.id
    with SessionLocal() as db:
        assert db.get(DeploymentBundle, bundle["id"]).projet_id == projet.id


def test_le_projet_d_office_n_est_cree_qu_une_fois(client, admin_headers):
    org_id = nouvelle_organisation(client, admin_headers)
    entetes = {**admin_headers, "X-Organization-ID": org_id}
    for nom in ("Accueil en magasin", "Inventaire de nuit"):
        assert client.post("/api/studio/bundles", headers=entetes, json={"nom": uniq(nom)}).status_code == 201

    with SessionLocal() as db:
        premier = projet_d_office(db, org_id)
        second = projet_d_office(db, org_id)
        db.commit()
        assert premier.id == second.id
        nombre = db.execute(select(func.count()).select_from(ProjetRobotique)
                            .where(ProjetRobotique.org_id == org_id)).scalar_one()
        assert nombre == 1
        rattaches = db.execute(select(DeploymentBundle.projet_id)
                               .where(DeploymentBundle.org_id == org_id)).scalars().all()
        assert rattaches == [premier.id, premier.id]


def test_une_creation_simultanee_est_rattrapee_sans_perdre_la_transaction(client, admin_headers, monkeypatch):
    """Deux requêtes peuvent chercher le projet au même instant, ne pas le
    trouver, et le créer toutes les deux. La base n'en garde qu'un (contrainte
    d'unicité) ; la seconde requête doit alors reprendre celui qui existe, sans
    erreur et sans perdre ce qu'elle avait déjà fait dans sa transaction."""
    org_id = nouvelle_organisation(client, admin_headers)
    (existant,) = projets_de(org_id)

    lecture = projets._lire_projet_d_office
    appels = []

    def lecture_d_une_requete_en_retard(db, identifiant):
        appels.append(identifiant)
        # La première lecture ne voit pas encore le projet que l'autre requête crée.
        return None if len(appels) == 1 else lecture(db, identifiant)

    monkeypatch.setattr(projets, "_lire_projet_d_office", lecture_d_une_requete_en_retard)
    with SessionLocal() as db:
        site = Site(org_id=org_id, nom="Entrepôt de Vénissieux", code=uniq("FR-VEN"))
        db.add(site)
        db.flush()
        repris = projet_d_office(db, org_id)
        db.commit()
        assert repris.id == existant.id
        assert db.get(Site, site.id) is not None
    assert len(appels) == 2
    assert len(projets_de(org_id)) == 1


def test_une_organisation_qui_a_des_bundles_se_supprime_comme_avant(client, admin_headers):
    """Le projet est rangé sous l'organisation, et ses bundles sous le projet :
    supprimer l'organisation doit toujours tout emporter, comme avant L1."""
    org_id = nouvelle_organisation(client, admin_headers)
    entetes = {**admin_headers, "X-Organization-ID": org_id}
    bundle = client.post("/api/studio/bundles", headers=entetes, json={"nom": uniq("Accueil en magasin")}).json()
    r = client.put(f"/api/studio/bundles/{bundle['id']}/draft", headers=entetes,
                   json={"spec": {"nodes": [], "edges": []}})
    assert r.status_code == 200, r.text

    assert client.delete(f"/api/organisations/{org_id}", headers=admin_headers).status_code == 204
    assert projets_de(org_id) == []
    with SessionLocal() as db:
        assert db.get(DeploymentBundle, bundle["id"]) is None
