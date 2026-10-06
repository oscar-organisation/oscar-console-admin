"""Les gestes des cas partagés, appliqués à un document, pour les tests du serveur.

Le fichier des cas des règles du modèle (copie des formats OSCAR) donne, pour
certains cas, un document et un geste : le verdict attendu porte alors sur le
document que le geste produirait. Dans la console, les gestes s'appliquent dans
le navigateur (bibliothèque des opérations) ; le serveur, lui, ne fait que
vérifier des documents entiers. Ce module sert seulement aux tests : il produit
le document d'après le geste, tel que le décrit le fichier des cas (« gestes »),
pour que le serveur rende son verdict sur ce document.

Les identifiants créés sont « nouv-1 », « nouv-2 »... : toujours les mêmes pour
le même geste.
"""

import copy

ZONE, SALLE = "ZONE_ENVIRONNEMENT_EXECUTION", "COMPOSANT_SALLE_TEMPS_REEL"
SERVICE, APPLICATION, UNITE = ("INSTANCE_SERVICE_CONFIGUREE", "INSTANCE_APPLICATION_CONFIGUREE",
                               "INSTANCE_UNITE_CONFIGUREE")


class _Fabrique:
    def __init__(self):
        self.compteur = 0

    def identifiant(self) -> str:
        self.compteur += 1
        return f"nouv-{self.compteur}"


def _structure_d_une_unite(fabrique: _Fabrique, unite_id: str) -> list[dict]:
    """Ce qui naît avec une unité : son traitement, son interface, une bande et ses deux bus."""
    traitement, interface, bande = fabrique.identifiant(), fabrique.identifiant(), fabrique.identifiant()
    return [
        {"id": traitement, "sorte": "TRAITEMENT_METIER_UNITE", "parent": unite_id,
         "code": "TRAITEMENT_METIER_UNITE_PRINCIPAL"},
        {"id": interface, "sorte": "INTERFACE_COMMUNICATION_UNITE", "parent": unite_id,
         "code": "INTERFACE_COMMUNICATION_UNITE_PRINCIPALE"},
        {"id": bande, "sorte": "BANDE_DONNEES", "parent": interface, "code": "BANDE_DONNEES_PRINCIPALE",
         "nom": "Bande principale"},
        {"id": fabrique.identifiant(), "sorte": "BUS_RECEPTION", "parent": bande,
         "code": "BUS_RECEPTION_PRINCIPAL", "nom": "Réception"},
        {"id": fabrique.identifiant(), "sorte": "BUS_EMISSION", "parent": bande,
         "code": "BUS_EMISSION_PRINCIPAL", "nom": "Émission"},
    ]


def _ajouter(document: dict, geste: dict, fabrique: _Fabrique) -> None:
    element = {"id": fabrique.identifiant(), "sorte": geste["sorte"], "parent": geste["parent"],
               **copy.deepcopy(geste["valeurs"]), "type": geste["type"]}
    elements = document["elements"]
    nouveaux = [element]
    if geste["sorte"] == ZONE and not any(e["sorte"] == SALLE for e in elements):
        # La première zone pose la salle.
        nouveaux.append({"id": fabrique.identifiant(), "sorte": SALLE, "parent": None,
                         "code": "COMPOSANT_SALLE_TEMPS_REEL", "nom": "Salle temps réel",
                         "type": {"code": "COMPOSANT_SALLE_TEMPS_REEL", "version": "1.0.0"}})
    if geste["sorte"] in (SERVICE, APPLICATION):
        # Un service ou une application arrive avec sa première unité.
        suffixe = element["code"].split("_CONFIGUREE_", 1)[-1]
        unite = {"id": fabrique.identifiant(), "sorte": UNITE, "parent": element["id"],
                 "code": f"INSTANCE_UNITE_CONFIGUREE_{suffixe}", "nom": element.get("nom", suffixe),
                 "type": {"code": "TYPE_UNITE_STANDARD", "version": "1.0.0"}}
        nouveaux += [unite, *_structure_d_une_unite(fabrique, unite["id"])]
    if geste["sorte"] == UNITE:
        nouveaux += _structure_d_une_unite(fabrique, element["id"])
    elements.extend(nouveaux)


def _supprimer(document: dict, element_id: str) -> None:
    """Retire l'élément, ses descendants et leurs liaisons ; la dernière zone emporte la salle."""
    retires = {element_id}
    while True:
        enfants = {e["id"] for e in document["elements"] if e["parent"] in retires} - retires
        if not enfants:
            break
        retires |= enfants
    document["elements"] = [e for e in document["elements"] if e["id"] not in retires]
    if not any(e["sorte"] == ZONE for e in document["elements"]):
        document["elements"] = [e for e in document["elements"] if e["sorte"] != SALLE]
    restants = {e["id"] for e in document["elements"]}
    document["liaisons"] = [lien for lien in document["liaisons"]
                            if lien["source"] in restants and lien["destination"] in restants]


def appliquer(document: dict, geste: dict) -> dict:
    """Le document que produirait le geste ; le document de départ ne change pas."""
    resultat = copy.deepcopy(document)
    fabrique = _Fabrique()
    operation = geste["operation"]
    par_id = {e["id"]: e for e in resultat["elements"]}
    if operation == "ajouter":
        _ajouter(resultat, geste, fabrique)
    elif operation == "regler":
        par_id[geste["id"]].update(copy.deepcopy(geste["champs"]))
    elif operation == "emboiter":
        par_id[geste["id"]]["parent"] = geste["parent"]
    elif operation == "supprimer":
        _supprimer(resultat, geste["id"])
    elif operation == "relier":
        resultat["liaisons"].append({"id": fabrique.identifiant(), "source": geste["source"],
                                     "destination": geste["destination"]})
    elif operation == "delier":
        resultat["liaisons"] = [lien for lien in resultat["liaisons"] if lien["id"] != geste["liaison"]]
    else:
        raise ValueError(f"geste inconnu : {operation}")
    return resultat
