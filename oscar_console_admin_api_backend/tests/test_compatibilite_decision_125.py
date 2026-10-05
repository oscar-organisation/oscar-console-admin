"""L'API reste compatible avec l'interface d'avant le renommage (décision 125).

L'API et l'interface sont mises en ligne en même temps, sans ordre : pendant
un temps, l'interface encore en ligne est celle d'avant le renommage « agent »
en « unité » (commit 32aa55a). Elle lit `node.data.agents` et `agentType`,
`agent_count`, appelle `POST /robots/{id}/agent-key` et lit `agent_key`. L'API
sert donc les deux noms, et remet ce qui revient au seul nouveau format.

Ces tests, comme ce qu'ils vérifient, sont à retirer par une prochaine
modification de l'API, une fois l'interface passée.
"""

import copy
import re

from app.bundle_spec import composition_servie, convertir_composition
from app.database import SessionLocal
from app.models import BundleVersion, CompositionPreset
from test_studio_bundles import _publier, contexte, uniq  # noqa: F401
from test_unites import composition_ancienne, composition_nouvelle

_CODE = re.compile(r"[A-Z0-9]+(?:_[A-Z0-9]+)*")


def _sans_box_ia(composition: dict) -> dict:
    # Une Box IA doit exister en base pour être publiée ; ces tests n'en ont pas besoin.
    for noeud in composition["nodes"]:
        noeud["data"].pop("aiBoxId", None)
    return composition


def _codes(valeur) -> list[str]:
    if isinstance(valeur, str):
        return [valeur] if _CODE.fullmatch(valeur) else []
    if isinstance(valeur, dict):
        return [c for cle, v in valeur.items() if cle not in ("id", "name", "description") for c in _codes(v)]
    if isinstance(valeur, list):
        return [c for v in valeur for c in _codes(v)]
    return []


def _cles(valeur) -> set[str]:
    if isinstance(valeur, dict):
        return set(valeur).union(*(_cles(v) for v in valeur.values()))
    if isinstance(valeur, list):
        return set().union(*(_cles(v) for v in valeur))
    return set()


def verifier_la_forme_servie(spec: dict) -> None:
    """Ce que l'interface d'avant doit trouver, et rien de l'ancien format en plus."""
    for noeud in spec["nodes"]:
        donnees = noeud["data"]
        assert isinstance(donnees["units"], list)
        assert donnees["agents"] == donnees["units"]
        for unite in donnees["units"]:
            assert unite["agentType"] == unite["unitType"]
    assert not any("AGENT" in code.split("_") for code in _codes(spec)), "les codes restent au nouveau format"


def erreurs_selon_l_interface_d_avant(spec: dict) -> list[str]:
    """La validation de l'interface de 32aa55a (validateProject et findChannel,
    feature-domain/model.ts), recopiée accès pour accès : elle plante (KeyError,
    TypeError) là où l'interface plantait, et rend ses erreurs. L'essai croisé
    du rapport fait tourner le vrai code."""
    noeuds, liens = spec["nodes"], spec["edges"]
    erreurs = []
    if not [n for n in noeuds if n["data"]["kind"] == "BUNDLE_DEPLOIEMENT"]:
        erreurs.append("Aucun bundle de déploiement")
    codes: dict[str, int] = {}
    for noeud in noeuds:
        codes[noeud["data"]["technicalCode"]] = codes.get(noeud["data"]["technicalCode"], 0) + 1
        len(noeud["data"]["agents"])
        for agent in noeud["data"]["agents"]:
            codes[agent["technicalCode"]] = codes.get(agent["technicalCode"], 0) + 1
            for canal in [*agent["inputs"], *agent["outputs"]]:
                codes[canal["technicalCode"]] = codes.get(canal["technicalCode"], 0) + 1
                assert isinstance(canal["channelType"], str) and canal["direction"] in ("RECEPTION", "EMISSION")
    erreurs += [f"Identifiant technique dupliqué : {c}" for c, n in codes.items() if n > 1]

    def canal(noeud_id, poignee):
        _, agent_id, canal_id = poignee.split(":")
        noeud = next(n for n in noeuds if n["id"] == noeud_id)
        agent = next((a for a in noeud["data"]["agents"] if a["id"] == agent_id), None)
        return next((c for c in (agent["inputs"] + agent["outputs"] if agent else []) if c["id"] == canal_id), None)

    for lien in liens:
        if (lien.get("data") or {}).get("edgeKind") != "DONNEES":
            continue
        source, cible = canal(lien["source"], lien["sourceHandle"]), canal(lien["target"], lien["targetHandle"])
        if not source or not cible:
            erreurs.append("Liaison incomplète")
        elif source["dataFormat"] != cible["dataFormat"]:
            erreurs.append("Formats de données incompatibles")
    return erreurs


def _en_base(version_id: str) -> dict:
    with SessionLocal() as db:
        return db.get(BundleVersion, version_id).spec


# --------------------------------------------------------------------------- #
#  1. La liste des bundles sert unit_count et agent_count
# --------------------------------------------------------------------------- #
def test_la_liste_des_bundles_sert_aussi_agent_count(client, contexte):
    url = f"/api/studio/bundles/{contexte['bundle']['id']}"
    client.put(url + "/draft", headers=contexte["entetes"],
               json={"spec": _sans_box_ia(composition_nouvelle())})
    ligne = next(b for b in client.get("/api/studio/bundles", headers=contexte["entetes"]).json()
                 if b["id"] == contexte["bundle"]["id"])
    assert ligne["unit_count"] == ligne["agent_count"] == 4
    fiche = client.get(url, headers=contexte["entetes"]).json()
    assert fiche["unit_count"] == fiche["agent_count"] == 4


# --------------------------------------------------------------------------- #
#  2. /agent-key reste servie, et la réponse porte les deux noms
# --------------------------------------------------------------------------- #
def test_l_ancienne_adresse_de_la_cle_reste_servie(client, contexte, admin_headers):
    robot = contexte["robot"]
    for adresse in ("agent-key", "machine-key"):
        reponse = client.post(f"/api/robots/{robot['id']}/{adresse}", headers=contexte["entetes"])
        assert reponse.status_code == 200, reponse.text
        corps = reponse.json()
        assert corps["machine_key"] == corps["agent_key"]
        # La clé émise par l'une ou l'autre adresse est bien celle du robot.
        assert client.get(f"/api/studio/runtime/robots/{robot['slug']}/bundle",
                          headers={"X-Oscar-Machine-Key": corps["machine_key"]}).status_code == 200
    journal = client.get("/api/audit", headers=admin_headers, params={"action": "ROBOT_MACHINE_KEY_ISSUE"}).json()
    assert [ligne["resource"] for ligne in journal].count(robot["nom"]) >= 2


def test_l_ancienne_adresse_est_la_meme_route(client):
    """Même fonction derrière les deux adresses : même droit
    (api:robot.machine_key), même trace d'audit, même réponse."""
    from app.routers.robots import router

    routes = {route.path: route for route in router.routes}
    ancienne = routes["/robots/{robot_id}/agent-key"]
    nouvelle = routes["/robots/{robot_id}/machine-key"]
    assert ancienne.endpoint is nouvelle.endpoint
    assert ancienne.methods == nouvelle.methods == {"POST"}


# --------------------------------------------------------------------------- #
#  3. Toute composition servie porte aussi `agents` et `agentType`
# --------------------------------------------------------------------------- #
def test_chaque_composition_servie_porte_les_deux_noms(client, contexte, admin_headers):
    url = f"/api/studio/bundles/{contexte['bundle']['id']}"
    brouillon = client.put(url + "/draft", headers=contexte["entetes"],
                           json={"spec": _sans_box_ia(composition_nouvelle())}).json()
    verifier_la_forme_servie(brouillon["spec"])
    verifier_la_forme_servie(client.get(f"/api/studio/versions/{brouillon['id']}",
                                        headers=contexte["entetes"]).json()["spec"])
    # En base, le seul nouveau format.
    assert not {"agents", "agentType"} & _cles(_en_base(brouillon["id"]))

    version = client.post(url + "/publish", headers=contexte["entetes"], json={}).json()
    verifier_la_forme_servie(client.get(f"/api/studio/versions/{version['id']}",
                                        headers=contexte["entetes"]).json()["spec"])

    preset = client.post(f"/api/studio/presets/from-version/{version['id']}", headers=admin_headers,
                         json={"slug": uniq("magasin"), "nom": "Magasin", "famille": "rosmaster-m3pro"})
    assert preset.status_code == 201, preset.text
    verifier_la_forme_servie(preset.json()["spec"])
    for liste in (client.get("/api/studio/presets?tous=true", headers=admin_headers).json(),
                  [client.get(f"/api/studio/presets/{preset.json()['id']}", headers=admin_headers).json()]):
        for item in liste:
            if item["id"] == preset.json()["id"]:
                verifier_la_forme_servie(item["spec"])
    with SessionLocal() as db:
        assert not {"agents", "agentType"} & _cles(db.get(CompositionPreset, preset.json()["id"]).spec)


def test_l_interface_d_avant_relit_une_composition_servie_sans_planter(client, contexte):
    url = f"/api/studio/bundles/{contexte['bundle']['id']}"
    for composition in (composition_nouvelle(), composition_ancienne()):
        servie = client.put(url + "/draft", headers=contexte["entetes"],
                            json={"spec": _sans_box_ia(composition)}).json()["spec"]
        assert erreurs_selon_l_interface_d_avant(servie) == []
        nombre = sum(len(n["data"]["agents"]) for n in servie["nodes"])
        assert nombre == 4


# --------------------------------------------------------------------------- #
#  4. Composition reçue : en base, le seul nouveau format
# --------------------------------------------------------------------------- #
def test_un_aller_retour_de_la_nouvelle_interface_est_stocke_au_seul_nouveau_format(client, contexte):
    """La nouvelle interface renvoie telle quelle la composition servie, avec
    les deux noms : seule `units` est gardée, et rien ne change."""
    url = f"/api/studio/bundles/{contexte['bundle']['id']}"
    premiere = client.put(url + "/draft", headers=contexte["entetes"],
                          json={"spec": _sans_box_ia(composition_nouvelle())}).json()
    servie = client.get(f"/api/studio/versions/{premiere['id']}", headers=contexte["entetes"]).json()["spec"]
    assert "agents" in servie["nodes"][1]["data"]

    renvoyee = client.put(url + "/draft", headers=contexte["entetes"], json={"spec": servie})
    assert renvoyee.status_code == 200, renvoyee.text
    assert _en_base(premiere["id"]) == _sans_box_ia(composition_nouvelle())
    assert renvoyee.json()["checksum"] == premiere["checksum"]

    # La nouvelle interface modifie sa liste, `units` ; `agents` reste la copie reçue.
    modifiee = copy.deepcopy(servie)
    modifiee["nodes"][2]["data"]["units"][0]["name"] = "Pilotage de la base"
    client.put(url + "/draft", headers=contexte["entetes"], json={"spec": modifiee})
    en_base = _en_base(premiere["id"])
    assert en_base["nodes"][2]["data"]["units"][0]["name"] == "Pilotage de la base"
    assert not {"agents", "agentType"} & _cles(en_base)


def test_une_modification_de_l_interface_d_avant_n_est_pas_perdue(client, contexte):
    """L'interface d'avant modifie `agents` et renvoie `units` telle qu'elle
    l'a reçue : c'est sa liste qui fait foi, remise au nouveau format."""
    url = f"/api/studio/bundles/{contexte['bundle']['id']}"
    premiere = client.put(url + "/draft", headers=contexte["entetes"],
                          json={"spec": _sans_box_ia(composition_nouvelle())}).json()
    servie = client.get(f"/api/studio/versions/{premiere['id']}", headers=contexte["entetes"]).json()["spec"]

    # Ce que fait l'interface d'avant : elle copie le bloc, change sa liste
    # `agents` (un nom, un type, un agent ajouté par son createAgent) et garde
    # le reste du bloc tel quel, `units` comprise.
    modifiee = copy.deepcopy(servie)
    donnees = modifiee["nodes"][2]["data"]
    agents = copy.deepcopy(donnees["agents"])
    agents[0]["name"] = "Pilotage renommé par l'ancienne interface"
    agents[1]["agentType"] = "TYPE_AGENT_DETECTION_LOCALE"
    agents.append({
        "id": "agent-5e6f7a8b", "name": "Module 3", "technicalCode": "INSTANCE_AGENT_MODULE_3",
        "agentType": "TYPE_AGENT_STANDARD", "processingName": "TRAITEMENT_METIER_AGENT_PRINCIPAL",
        "interfaceName": "INTERFACE_COMMUNICATION_AGENT_PRINCIPALE", "dataBandName": "BANDE_DONNEES_PRINCIPALE",
        "receiveBusName": "BUS_RECEPTION_PRINCIPAL", "sendBusName": "BUS_EMISSION_PRINCIPAL",
        "inputs": [], "outputs": [], "canPublishAudio": False, "canPublishVideo": False, "expanded": True,
    })
    modifiee["nodes"][2]["data"] = {**donnees, "agents": agents}
    reponse = client.put(url + "/draft", headers=contexte["entetes"], json={"spec": modifiee})
    assert reponse.status_code == 200, reponse.text

    unites = _en_base(premiere["id"])["nodes"][2]["data"]["units"]
    assert [u["name"] for u in unites] == [
        "Pilotage renommé par l'ancienne interface", "Module 1", "Module 3"]
    assert [u["unitType"] for u in unites] == [
        "TYPE_UNITE_CONTROLE_ACTION_ROBOT", "TYPE_UNITE_DETECTION_LOCALE", "TYPE_UNITE_STANDARD"]
    assert unites[2]["technicalCode"] == "INSTANCE_UNITE_MODULE_3"
    assert unites[2]["id"] == "agent-5e6f7a8b"
    assert not {"agents", "agentType"} & _cles(_en_base(premiere["id"]))
    # Et l'interface d'avant relit ce qu'elle vient d'écrire.
    assert sum(len(n["data"]["agents"]) for n in reponse.json()["spec"]["nodes"]) == 5


def test_quand_on_ne_peut_pas_savoir_units_fait_foi():
    """Sans composition de référence, sans ce bloc dans la référence, ou quand
    les deux listes ont changé, on ne peut pas savoir qui a travaillé : `units`
    fait foi, `agents` est retirée."""
    modifiee = composition_servie(composition_nouvelle())
    modifiee["nodes"][2]["data"]["agents"] = []
    sans_ce_bloc = composition_nouvelle()
    del sans_ce_bloc["nodes"][2]
    for reference in (None, sans_ce_bloc):
        assert convertir_composition(modifiee, reference=reference) == composition_nouvelle()
    # Avec la référence, en revanche, c'est l'interface d'avant qui a vidé sa liste.
    assert convertir_composition(modifiee, reference=composition_nouvelle())["nodes"][2]["data"]["units"] == []

    # Les deux listes changées : `units` fait foi.
    modifiee["nodes"][2]["data"]["units"] = modifiee["nodes"][2]["data"]["units"][:1]
    convertie = convertir_composition(modifiee, reference=composition_nouvelle())
    assert [u["name"] for u in convertie["nodes"][2]["data"]["units"]] == ["Pilotage du déplacement"]
    assert "agents" not in convertie["nodes"][2]["data"]
    assert "agentType" not in convertie["nodes"][2]["data"]["units"][0]


def test_une_composition_de_l_interface_d_avant_seule_est_convertie(client, contexte):
    """Une composition neuve de l'interface d'avant n'a que `agents` : la
    conversion du renommage s'applique."""
    url = f"/api/studio/bundles/{contexte['bundle']['id']}"
    reponse = client.put(url + "/draft", headers=contexte["entetes"],
                         json={"spec": _sans_box_ia(composition_ancienne())})
    assert reponse.status_code == 200, reponse.text
    assert _en_base(reponse.json()["id"]) == _sans_box_ia(composition_nouvelle())


def test_une_version_publiee_par_l_interface_d_avant_se_deploie(client, contexte):
    """Publier puis servir le robot : le manifeste ne porte que `unites`."""
    version = _publier(client, contexte, _sans_box_ia(composition_ancienne()))
    manifeste = client.get(f"/api/studio/versions/{version['id']}/manifest",
                           headers=contexte["entetes"]).json()
    assert all("unites" in c and "agents" not in c for c in manifeste["manifest"]["composants"])
    assert manifeste["checksum"] == version["checksum"]
