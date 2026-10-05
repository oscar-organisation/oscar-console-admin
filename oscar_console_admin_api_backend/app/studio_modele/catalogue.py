"""Le catalogue des types du Studio : des fichiers versionnés, recopiés en base.

Chaque type vit dans un fichier JSON de app/seed_data/catalogue_studio/, nommé
<code>-<version>.json. Les familles de la palette, dans leur ordre, sont dans
familles.json, à côté. Au démarrage, synchroniser_catalogue recopie en base
chaque {code, version} qui n'y est pas encore (même mécanique que les droits,
recopiés par sync_features).

Une version publiée ne change plus : un brouillon cite un type par son code et
sa version, et doit retrouver demain exactement ce qu'il citait hier. Si un
fichier change le contenu d'un {code, version} déjà en base, le démarrage
s'arrête et dit quel fichier remettre comme il était. Pour corriger un type, on
écrit sa version suivante dans un nouveau fichier.

Ce catalogue fait partie de la console, comme le catalogue des droits : il est
lu dans le dossier de l'application, pas dans les données de démonstration.
"""

import hashlib
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import TypeCatalogue
from .sortes import BUNDLE_DEPLOIEMENT, SORTES

DOSSIER_DU_CATALOGUE = Path(__file__).resolve().parent.parent / "seed_data" / "catalogue_studio"
FICHIER_DES_FAMILLES = "familles.json"

# Un code : des mots en majuscules (lettres et chiffres) séparés par « _ ».
FORME_D_UN_CODE = r"^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$"
# Une version : trois nombres, comme 1.0.0.
FORME_D_UNE_VERSION = r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$"


class CatalogueInvalide(RuntimeError):
    """Le catalogue ne peut pas être chargé : le message dit quel fichier
    corriger, et comment."""


class Famille(BaseModel):
    """Une famille de la palette (Environnements, Temps réel...)."""

    model_config = ConfigDict(extra="forbid")
    code: str = Field(pattern=r"^FAMILLE_PALETTE_[A-Z0-9]+(_[A-Z0-9]+)*$")
    nom: str = Field(min_length=1)
    ordre: int


def _sortes_connues(valeurs: list[str], permises: tuple[str, ...]) -> list[str]:
    inconnues = [valeur for valeur in valeurs if valeur not in permises]
    if inconnues:
        raise ValueError("sorte inconnue : " + ", ".join(inconnues))
    return valeurs


class TypeDuCatalogue(BaseModel):
    """Un type du catalogue, tel que son fichier le décrit."""

    model_config = ConfigDict(extra="forbid")
    code: str = Field(pattern=FORME_D_UN_CODE, max_length=120)
    version: str = Field(pattern=FORME_D_UNE_VERSION, max_length=20)
    # La sorte des éléments qui citent ce type.
    sorte: str
    famille: str
    nom: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1)
    exemple: str = Field(min_length=1)
    # Où un élément de ce type peut se placer ; BUNDLE_DEPLOIEMENT veut dire
    # « directement dans le bundle ».
    parents_autorises: list[str]
    # Les sortes d'éléments qu'il peut contenir.
    recoit: list[str]
    # Ce qui se crée avec lui, en un seul geste.
    contenu_cree: list[str]
    # Son rang dans sa famille.
    ordre: int
    # Faux pour un type qui existe dans le modèle, mais que la palette ne
    # propose pas encore (la zone Externe, avant ses connexions).
    dans_la_palette: bool

    @field_validator("sorte")
    @classmethod
    def _sorte(cls, valeur: str) -> str:
        return _sortes_connues([valeur], SORTES)[0]

    @field_validator("recoit", "contenu_cree")
    @classmethod
    def _contenu(cls, valeurs: list[str]) -> list[str]:
        return _sortes_connues(valeurs, SORTES)

    @field_validator("parents_autorises")
    @classmethod
    def _parents(cls, valeurs: list[str]) -> list[str]:
        return _sortes_connues(valeurs, SORTES + (BUNDLE_DEPLOIEMENT,))


@dataclass(frozen=True)
class EntreeDuCatalogue:
    """Un fichier du catalogue, lu et vérifié."""

    fichier: Path
    type: TypeDuCatalogue
    # Le fichier entier, tel qu'il est enregistré en base et servi par l'API.
    definition: dict
    # L'empreinte SHA-256 de son contenu : elle dit si le fichier a changé.
    empreinte: str


def _empreinte(definition: dict) -> str:
    # Le contenu, pas sa mise en forme : l'ordre des clés et les espaces d'un
    # fichier réécrit ne comptent pas.
    canonique = json.dumps(definition, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonique.encode("utf-8")).hexdigest()


def _lire_json(fichier: Path):
    try:
        return json.loads(fichier.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, ValueError) as erreur:
        raise CatalogueInvalide(
            f"Le fichier du catalogue {fichier.name} ne se lit pas ({erreur}). Corrigez-le avant de redémarrer."
        ) from erreur


def _resume(erreur: ValidationError) -> str:
    return " ; ".join(
        f"{'.'.join(str(morceau) for morceau in detail['loc']) or 'fichier'} : {detail['msg']}"
        for detail in erreur.errors()
    )


def charger_familles(dossier: Path = DOSSIER_DU_CATALOGUE) -> list[Famille]:
    fichier = dossier / FICHIER_DES_FAMILLES
    contenu = _lire_json(fichier)
    if not isinstance(contenu, list):
        raise CatalogueInvalide(f"Le fichier du catalogue {fichier.name} doit être une liste de familles.")
    try:
        lues = [Famille.model_validate(famille) for famille in contenu]
    except ValidationError as erreur:
        raise CatalogueInvalide(
            f"Le fichier du catalogue {fichier.name} est mal formé : {_resume(erreur)}."
        ) from erreur
    codes = [famille.code for famille in lues]
    if len(set(codes)) != len(codes):
        raise CatalogueInvalide(f"Le fichier du catalogue {fichier.name} nomme deux fois la même famille.")
    return sorted(lues, key=lambda famille: famille.ordre)


@lru_cache(maxsize=1)
def _familles_de_la_console() -> tuple[dict, ...]:
    return tuple(famille.model_dump() for famille in charger_familles(DOSSIER_DU_CATALOGUE))


def familles() -> list[dict]:
    """Les familles de la palette, dans leur ordre."""
    return [dict(famille) for famille in _familles_de_la_console()]


def charger_catalogue(dossier: Path = DOSSIER_DU_CATALOGUE) -> list[EntreeDuCatalogue]:
    """Lit et vérifie chaque fichier de type du dossier.

    Un fichier illisible, mal formé, mal nommé, ou qui cite une famille absente
    de familles.json arrête tout, avec un message qui le nomme.
    """
    codes_des_familles = {famille.code for famille in charger_familles(dossier)}
    entrees = []
    for fichier in sorted(dossier.glob("*.json")):
        if fichier.name == FICHIER_DES_FAMILLES:
            continue
        definition = _lire_json(fichier)
        try:
            lu = TypeDuCatalogue.model_validate(definition)
        except ValidationError as erreur:
            raise CatalogueInvalide(
                f"Le fichier du catalogue {fichier.name} est mal formé : {_resume(erreur)}. "
                "Corrigez-le avant de redémarrer."
            ) from erreur
        attendu = f"{lu.code}-{lu.version}.json"
        if fichier.name != attendu:
            raise CatalogueInvalide(
                f"Le fichier du catalogue {fichier.name} décrit {lu.code} en version {lu.version} : "
                f"il doit s'appeler {attendu}."
            )
        if lu.famille not in codes_des_familles:
            raise CatalogueInvalide(
                f"Le fichier du catalogue {fichier.name} cite la famille {lu.famille}, "
                f"absente de {FICHIER_DES_FAMILLES}."
            )
        entrees.append(EntreeDuCatalogue(fichier=fichier, type=lu, definition=definition,
                                         empreinte=_empreinte(definition)))
    return entrees


def synchroniser_catalogue(db: Session, dossier: Path = DOSSIER_DU_CATALOGUE) -> None:
    """Recopie en base chaque {code, version} du dossier qui n'y est pas encore.

    Appelée au démarrage (run_seed). Un type déjà en base et inchangé est
    laissé tel quel ; un type déjà en base dont le fichier a changé arrête le
    démarrage. Un type en base dont le fichier a disparu reste en base : des
    brouillons peuvent encore le citer.
    """
    entrees = charger_catalogue(dossier)
    en_base = {(t.code, t.version): t for t in db.execute(select(TypeCatalogue)).scalars()}
    for entree in entrees:
        lu = entree.type
        existant = en_base.get((lu.code, lu.version))
        if existant is None:
            db.add(TypeCatalogue(
                code=lu.code, version=lu.version, sorte=lu.sorte, famille=lu.famille, nom=lu.nom,
                description=lu.description, definition=entree.definition, empreinte=entree.empreinte,
                statut="publie",
            ))
        elif existant.empreinte != entree.empreinte:
            raise CatalogueInvalide(
                f"Le fichier du catalogue {entree.fichier.name} change le type {lu.code} en version "
                f"{lu.version}, déjà publié : une version publiée ne change plus. Remettez ce fichier "
                f"comme il était, et écrivez la correction dans une nouvelle version "
                f"({lu.code}-<version suivante>.json)."
            )
    db.commit()
