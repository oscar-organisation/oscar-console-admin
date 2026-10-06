"""La vérification à la demande d'un brouillon (bouton « Vérifier »).

Elle rend des problèmes rangés comme le veut la spécification (§18.2) :
niveau, code, titre, explication, correction, élément à localiser. On y trouve :
- les règles du modèle (regles.py), au niveau ERREUR : un brouillon enregistré
  les respecte déjà, mais le catalogue peut avoir changé depuis ;
- ce qui ne bloque pas un geste mais doit se voir avant de publier : une zone
  « à préciser » (ERREUR), un service ou une application sans unité, un canal
  temps réel que rien ne relie (AVERTISSEMENT), deux formats différents aux
  deux bouts d'une liaison (ERREUR).
Le moteur de vérification complet viendra plus tard ; il n'aura qu'à ajouter
des règles à cette liste. Vérifier n'écrit rien.
"""

from collections.abc import Mapping

from .formats import Element, ModeleBundle
from .regles import verifier_modele
from .sortes import APPLICATION, CANAL_EMISSION, CANAL_RECEPTION, SERVICE, UNITE, ZONE

ERREUR, AVERTISSEMENT = "ERREUR", "AVERTISSEMENT"

# Les types de canal qui échangent en temps réel, dans la salle (codes stables
# des formats OSCAR : type_entree et type_sortie).
CANAUX_TEMPS_REEL = ("TYPE_ENTREE_ABONNEMENT_TEMPS_REEL", "TYPE_SORTIE_PUBLICATION_TEMPS_REEL_CANAL_UNITE")

# Pour chaque code : un titre court, et ce qu'il faut faire.
TITRES = {
    "SERVICE_HORS_ZONE": ("Composant hors d'une zone", "Déplacez-le dans une zone d'environnement."),
    "ZONE_INCOMPATIBLE": ("Zone qui ne le reçoit pas",
                          "Déplacez-le dans une zone qui reçoit ce genre de composant."),
    "ZONE_DANS_UNE_ZONE": ("Zone dans une zone", "Placez la zone directement dans le bundle."),
    "SALLE_EN_DOUBLE": ("Deuxième salle temps réel", "Retirez la salle en trop."),
    "SALLE_SANS_ZONE": ("Salle et zones en désaccord",
                        "Ajoutez une zone, ou laissez la salle partir avec la dernière."),
    "ZONE_EXTERNE_EN_DOUBLE": ("Deuxième zone Externe",
                               "Regroupez les serveurs externes dans une seule zone Externe."),
    "ZONE_EXTERNE_RESERVEE": ("Composant dans la zone Externe", "Déplacez-le dans une zone de vos machines."),
    "UNITE_HORS_COMPOSANT": ("Unité hors d'un composant", "Déplacez l'unité dans un service ou une application."),
    "STRUCTURE_FIXE": ("Structure d'unité incomplète", "Rechargez le Studio ; si cela se reproduit, signalez-le."),
    "CANAL_MAUVAIS_BUS": ("Canal dans un bus de l'autre sens", "Déplacez le canal dans un bus de son sens."),
    "PARENT_INCOMPATIBLE": ("Élément mal placé", "Déplacez-le vers l'un des parents proposés."),
    "PARENT_ABSENT": ("Parent introuvable", "Rechargez le Studio."),
    "JUSTIFICATION_ABSENTE": ("Justification manquante",
                              "Écrivez pourquoi le bundle fonctionne sans cette zone."),
    "IDENTIFIANT_EN_DOUBLE": ("Identifiant en double", "Rechargez le Studio ; si cela se reproduit, signalez-le."),
    "CODE_EN_DOUBLE": ("Code en double", "Donnez-lui un autre code."),
    "CODE_FIGE": ("Code déjà publié", "Remettez son code d'origine ; changez plutôt son nom affiché."),
    "TYPE_INCONNU_DU_CATALOGUE": ("Type absent du catalogue", "Choisissez un type proposé par la palette."),
    "LIAISON_SENS_INVERSE": ("Liaison à l'envers", "Reliez une sortie à une entrée."),
    "LIAISON_EXTREMITE_ABSENTE": ("Liaison sans extrémité",
                                  "Retirez la liaison, ou recréez le canal qui manque."),
    "ZONE_A_PRECISER": ("Zone à préciser", "Choisissez son type dans l'inspecteur."),
    "COMPOSANT_SANS_UNITE": ("Composant sans unité", "Ajoutez-lui une unité, ou retirez-le."),
    "CANAL_NON_RELIE": ("Canal temps réel non relié", "Reliez-le à un canal d'une autre unité, ou retirez-le."),
    "FORMATS_DIFFERENTS": ("Formats différents aux deux bouts", "Donnez le même format aux deux canaux."),
    # Ce que dit le rapport de la reprise d'un bundle de l'ancien Studio.
    "PLUSIEURS_BUNDLES": ("Plusieurs blocs « bundle »", "Recopiez ce qui vous manque depuis le rapport."),
    "SORTE_INCONNUE": ("Bloc d'une sorte inconnue", "Recréez-le avec la palette si vous en avez besoin."),
    "TYPE_A_CONFIRMER": ("Type d'unité à confirmer", "Choisissez son type dans l'inspecteur."),
    "LIAISON_A_RECONSTRUIRE": ("Liaison à refaire", "Reliez de nouveau la sortie et l'entrée voulues."),
    "COMPOSANT_A_PLACER": ("Composant à placer", "Déplacez-le dans la zone qui lui convient."),
}


def probleme(niveau: str, code: str, explication: str, element: str | None) -> dict:
    titre, correction = TITRES[code]
    return {"niveau": niveau, "code": code, "titre": titre, "explication": explication,
            "correction": correction, "element": element}


def _nom(element: Element) -> str:
    return element.nom or element.code


def verifier_brouillon(modele: ModeleBundle, catalogue: Mapping[tuple[str, str], dict]) -> list[dict]:
    """Les problèmes du brouillon, des erreurs aux avertissements."""
    problemes = [probleme(ERREUR, r.code, r.message, r.element) for r in verifier_modele(modele, catalogue)]
    elements = modele.elements
    par_id = {e.id: e for e in elements}

    for zone in (e for e in elements if e.sorte == ZONE and e.type is None):
        problemes.append(probleme(ERREUR, "ZONE_A_PRECISER",
                                   f"La zone « {_nom(zone)} » n'a pas encore de type : dites si ce qu'elle contient "
                                   "fonctionne dans un navigateur, sur un ordinateur, sur un mobile, sur un robot ou "
                                   "sur un serveur.", zone.id))

    for composant in (e for e in elements if e.sorte in (SERVICE, APPLICATION)):
        a_une_unite = any(e.parent == composant.id and e.sorte == UNITE for e in elements)
        # Un composant qui ne fait que mettre en route le châssis n'a pas
        # d'unité, et c'est normal : le signaler toujours apprendrait à ignorer
        # les avertissements.
        met_en_route = bool((composant.donnees_reprises or {}).get("bringupKey"))
        if not a_une_unite and not met_en_route:
            effet = ("il ne fera rien une fois déployé" if composant.sorte == SERVICE
                     else "elle ne fera rien une fois déployée")
            problemes.append(probleme(AVERTISSEMENT, "COMPOSANT_SANS_UNITE",
                                       f"« {_nom(composant)} » ne contient aucune unité : {effet}.", composant.id))

    relies = {lien.source for lien in modele.liaisons} | {lien.destination for lien in modele.liaisons}
    for canal in (e for e in elements if e.sorte in (CANAL_RECEPTION, CANAL_EMISSION)):
        if (canal.reglages or {}).get("type") in CANAUX_TEMPS_REEL and canal.id not in relies:
            effet = ("rien ne lui arrivera" if canal.sorte == CANAL_RECEPTION
                     else "personne ne recevra ce qu'il émet")
            problemes.append(probleme(AVERTISSEMENT, "CANAL_NON_RELIE",
                                       f"Le canal « {_nom(canal)} » échange en temps réel, mais aucune liaison ne "
                                       f"le relie : {effet}.", canal.id))

    for lien in modele.liaisons:
        source, destination = par_id.get(lien.source), par_id.get(lien.destination)
        if source is None or destination is None:
            continue
        emis, attendu = (source.reglages or {}).get("format"), (destination.reglages or {}).get("format")
        if emis and attendu and emis != attendu:
            problemes.append(probleme(ERREUR, "FORMATS_DIFFERENTS",
                                       f"« {_nom(source)} » émet {emis}, « {_nom(destination)} » attend {attendu}.",
                                       lien.id))
    return problemes
