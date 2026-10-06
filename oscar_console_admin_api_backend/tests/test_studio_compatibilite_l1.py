"""L'interface d'avant marche toujours (décision 125), pendant que L1 s'ajoute.

L'API et l'interface se mettent en ligne en même temps, sans ordre entre
elles : l'API ajoute avant de retirer. L'interface encore en ligne crée,
enregistre, publie et déploie des bundles à l'ancien format comme avant. Elle
ne peut seulement plus écraser un bundle passé au nouvel éditeur, ni en publier
un ancien brouillon devenu périmé. Et un robot qui a reçu une ancienne version
publiée la lit toujours.
"""

import uuid

import pytest

from test_studio_bundles import CLE_DE_FLOTTE, spec

CHAMPS_D_AVANT = {
    "id", "org_id", "nom", "slug", "description", "target", "statut", "created_at", "updated_at",
    "draft_version", "published_version", "version_count", "robot_count", "component_count", "unit_count",
    "agent_count",
}


def uniq(prefixe: str) -> str:
    return f"{prefixe}-{uuid.uuid4().hex[:8]}"


@pytest.fixture()
def contexte(client, admin_headers):
    org = client.post("/api/organisations", headers=admin_headers,
                      json={"nom": uniq("Magasins Durand"), "slug": uniq("magasins-durand")}).json()
    entetes = {**admin_headers, "X-Organization-ID": org["id"]}
    robot = client.post("/api/robots", headers=entetes, json={"nom": uniq("OSCAR"), "org_id": org["id"]}).json()
    return {"entetes": entetes, "robot": robot}


def bundle_ancien(client, entetes) -> dict:
    """Ce que fait l'interface d'avant : POST /bundles sans point de départ."""
    r = client.post("/api/studio/bundles", headers=entetes, json={"nom": uniq("Accueil en magasin")})
    assert r.status_code == 201, r.text
    return r.json()


def test_l_ancienne_interface_cree_et_publie_toujours_un_bundle_ancien(client, contexte):
    entetes = contexte["entetes"]
    bundle = bundle_ancien(client, entetes)
    assert bundle["format_brouillon"] is None
    r = client.put(f"/api/studio/bundles/{bundle['id']}/draft", headers=entetes, json={"spec": spec()})
    assert r.status_code == 200, r.text
    assert client.get(f"/api/studio/bundles/{bundle['id']}", headers=entetes).json()["format_brouillon"] == "ancien"
    publiee = client.post(f"/api/studio/bundles/{bundle['id']}/publish", headers=entetes, json={"notes": "v1"})
    assert publiee.status_code == 200, publiee.text
    deploiement = client.post("/api/studio/deployments", headers=entetes,
                              json={"version_id": publiee.json()["id"], "robot_ids": [contexte["robot"]["id"]]})
    assert deploiement.status_code == 201, deploiement.text


def test_l_ancien_enregistrement_refuse_un_bundle_passe_au_nouvel_editeur(client, contexte):
    entetes = contexte["entetes"]
    nouveau = client.post("/api/studio/bundles", headers=entetes,
                          json={"nom": uniq("Téléopération"), "depart": {"sorte": "VIDE"}}).json()
    refus = {"detail": "Ce bundle s'édite désormais dans le nouveau Studio. Rechargez la page.",
             "code": "BUNDLE_PASSE_AU_NOUVEL_EDITEUR"}

    r = client.put(f"/api/studio/bundles/{nouveau['id']}/draft", headers=entetes, json={"spec": spec()})
    assert (r.status_code, r.json()) == (409, refus)
    r = client.post(f"/api/studio/bundles/{nouveau['id']}/publish", headers=entetes, json={})
    assert (r.status_code, r.json()) == (409, refus)
    # Rien n'a été créé à l'ancien format.
    assert client.get(f"/api/studio/bundles/{nouveau['id']}/versions", headers=entetes).json() == []


def test_la_liste_garde_ses_anciens_champs(client, contexte):
    entetes = contexte["entetes"]
    ancien = bundle_ancien(client, entetes)
    nouveau = client.post("/api/studio/bundles", headers=entetes,
                          json={"nom": uniq("Téléopération"), "depart": {"sorte": "VIDE"}}).json()
    liste = {bundle["id"]: bundle for bundle in client.get("/api/studio/bundles", headers=entetes).json()}
    for bundle in liste.values():
        assert CHAMPS_D_AVANT <= set(bundle)
        assert set(bundle) - CHAMPS_D_AVANT == {"projet_id", "format_brouillon"}
        assert bundle["agent_count"] == bundle["unit_count"]
    assert liste[ancien["id"]]["format_brouillon"] is None
    assert liste[nouveau["id"]]["format_brouillon"] == "oscar.bundle/1"


def test_le_robot_lit_toujours_une_ancienne_version_publiee(client, contexte):
    """Même après que son bundle est passé au nouvel éditeur."""
    entetes, robot = contexte["entetes"], contexte["robot"]
    bundle = bundle_ancien(client, entetes)
    client.put(f"/api/studio/bundles/{bundle['id']}/draft", headers=entetes, json={"spec": spec()})
    publiee = client.post(f"/api/studio/bundles/{bundle['id']}/publish", headers=entetes, json={}).json()
    client.post("/api/studio/deployments", headers=entetes,
                json={"version_id": publiee["id"], "robot_ids": [robot["id"]]})

    # Le bundle passe au nouvel éditeur : un brouillon au nouveau format est enregistré.
    lu = client.get(f"/api/studio/bundles/{bundle['id']}/brouillon", headers=entetes).json()
    r = client.put(f"/api/studio/bundles/{bundle['id']}/brouillon", headers=entetes,
                   json={"modele": lu["modele"], "mise_en_page": lu["mise_en_page"], "revision_attendue": 0})
    assert r.status_code == 200, r.text
    assert client.get(f"/api/studio/bundles/{bundle['id']}", headers=entetes).json()["format_brouillon"] == \
        "oscar.bundle/1"

    releve = client.get(f"/api/studio/runtime/robots/{robot['slug']}/bundle", headers=CLE_DE_FLOTTE)
    assert releve.status_code == 200, releve.text
    corps = releve.json()
    assert corps["deployment"]["version"] == publiee["numero"]
    assert corps["deployment"]["checksum"] == publiee["checksum"]
    compte_rendu = client.post(f"/api/studio/runtime/robots/{robot['slug']}/bundle/report", headers=CLE_DE_FLOTTE,
                               json={"deployment_id": corps["deployment"]["id"], "statut": "active",
                                     "checksum": corps["deployment"]["checksum"]})
    assert compte_rendu.status_code == 200, compte_rendu.text
