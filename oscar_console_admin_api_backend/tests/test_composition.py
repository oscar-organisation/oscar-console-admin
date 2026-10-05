"""Les valeurs par défaut de la composition sont celles du code.

compose.yaml transmet à l'API les réglages que le test et la production posent
(variables de l'application Coolify), chacun avec une valeur par défaut. Une
variable absente doit donner le même comportement sur le serveur que sur le
poste: cette valeur par défaut est donc celle du code (app/config.py). Une
valeur écrite à deux endroits finit fausse à l'un des deux: ce test les compare.

Deux exceptions, voulues: les secrets n'ont jamais de valeur par défaut dans la
composition, et les données de démonstration y sont éteintes.
"""
import pathlib
import re

from app.config import Settings

COMPOSITION = pathlib.Path(__file__).resolve().parents[1] / "compose.yaml"

# Les secrets: vides dans la composition, posés par l'assistant de déploiement.
SECRETS = {
    "SECRET_KEY",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "ADMIN_PASSWORD",
    "SMTP_PASSWORD",
    "PERCEPTION_WORKER_API_KEY",
    "EDGE_RUNTIME_API_KEY",
    # L'ancien nom de la clé de flotte du runtime embarqué, encore lu le temps
    # que les déploiements passent au nouveau (voir app/config.py).
    "EDGE_AGENT_API_KEY",
}

# Les choix propres au déploiement, différents du code exprès.
CHOIX_DU_DEPLOIEMENT = {"SEED_DEMO": "false"}

# Une ligne « NOM: "${NOM:-valeur}" » de la composition.
REGLAGE = re.compile(r'^ {6}([A-Z_]+): "\$\{\1:-([^}]*)\}"$', re.MULTILINE)


def _reglages_transmis_a_l_api() -> dict:
    texte = COMPOSITION.read_text(encoding="utf-8")
    # Le service api, de sa ligne jusqu'aux volumes nommés de la fin du fichier.
    debut = texte.index("\n  api:\n")
    fin = texte.index("\nvolumes:\n", debut)
    return dict(REGLAGE.findall(texte[debut:fin]))


def _en_texte(valeur) -> str:
    if isinstance(valeur, bool):
        return "true" if valeur else "false"
    return str(valeur)


def test_la_composition_ne_transmet_que_des_reglages_du_code():
    transmis = _reglages_transmis_a_l_api()
    # Le motif lit bien le fichier: une vingtaine de réglages, pas zéro.
    assert len(transmis) >= 20
    inconnus = sorted(nom for nom in transmis if nom.lower() not in Settings.model_fields)
    assert inconnus == []


def test_les_valeurs_par_defaut_de_la_composition_sont_celles_du_code():
    ecarts = []
    for nom, defaut in sorted(_reglages_transmis_a_l_api().items()):
        if nom in SECRETS:
            # Le nom seulement: une valeur de secret ne s'affiche jamais.
            if defaut != "":
                ecarts.append(f"{nom}: un secret ne doit pas avoir de valeur par défaut")
            continue
        attendu = CHOIX_DU_DEPLOIEMENT.get(nom, _en_texte(Settings.model_fields[nom.lower()].default))
        if defaut != attendu:
            ecarts.append(f"{nom}: composition {defaut!r}, attendu {attendu!r}")
    assert ecarts == []
