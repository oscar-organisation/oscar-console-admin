"""Le rôle « agent » est devenu « unité » : ce qui change, et ce qui reste lu.

Décision du 05/10/2026 : le mot « agent » est réservé à l'intelligence
artificielle. Le serveur n'écrit plus que le format « unité », mais il lit
encore l'ancien, pour ne casser ni un brouillon gardé dans un navigateur, ni
un robot déjà installé, ni une console dont les réglages portent l'ancien nom.
"""

import copy

import pytest

from app.bundle_spec import RUNTIME_FORMAT, convertir_composition, manifeste_runtime
from app.config import Settings
from app.database import SessionLocal
from app.models import BundleVersion
from test_studio_bundles import contexte, uniq  # noqa: F401


def _canal(identifiant, nom, code, direction, type_canal, format_donnees):
    return {"id": identifiant, "name": nom, "technicalCode": code, "direction": direction,
            "channelType": type_canal, "dataFormat": format_donnees, "description": ""}


def _unite_ancienne(identifiant, nom, code, type_unite, entrees=(), sorties=(), video=False):
    return {
        "id": identifiant, "name": nom, "technicalCode": code, "agentType": type_unite,
        "processingName": "TRAITEMENT_METIER_AGENT_PRINCIPAL",
        "interfaceName": "INTERFACE_COMMUNICATION_AGENT_PRINCIPALE",
        "dataBandName": "BANDE_DONNEES_PRINCIPALE",
        "receiveBusName": "BUS_RECEPTION_PRINCIPAL",
        "sendBusName": "BUS_EMISSION_PRINCIPAL",
        "inputs": list(entrees), "outputs": list(sorties),
        "canPublishAudio": False, "canPublishVideo": video, "expanded": True,
    }


def _bloc(identifiant, x, y, donnees):
    return {"id": identifiant, "type": "architecture", "position": {"x": x, "y": y}, "data": donnees}


def _structure(source, cible):
    return {"id": f"structure-{source}-{cible}", "source": source, "target": cible,
            "type": "smoothstep", "selectable": False,
            "style": {"stroke": "#a8b3c7", "strokeDasharray": "5 6", "strokeWidth": 1.5},
            "data": {"edgeKind": "STRUCTURE"},
            "sourceHandle": "bundle-output", "targetHandle": "component-input"}


def _liaison(identifiant, source, poignee_source, cible, poignee_cible):
    return {"id": identifiant, "source": source, "sourceHandle": poignee_source,
            "target": cible, "targetHandle": poignee_cible, "type": "smoothstep",
            "animated": True, "style": {"stroke": "#3766f5", "strokeWidth": 2.5},
            "data": {"edgeKind": "DONNEES"}}


SORTIE_TEMPS_REEL = "TYPE_SORTIE_PUBLICATION_TEMPS_REEL_CANAL_AGENT"


def composition_ancienne() -> dict:
    """Une composition telle que le Studio l'enregistrait avant le renommage.

    Reprise du projet de démonstration du Studio : un bundle, deux services et
    une application web, quatre unités (dont une « Module 1 », le nom donné par
    défaut à l'époque), des canaux, deux liaisons de données, une Box IA et
    une mise en route de châssis.
    """
    bundle, media, actions, web = (
        "bundle_deploiement-1a2b3c4d", "instance_service-5e6f7a8b",
        "instance_service-9c0d1e2f", "instance_application-3a4b5c6d",
    )
    camera = _unite_ancienne(
        "agent-c1a2b3d4", "Caméra avant", "INSTANCE_AGENT_CAMERA_AVANT", "TYPE_AGENT_MEDIA_ROBOT",
        entrees=[_canal("rx-11aa22bb", "Image caméra brute", "CANAL_RECEPTION_IMAGE_CAMERA_BRUTE",
                        "RECEPTION", "TYPE_ENTREE_ABONNEMENT_ROS_2", "IMAGE")],
        sorties=[_canal("tx-33cc44dd", "État du flux vidéo", "CANAL_EMISSION_ETAT_FLUX_VIDEO",
                        "EMISSION", SORTIE_TEMPS_REEL, "OBJET_JSON")],
        video=True,
    )
    pilotage = _unite_ancienne(
        "agent-e5f6a7b8", "Pilotage du déplacement", "INSTANCE_AGENT_PILOTAGE_DEPLACEMENT",
        "TYPE_AGENT_CONTROLE_ACTION_ROBOT",
        entrees=[_canal("rx-55ee66ff", "Commande de déplacement", "CANAL_RECEPTION_COMMANDE_DEPLACEMENT",
                        "RECEPTION", "TYPE_ENTREE_ABONNEMENT_TEMPS_REEL", "BINAIRE_COMPACT")],
        sorties=[_canal("tx-77aa88bb", "État du déplacement", "CANAL_EMISSION_ETAT_DEPLACEMENT",
                        "EMISSION", SORTIE_TEMPS_REEL, "OBJET_JSON")],
    )
    module = _unite_ancienne("agent-0a1b2c3d", "Module 1", "INSTANCE_AGENT_MODULE_1", "TYPE_AGENT_STANDARD")
    operateur = _unite_ancienne(
        "agent-99887766", "Commandes opérateur", "INSTANCE_AGENT_COMMANDES_OPERATEUR",
        "TYPE_AGENT_CONTROLEUR_DISTANT_WEB",
        entrees=[_canal("rx-1b2c3d4e", "État du robot", "CANAL_RECEPTION_ETAT_ROBOT",
                        "RECEPTION", "TYPE_ENTREE_ABONNEMENT_TEMPS_REEL", "OBJET_JSON")],
        sorties=[_canal("tx-5f6a7b8c", "Commande de déplacement", "CANAL_EMISSION_COMMANDE_DEPLACEMENT",
                        "EMISSION", SORTIE_TEMPS_REEL, "BINAIRE_COMPACT")],
    )
    return {
        "nodes": [
            _bloc(bundle, 40, 245, {
                "kind": "BUNDLE_DEPLOIEMENT", "name": "Robot magasin, version initiale",
                "technicalCode": "BUNDLE_DEPLOIEMENT_ROBOT_MAGASIN",
                "description": "Déploiement coordonné des fonctions de pilotage et de perception.",
                "target": "ENVIRONNEMENT_EXECUTION_ROBOT", "status": "BROUILLON", "agents": [],
            }),
            _bloc(media, 420, 40, {
                "kind": "INSTANCE_SERVICE", "name": "Service média du robot",
                "technicalCode": "INSTANCE_SERVICE_MEDIA_ROBOT", "description": "",
                "target": "ENVIRONNEMENT_EXECUTION_ROBOT", "status": "BROUILLON",
                "aiBoxId": "0f1e2d3c4b5a69788796a5b4c3d2e1f0",
                "bringupKey": "camera", "bringupOrder": 20,
                "agents": [camera],
            }),
            _bloc(actions, 420, 470, {
                "kind": "INSTANCE_SERVICE", "name": "Service actions du robot",
                "technicalCode": "INSTANCE_SERVICE_ACTIONS_ROBOT", "description": "",
                "target": "ENVIRONNEMENT_EXECUTION_ROBOT", "status": "BROUILLON",
                "agents": [pilotage, module],
            }),
            _bloc(web, 930, 245, {
                "kind": "INSTANCE_APPLICATION", "name": "Télécommande opérateur web",
                "technicalCode": "INSTANCE_APPLICATION_TELECOMMANDE_WEB", "description": "",
                "target": "ENVIRONNEMENT_EXECUTION_NAVIGATEUR_WEB", "status": "BROUILLON",
                "agents": [operateur],
            }),
        ],
        "edges": [
            _structure(bundle, media), _structure(bundle, actions), _structure(bundle, web),
            _liaison("liaison-aa11bb22", web, "out:agent-99887766:tx-5f6a7b8c",
                     actions, "in:agent-e5f6a7b8:rx-55ee66ff"),
            _liaison("liaison-cc33dd44", actions, "out:agent-e5f6a7b8:tx-77aa88bb",
                     web, "in:agent-99887766:rx-1b2c3d4e"),
        ],
    }


# Les codes de la composition ci-dessus et ce qu'ils deviennent, écrits à la
# main : la conversion se vérifie contre cette table, pas contre elle-même.
CODES_RENOMMES = {
    "INSTANCE_AGENT_CAMERA_AVANT": "INSTANCE_UNITE_CAMERA_AVANT",
    "INSTANCE_AGENT_PILOTAGE_DEPLACEMENT": "INSTANCE_UNITE_PILOTAGE_DEPLACEMENT",
    "INSTANCE_AGENT_MODULE_1": "INSTANCE_UNITE_MODULE_1",
    "INSTANCE_AGENT_COMMANDES_OPERATEUR": "INSTANCE_UNITE_COMMANDES_OPERATEUR",
    "TYPE_AGENT_MEDIA_ROBOT": "TYPE_UNITE_MEDIA_ROBOT",
    "TYPE_AGENT_CONTROLE_ACTION_ROBOT": "TYPE_UNITE_CONTROLE_ACTION_ROBOT",
    "TYPE_AGENT_STANDARD": "TYPE_UNITE_STANDARD",
    "TYPE_AGENT_CONTROLEUR_DISTANT_WEB": "TYPE_UNITE_CONTROLEUR_DISTANT_WEB",
    "TRAITEMENT_METIER_AGENT_PRINCIPAL": "TRAITEMENT_METIER_UNITE_PRINCIPAL",
    "INTERFACE_COMMUNICATION_AGENT_PRINCIPALE": "INTERFACE_COMMUNICATION_UNITE_PRINCIPALE",
    "TYPE_SORTIE_PUBLICATION_TEMPS_REEL_CANAL_AGENT": "TYPE_SORTIE_PUBLICATION_TEMPS_REEL_CANAL_UNITE",
}


def composition_nouvelle() -> dict:
    """La même composition au format « unité » : ce que la conversion doit rendre."""
    resultat = composition_ancienne()
    for noeud in resultat["nodes"]:
        donnees = noeud["data"]
        donnees["units"] = donnees.pop("agents")
        for unite in donnees["units"]:
            unite["unitType"] = unite.pop("agentType")
            for champ in ("technicalCode", "unitType", "processingName", "interfaceName"):
                unite[champ] = CODES_RENOMMES.get(unite[champ], unite[champ])
            for canal in unite["inputs"] + unite["outputs"]:
                canal["channelType"] = CODES_RENOMMES.get(canal["channelType"], canal["channelType"])
    return resultat


# --------------------------------------------------------------------------- #
#  La fonction de conversion
# --------------------------------------------------------------------------- #
class TestConversion:
    def test_une_composition_a_l_ancien_format_passe_au_nouveau(self):
        assert convertir_composition(composition_ancienne()) == composition_nouvelle()

    def test_la_composition_recue_n_est_pas_modifiee(self):
        recue = composition_ancienne()
        intacte = copy.deepcopy(recue)
        convertir_composition(recue)
        assert recue == intacte

    def test_la_liste_garde_sa_place_dans_le_bloc(self):
        """Seul le nom de la clé change, pas l'ordre du document."""
        avant = list(composition_ancienne()["nodes"][1]["data"])
        apres = list(convertir_composition(composition_ancienne())["nodes"][1]["data"])
        assert apres == ["units" if cle == "agents" else cle for cle in avant]

    def test_les_identifiants_et_les_liaisons_ne_bougent_pas(self):
        """Les poignées `in:<unité>:<canal>` désignent des identifiants : y
        toucher détacherait chaque liaison de son canal."""
        apres = convertir_composition(composition_ancienne())
        assert [lien["sourceHandle"] for lien in apres["edges"]] == \
            [lien["sourceHandle"] for lien in composition_ancienne()["edges"]]
        assert apres["nodes"][2]["data"]["units"][0]["id"] == "agent-e5f6a7b8"

    def test_un_texte_saisi_et_un_mot_qui_contient_agent_ne_bougent_pas(self):
        ancienne = composition_ancienne()
        unite = ancienne["nodes"][1]["data"]["agents"][0]
        unite["name"] = "AGENT_CAMERA"
        unite["description"] = "AGENT"
        unite["processingName"] = "TRAITEMENT_AGENTIQUE"
        convertie = convertir_composition(ancienne)["nodes"][1]["data"]["units"][0]
        assert convertie["name"] == "AGENT_CAMERA"
        assert convertie["description"] == "AGENT"
        assert convertie["processingName"] == "TRAITEMENT_AGENTIQUE"

    def test_une_composition_au_nouveau_format_ressort_telle_quelle(self):
        """Le mot AGENT y garde son sens : une unité peut porter un agent d'IA."""
        nouvelle = composition_nouvelle()
        nouvelle["nodes"][1]["data"]["units"][0]["technicalCode"] = "INSTANCE_UNITE_AGENT_IA"
        assert convertir_composition(nouvelle) is nouvelle

    @pytest.mark.parametrize("forme", [
        None, [], "texte", 12, {}, {"nodes": "pas une liste"},
        {"nodes": [1, None, {"data": "pas un objet"}]},
        {"nodes": [{"data": {"kind": "INSTANCE_SERVICE"}}]},
        {"nodes": [{"data": {"agents": [], "units": [{"agentType": "TYPE_AGENT_STANDARD"}]}}]},
    ])
    def test_une_forme_inattendue_reste_telle_quelle(self, forme):
        assert convertir_composition(forme) == forme

    def test_une_liste_d_unites_inattendue_est_gardee(self):
        """La clé est renommée, mais ce qu'elle porte n'est pas réinterprété."""
        ancienne = {"nodes": [{"data": {"agents": "pas une liste"}}, 3]}
        assert convertir_composition(ancienne) == {"nodes": [{"data": {"units": "pas une liste"}}, 3]}

    def test_un_bloc_qui_porte_les_deux_listes_ne_garde_que_la_nouvelle(self):
        """Le serveur n'écrit jamais l'ancien format, même à moitié converti."""
        ancienne = composition_ancienne()
        ancienne["nodes"][3]["data"]["units"] = []
        convertie = convertir_composition(ancienne)["nodes"][3]["data"]
        assert "agents" not in convertie
        assert convertie["units"] == []

    def test_le_manifeste_est_le_meme_pour_les_deux_formats(self):
        """Un brouillon resté à l'ancien format produit ce que le robot attend."""
        manifeste = manifeste_runtime(composition_ancienne())
        assert manifeste == manifeste_runtime(composition_nouvelle())
        assert manifeste["format"] == RUNTIME_FORMAT == "oscar.bundle.runtime.v2"
        actions = next(c for c in manifeste["composants"] if c["code"] == "INSTANCE_SERVICE_ACTIONS_ROBOT")
        assert "agents" not in actions
        assert [u["code"] for u in actions["unites"]] == [
            "INSTANCE_UNITE_MODULE_1", "INSTANCE_UNITE_PILOTAGE_DEPLACEMENT"]
        assert actions["unites"][1]["type"] == "TYPE_UNITE_CONTROLE_ACTION_ROBOT"
        assert len(manifeste["liaisons"]) == 2


# --------------------------------------------------------------------------- #
#  L'API : n'écrit que le nouveau format, lit encore l'ancien
# --------------------------------------------------------------------------- #
def _sans_box_ia(composition: dict) -> dict:
    # Une Box IA doit exister en base pour être publiée ; ces tests n'en ont pas besoin.
    for noeud in composition["nodes"]:
        noeud["data"].pop("aiBoxId", None)
    return composition


def test_un_brouillon_a_l_ancien_format_est_enregistre_au_nouveau(client, contexte):
    url = f"/api/studio/bundles/{contexte['bundle']['id']}"
    r = client.put(url + "/draft", headers=contexte["entetes"],
                   json={"spec": _sans_box_ia(composition_ancienne())})
    assert r.status_code == 200, r.text
    assert r.json()["spec"] == _sans_box_ia(composition_nouvelle())
    # Ce qui est écrit en base, pas seulement ce qui est renvoyé.
    with SessionLocal() as db:
        assert db.get(BundleVersion, r.json()["id"]).spec == _sans_box_ia(composition_nouvelle())
    relu = client.get(f"/api/studio/versions/{r.json()['id']}", headers=contexte["entetes"]).json()
    assert relu["spec"] == _sans_box_ia(composition_nouvelle())

    # Même composition, même empreinte, quel que soit le format reçu.
    nouvelle = client.put(url + "/draft", headers=contexte["entetes"],
                          json={"spec": _sans_box_ia(composition_nouvelle())}).json()
    assert nouvelle["checksum"] == r.json()["checksum"]

    publiee = client.post(url + "/publish", headers=contexte["entetes"], json={})
    assert publiee.status_code == 200, publiee.text
    manifeste = client.get(f"/api/studio/versions/{publiee.json()['id']}/manifest",
                           headers=contexte["entetes"]).json()
    assert manifeste["checksum"] == publiee.json()["checksum"]
    assert manifeste["manifest"]["format"] == "oscar.bundle.runtime.v2"


def test_la_liste_des_bundles_compte_les_unites(client, contexte):
    url = f"/api/studio/bundles/{contexte['bundle']['id']}"
    client.put(url + "/draft", headers=contexte["entetes"],
               json={"spec": _sans_box_ia(composition_ancienne())})
    fiche = client.get(url, headers=contexte["entetes"]).json()
    assert fiche["unit_count"] == 4
    assert "agent_count" not in fiche


def test_un_preset_a_l_ancien_format_est_verse_au_nouveau(client, admin_headers):
    corps = {"slug": uniq("rosmaster-m3pro"), "nom": "ROSMASTER M3 Pro - ancien format",
             "famille": "rosmaster-m3pro", "spec": composition_ancienne()}
    cree = client.post("/api/studio/presets", headers=admin_headers, json=corps)
    assert cree.status_code == 201, cree.text
    assert cree.json()["spec"] == composition_nouvelle()
    corrige = client.patch(f"/api/studio/presets/{cree.json()['id']}", headers=admin_headers,
                           json={"spec": composition_ancienne()})
    assert corrige.json()["spec"] == composition_nouvelle()


def test_l_ancien_en_tete_du_robot_reste_accepte(client, contexte):
    """Un robot déjà installé envoie `x-oscar-agent-key` : il doit pouvoir
    continuer à tirer sa configuration et télécharger sa mise à jour."""
    robot = contexte["robot"]
    url = f"/api/studio/runtime/robots/{robot['slug']}"
    # Clé de flotte, robot sans clé propre.
    assert client.get(url + "/bundle", headers={
        "X-Oscar-Agent-Key": "test-cle-de-flotte-du-runtime"}).status_code == 200
    cle = client.post(f"/api/robots/{robot['id']}/machine-key",
                      headers=contexte["entetes"]).json()["machine_key"]
    assert client.get(url + "/bundle", headers={"X-Oscar-Agent-Key": cle}).status_code == 200
    assert client.get(url + "/release", headers={"X-Oscar-Agent-Key": cle}).status_code == 200
    assert client.get(url + "/bundle", headers={"X-Oscar-Agent-Key": "mauvaise-cle"}).status_code == 401


def test_l_emission_de_la_cle_est_journalisee_sous_son_nouveau_nom(client, contexte, admin_headers):
    robot = contexte["robot"]
    reponse = client.post(f"/api/robots/{robot['id']}/machine-key", headers=contexte["entetes"])
    assert reponse.status_code == 200
    assert set(reponse.json()) == {"robot", "machine_key", "issued_at", "installation"}
    journal = client.get("/api/audit", headers=admin_headers,
                         params={"action": "ROBOT_MACHINE_KEY_ISSUE"})
    assert journal.status_code == 200, journal.text
    assert robot["nom"] in [ligne["resource"] for ligne in journal.json()]


def test_la_permission_de_la_cle_porte_son_nouveau_nom(client, admin_headers):
    codes = {f["code"] for f in client.get("/api/features", headers=admin_headers).json()}
    assert "api:robot.machine_key" in codes
    assert "api:robot.agent_key" not in codes


# --------------------------------------------------------------------------- #
#  Le réglage de la clé de flotte et son ancien nom
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("variables, attendu", [
    ({"EDGE_RUNTIME_API_KEY": "nouvelle"}, "nouvelle"),
    ({"EDGE_AGENT_API_KEY": "ancienne"}, "ancienne"),
    ({"EDGE_RUNTIME_API_KEY": "nouvelle", "EDGE_AGENT_API_KEY": "ancienne"}, "nouvelle"),
    # compose.yaml transmet toujours les deux, vides par défaut : une console
    # dont seul l'ancien nom est réglé doit garder sa clé.
    ({"EDGE_RUNTIME_API_KEY": "", "EDGE_AGENT_API_KEY": "ancienne"}, "ancienne"),
    ({"EDGE_RUNTIME_API_KEY": "", "EDGE_AGENT_API_KEY": ""}, ""),
])
def test_la_cle_de_flotte_se_lit_sous_ses_deux_noms(monkeypatch, variables, attendu):
    monkeypatch.delenv("EDGE_RUNTIME_API_KEY", raising=False)
    monkeypatch.delenv("EDGE_AGENT_API_KEY", raising=False)
    for nom, valeur in variables.items():
        monkeypatch.setenv(nom, valeur)
    assert Settings(_env_file=None).cle_de_flotte_du_runtime == attendu
