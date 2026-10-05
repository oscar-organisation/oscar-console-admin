"""Composition Studio : validation, projection runtime et empreinte.

Le Studio produit un document d'édition (positions des blocs, panneaux
dépliés, sélection en cours). Le robot, lui, n'a que faire d'un plan : il lui
faut la liste des services, de leurs unités et de leurs canaux. Ce module fait
la traduction, et c'est sur cette traduction - pas sur le document - que
l'empreinte est calculée. Déplacer un bloc ne change donc pas la version qui
tourne, alors que renommer un canal, si.

Le format servi au robot est identifié par `RUNTIME_FORMAT` : le runtime
embarqué refuse ce qu'il ne sait pas lire plutôt que de deviner.
"""

import hashlib
import json
import re
from typing import Any

# v2 (05/10/2026) : le rôle hébergé par un service s'appelle « unité » et non
# plus « agent ». Dans le manifeste, la liste d'un composant s'appelle donc
# `unites` (v1 : `agents`), et ses codes disent UNITE là où ils disaient AGENT.
# Un robot qui ne lit que la v1 refuse la v2 au lieu de la mal comprendre.
RUNTIME_FORMAT = "oscar.bundle.runtime.v2"

KIND_BUNDLE = "BUNDLE_DEPLOIEMENT"


# --------------------------------------------------------------------------- #
#  Lecture des compositions écrites avant le renommage « agent » -> « unité »
# --------------------------------------------------------------------------- #
# Depuis le 05/10/2026, « agent » est réservé à l'intelligence artificielle.
# Les compositions enregistrées en base sont réécrites par la migration 0014,
# mais une composition à l'ancien format peut encore arriver : brouillon gardé
# dans un navigateur, script, préset copié d'une ancienne console. On sait donc
# toujours la lire, et on n'écrit que le nouveau format.

# Une suite de mots en majuscules et chiffres séparés par « _ » : la forme de
# tous les codes du Studio (TYPE_UNITE_STANDARD, CANAL_EMISSION_01...).
_FORME_D_UN_CODE = re.compile(r"[A-Z0-9]+(?:_[A-Z0-9]+)*")
_MOTS_DES_CODES = {"AGENT": "UNITE", "AGENTS": "UNITES"}
# Ni les identifiants (les poignées des liaisons s'y réfèrent) ni les textes
# saisis par l'utilisateur ne sont des codes : on n'y touche pas.
_CHAMPS_QUI_NE_SONT_PAS_DES_CODES = frozenset({"id", "name", "description"})


def _renommer_cle(objet: dict, ancienne: str, nouvelle: str) -> dict:
    """Copie de l'objet où `ancienne` s'appelle `nouvelle`, à la même place.

    Si les deux clés sont là, la nouvelle est gardée et l'ancienne retirée :
    le serveur n'écrit jamais l'ancien format (même règle que l'interface).
    """
    if ancienne not in objet:
        return objet
    if nouvelle in objet:
        return {cle: valeur for cle, valeur in objet.items() if cle != ancienne}
    return {(nouvelle if cle == ancienne else cle): valeur for cle, valeur in objet.items()}


def _convertir_codes(valeur: Any) -> Any:
    """Remplace le mot AGENT par UNITE (AGENTS par UNITES) dans chaque code.

    Mot par mot, jamais au milieu d'un mot : TYPE_AGENT_STANDARD devient
    TYPE_UNITE_STANDARD, mais un mot comme AGENTIQUE ne bouge pas.
    """
    if isinstance(valeur, str):
        if not _FORME_D_UN_CODE.fullmatch(valeur):
            return valeur
        return "_".join(_MOTS_DES_CODES.get(mot, mot) for mot in valeur.split("_"))
    if isinstance(valeur, list):
        return [_convertir_codes(element) for element in valeur]
    if isinstance(valeur, dict):
        return {
            cle: element if cle in _CHAMPS_QUI_NE_SONT_PAS_DES_CODES else _convertir_codes(element)
            for cle, element in valeur.items()
        }
    return valeur


def _est_a_l_ancien_format(spec: dict) -> bool:
    """Vrai si un bloc porte encore sa liste sous `agents` (et pas `units`)."""
    for noeud in _noeuds(spec):
        donnees = _donnees(noeud)
        if "agents" in donnees and "units" not in donnees:
            return True
    return False


def _convertir_donnees_du_bloc(donnees: dict) -> dict:
    donnees = _renommer_cle(donnees, "agents", "units")
    unites = donnees.get("units")
    if isinstance(unites, list):
        donnees = {**donnees, "units": [
            _renommer_cle(unite, "agentType", "unitType") if isinstance(unite, dict) else unite
            for unite in unites
        ]}
    return _convertir_codes(donnees)


def _avec_donnees_converties(element: Any, convertir) -> Any:
    """Bloc ou liaison dont seul le contenu (`data`) est converti."""
    if not isinstance(element, dict) or not isinstance(element.get("data"), dict):
        return element
    return {**element, "data": convertir(element["data"])}


def convertir_composition(spec: Any) -> Any:
    """La composition au format « unité », sans modifier celle reçue.

    C'est la seule fonction de conversion du serveur. Une composition est à
    l'ancien format si l'un de ses blocs porte encore la clé `agents` ; elle
    est alors convertie en entier :

    - `data.agents` d'un bloc devient `data.units` (un bloc qui porte les
      deux ne garde que `units`) ;
    - `agentType` d'une unité devient `unitType` (même règle) ;
    - dans le contenu (`data`) des blocs et des liaisons, chaque code perd le
      mot AGENT pour UNITE : INSTANCE_AGENT_CAMERA devient INSTANCE_UNITE_CAMERA,
      TYPE_SORTIE_PUBLICATION_TEMPS_REEL_CANAL_AGENT devient ..._CANAL_UNITE.

    Ne changent jamais : les identifiants (`id`, donc les poignées
    `in:<unité>:<canal>` des liaisons), les noms et descriptions saisis, et ce
    qui n'a pas la forme attendue (pas un objet, liste absente). Une
    composition déjà au nouveau format ressort telle quelle : le mot AGENT y
    garde son sens d'intelligence artificielle.
    """
    if not isinstance(spec, dict) or not _est_a_l_ancien_format(spec):
        return spec
    resultat = dict(spec)
    if isinstance(spec.get("nodes"), list):
        resultat["nodes"] = [_avec_donnees_converties(noeud, _convertir_donnees_du_bloc)
                             for noeud in spec["nodes"]]
    if isinstance(spec.get("edges"), list):
        resultat["edges"] = [_avec_donnees_converties(lien, _convertir_codes)
                             for lien in spec["edges"]]
    return resultat


def _noeuds(spec: dict) -> list[dict]:
    noeuds = spec.get("nodes")
    return [n for n in noeuds if isinstance(n, dict)] if isinstance(noeuds, list) else []


def _liens(spec: dict) -> list[dict]:
    liens = spec.get("edges")
    return [e for e in liens if isinstance(e, dict)] if isinstance(liens, list) else []


def _donnees(noeud: dict) -> dict:
    data = noeud.get("data")
    return data if isinstance(data, dict) else {}


def _unites(noeud: dict) -> list[dict]:
    unites = _donnees(noeud).get("units")
    return [u for u in unites if isinstance(u, dict)] if isinstance(unites, list) else []


def _canaux(unite: dict, champ: str) -> list[dict]:
    canaux = unite.get(champ)
    return [c for c in canaux if isinstance(c, dict)] if isinstance(canaux, list) else []


def _canal_par_poignee(spec: dict, noeud_id: Any, poignee: Any) -> dict | None:
    """Retrouve un canal depuis une poignée `in:<unité>:<canal>` / `out:...`."""
    if not isinstance(poignee, str) or not isinstance(noeud_id, str):
        return None
    morceaux = poignee.split(":")
    if len(morceaux) != 3:
        return None
    _, unite_id, canal_id = morceaux
    for noeud in _noeuds(spec):
        if noeud.get("id") != noeud_id:
            continue
        for unite in _unites(noeud):
            if unite.get("id") != unite_id:
                continue
            for canal in _canaux(unite, "inputs") + _canaux(unite, "outputs"):
                if canal.get("id") == canal_id:
                    return canal
    return None


def valider_specification(spec: dict) -> tuple[list[str], list[str]]:
    """Revalide la composition côté serveur.

    Le navigateur valide déjà pendant la saisie, mais il n'est pas l'autorité :
    une composition peut arriver par l'API sans être jamais passée par le
    Studio. Publier sans revalider reviendrait à faire confiance au client sur
    ce qui finira par s'exécuter sur un robot.
    """
    erreurs: list[str] = []
    avertissements: list[str] = []

    spec = convertir_composition(spec)
    if not isinstance(spec, dict):
        return ["La composition doit être un objet."], []

    noeuds = _noeuds(spec)
    if not noeuds:
        return ["La composition est vide."], []

    bundles = [n for n in noeuds if _donnees(n).get("kind") == KIND_BUNDLE]
    if not bundles:
        erreurs.append("Aucun bundle de déploiement : ajoutez le regroupement qui sera publié.")
    elif len(bundles) > 1:
        erreurs.append("Plusieurs bundles de déploiement : un seul est publié à la fois.")

    codes: dict[str, int] = {}
    for noeud in noeuds:
        donnees = _donnees(noeud)
        code = donnees.get("technicalCode")
        if not code:
            erreurs.append(f"Un bloc « {donnees.get('name') or noeud.get('id')} » n'a pas d'identifiant technique.")
        else:
            codes[code] = codes.get(code, 0) + 1
        unites = _unites(noeud)
        # Un composant qui ne fait que reveiller le chassis n'a pas d'unite, et
        # c'est normal : le signaler en permanence apprendrait a ignorer les
        # avertissements.
        if donnees.get("kind") != KIND_BUNDLE and not unites and not donnees.get("bringupKey"):
            avertissements.append(f"{donnees.get('name') or code} ne contient aucune unité.")
        for unite in unites:
            code_unite = unite.get("technicalCode")
            if not code_unite:
                erreurs.append(f"Une unité de « {donnees.get('name') or code} » n'a pas d'identifiant technique.")
            else:
                codes[code_unite] = codes.get(code_unite, 0) + 1
            for canal in _canaux(unite, "inputs") + _canaux(unite, "outputs"):
                code_canal = canal.get("technicalCode")
                if not code_canal:
                    erreurs.append(f"Un canal de « {unite.get('name') or code_unite} » n'a pas d'identifiant technique.")
                else:
                    codes[code_canal] = codes.get(code_canal, 0) + 1

    for code, occurrences in sorted(codes.items()):
        if occurrences > 1:
            erreurs.append(f"Identifiant technique dupliqué : {code} apparaît {occurrences} fois.")

    for lien in _liens(spec):
        if (lien.get("data") or {}).get("edgeKind") != "DONNEES":
            continue
        source = _canal_par_poignee(spec, lien.get("source"), lien.get("sourceHandle"))
        cible = _canal_par_poignee(spec, lien.get("target"), lien.get("targetHandle"))
        if source is None or cible is None:
            erreurs.append("Liaison incomplète : un canal relié n'existe plus.")
            continue
        if source.get("dataFormat") != cible.get("dataFormat"):
            erreurs.append(
                f"Formats incompatibles : {source.get('name')} émet {source.get('dataFormat')}, "
                f"{cible.get('name')} attend {cible.get('dataFormat')}."
            )

    return erreurs, avertissements


def boites_ia(spec: dict) -> list[str]:
    """Identifiants des Box IA declarees par les composants robot.

    Une composition qui embarque de la perception nomme la Box a appliquer :
    modeles, seuils et cameras voyagent alors avec la version du bundle, au
    lieu d'etre accroches au robot par un geste separe qu'on oublie.
    """
    trouvees = []
    for noeud in _noeuds(spec):
        identifiant = _donnees(noeud).get("aiBoxId")
        if isinstance(identifiant, str) and identifiant and identifiant not in trouvees:
            trouvees.append(identifiant)
    return trouvees


def manifeste_runtime(spec: dict) -> dict:
    """Projette la composition en manifeste exécutable, trié et sans mise en page."""
    spec = convertir_composition(spec)
    noeuds = _noeuds(spec)
    bundle = next((n for n in noeuds if _donnees(n).get("kind") == KIND_BUNDLE), None)
    donnees_bundle = _donnees(bundle) if bundle else {}

    composants = []
    for noeud in noeuds:
        donnees = _donnees(noeud)
        if donnees.get("kind") == KIND_BUNDLE:
            continue
        unites = []
        for unite in _unites(noeud):
            unites.append({
                "code": unite.get("technicalCode"),
                "nom": unite.get("name"),
                "type": unite.get("unitType"),
                "traitement": unite.get("processingName"),
                "interface": unite.get("interfaceName"),
                "bande_donnees": unite.get("dataBandName"),
                "bus_reception": unite.get("receiveBusName"),
                "bus_emission": unite.get("sendBusName"),
                "publie_audio": bool(unite.get("canPublishAudio")),
                "publie_video": bool(unite.get("canPublishVideo")),
                "entrees": sorted(
                    ({
                        "code": canal.get("technicalCode"),
                        "nom": canal.get("name"),
                        "type": canal.get("channelType"),
                        "format": canal.get("dataFormat"),
                    } for canal in _canaux(unite, "inputs")),
                    key=lambda canal: canal["code"] or "",
                ),
                "sorties": sorted(
                    ({
                        "code": canal.get("technicalCode"),
                        "nom": canal.get("name"),
                        "type": canal.get("channelType"),
                        "format": canal.get("dataFormat"),
                    } for canal in _canaux(unite, "outputs")),
                    key=lambda canal: canal["code"] or "",
                ),
            })
        composant = {
            "code": donnees.get("technicalCode"),
            "nom": donnees.get("name"),
            "kind": donnees.get("kind"),
            "cible": donnees.get("target"),
            "unites": sorted(unites, key=lambda unite: unite["code"] or ""),
        }
        if donnees.get("aiBoxId"):
            composant["box_ia"] = donnees["aiBoxId"]
        # Mise en route du chassis : la composition nomme le besoin (« base »,
        # « camera »), le profil du robot fournit la commande. Un plan reste
        # ainsi lisible sur n'importe quel chassis, et un chassis qui ne sait
        # pas satisfaire un besoin le refuse au lieu de l'ignorer.
        if donnees.get("bringupKey"):
            composant["mise_en_route"] = str(donnees["bringupKey"]).strip().lower()
            try:
                composant["ordre"] = int(donnees.get("bringupOrder") or 100)
            except (TypeError, ValueError):
                composant["ordre"] = 100
        composants.append(composant)

    liaisons = []
    for lien in _liens(spec):
        if (lien.get("data") or {}).get("edgeKind") != "DONNEES":
            continue
        source = _canal_par_poignee(spec, lien.get("source"), lien.get("sourceHandle"))
        cible = _canal_par_poignee(spec, lien.get("target"), lien.get("targetHandle"))
        if source is None or cible is None:
            continue
        liaisons.append({
            "de": source.get("technicalCode"),
            "vers": cible.get("technicalCode"),
            "format": source.get("dataFormat"),
        })

    return {
        "format": RUNTIME_FORMAT,
        "bundle": {
            "code": donnees_bundle.get("technicalCode"),
            "nom": donnees_bundle.get("name"),
            "cible": donnees_bundle.get("target"),
        },
        "composants": sorted(composants, key=lambda composant: composant["code"] or ""),
        "liaisons": sorted(liaisons, key=lambda liaison: (liaison["de"] or "", liaison["vers"] or "")),
    }


def empreinte(manifeste: dict) -> str:
    canonique = json.dumps(manifeste, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonique.encode("utf-8")).hexdigest()
