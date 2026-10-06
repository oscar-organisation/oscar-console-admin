"""Le brouillon au nouveau format : ce qui sert à le créer et à l'enregistrer.

Les routes sont dans app/routers/studio_brouillons.py ; ici, ce qui ne dépend
pas d'une requête : le modèle vide d'un bundle neuf, le code tiré d'un nom,
l'empreinte du modèle, et les codes déjà publiés d'un bundle.
"""

import re
import unicodedata
from collections.abc import Iterable

from ..bundle_spec import empreinte, manifeste_runtime
from ..models import BundleVersion
from .formats import FORMAT_DU_BUNDLE, LONGUEUR_CODE, LONGUEUR_DESCRIPTION, LONGUEUR_NOM

ETAT_EN_EDITION = "ETAT_BROUILLON_BUNDLE_EN_EDITION"
PREFIXE_DU_BUNDLE = "BUNDLE_DEPLOIEMENT"


def code_depuis_nom(prefixe: str, nom: str) -> str:
    """Un code tiré d'un nom : majuscules sans accent, mots séparés par « _ »,
    précédé du préfixe de sa sorte. « Téléopération du M3 » devient
    BUNDLE_DEPLOIEMENT_TELEOPERATION_DU_M3."""
    sans_accents = unicodedata.normalize("NFKD", nom or "").encode("ascii", "ignore").decode("ascii")
    mots = re.sub(r"[^A-Za-z0-9]+", "_", sans_accents).strip("_").upper()
    code = f"{prefixe}_{mots}" if mots else prefixe
    return code[:LONGUEUR_CODE].rstrip("_")


def modele_vide(nom: str, description: str | None) -> dict:
    """Le modèle d'un bundle qui ne contient encore rien."""
    entete = {"code": code_depuis_nom(PREFIXE_DU_BUNDLE, nom), "nom": nom[:LONGUEUR_NOM]}
    if description:
        entete["description"] = description[:LONGUEUR_DESCRIPTION]
    return {"format": FORMAT_DU_BUNDLE, "bundle": entete, "elements": [], "liaisons": []}


def empreinte_du_modele(modele: dict) -> str:
    """L'empreinte du seul modèle (SHA-256 de son JSON aux clés triées).

    La conception demande la fonction canonique des formats OSCAR (RFC 8785) ;
    les formats 1.1.0 n'en publient pas encore pour la console. On prend donc
    celle que la console emploie déjà pour ses manifestes (bundle_spec.empreinte),
    qui trie les clés de la même façon.
    """
    return empreinte(modele)


def codes_publies(versions: Iterable[BundleVersion]) -> dict[str, int]:
    """Chaque code présent dans une version publiée de l'ancien format, avec le
    numéro de la première qui le contient. Un code publié ne change plus
    (spécification 12.6) ; le message du refus cite ce numéro."""
    premieres: dict[str, int] = {}
    for version in sorted((v for v in versions if v.statut == "published"), key=lambda v: v.numero):
        manifeste = manifeste_runtime(version.spec)
        codes = [(manifeste.get("bundle") or {}).get("code")]
        for composant in manifeste.get("composants", []):
            codes.append(composant.get("code"))
            for unite in composant.get("unites", []):
                codes += [unite.get(champ) for champ in
                          ("code", "traitement", "interface", "bande_donnees", "bus_reception", "bus_emission")]
                codes += [canal.get("code") for canal in unite.get("entrees", []) + unite.get("sorties", [])]
        for code in codes:
            if isinstance(code, str) and code:
                premieres.setdefault(code, version.numero)
    return premieres
