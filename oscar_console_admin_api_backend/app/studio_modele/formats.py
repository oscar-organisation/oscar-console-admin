"""Le format du bundle au nouveau Studio (oscar.bundle/1), et sa mise en page.

Deux documents (conception du lot L1, partie 3) :
- le modèle, oscar.bundle/1 : le bundle, ses éléments rangés à plat avec leur
  parent, et ses liaisons. Sa source est le schéma des formats OSCAR
  (oscar-tools, schemas/bundle.schema.json), dont la console garde une copie
  pour ses tests (tests/donnees/formats_oscar_v1/) ; les modèles ci-dessous en
  disent exactement la même chose, et les tests le vérifient sur les exemples
  de la source ;
- la mise en page, oscar.mise-en-page/1 : la position de chaque bloc. Seule la
  console la lit ; déplacer un bloc ne change ni le modèle ni son empreinte.

Ces modèles disent la FORME du document. Les règles de placement (qui contient
quoi, la salle unique...) sont dans regles.py.
"""

from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel, ConfigDict, Field, StrictBool, StrictFloat, StrictInt, StrictStr, ValidationError, model_validator,
)

from .sortes import (
    APPLICATION, BANDE, BUS_EMISSION, BUS_RECEPTION, CANAL_EMISSION, CANAL_RECEPTION, INTERFACE, SALLE,
    SERVICE, SORTES, TRAITEMENT, UNITE, ZONE,
)

FORMAT_DU_BUNDLE = "oscar.bundle/1"
FORMAT_DE_LA_MISE_EN_PAGE = "oscar.mise-en-page/1"

# Les motifs et les longueurs du schéma de la source, recopiés tels quels.
MOTIF_IDENTIFIANT = "^[A-Za-z0-9][A-Za-z0-9._:-]*$"
LONGUEUR_IDENTIFIANT = 128
MOTIF_CODE = "^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$"
LONGUEUR_CODE = 128
MOTIF_VERSION = "^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$"
LONGUEUR_NOM = 120
LONGUEUR_DESCRIPTION = 1000
LONGUEUR_JUSTIFICATION = 500

OBLIGATOIRE = "EXIGENCE_ACTIVATION_ENVIRONNEMENT_OBLIGATOIRE"
FACULTATIVE = "EXIGENCE_ACTIVATION_ENVIRONNEMENT_FACULTATIVE"
EXIGENCES = (OBLIGATOIRE, FACULTATIVE)

# Ce que chaque sorte doit avoir, ou ne doit pas avoir (le « allOf » du schéma).
SORTES_AVEC_NOM = (ZONE, SALLE, SERVICE, APPLICATION, UNITE, CANAL_RECEPTION, CANAL_EMISSION)
SORTES_AVEC_TYPE = (SALLE, SERVICE, APPLICATION, UNITE)
SORTES_SANS_TYPE = (TRAITEMENT, INTERFACE, BANDE, BUS_RECEPTION, BUS_EMISSION, CANAL_RECEPTION, CANAL_EMISSION)
SORTES_AVEC_REGLAGES = (ZONE, CANAL_RECEPTION, CANAL_EMISSION)

Identifiant = Annotated[StrictStr, Field(max_length=LONGUEUR_IDENTIFIANT, pattern=MOTIF_IDENTIFIANT)]
Code = Annotated[StrictStr, Field(max_length=LONGUEUR_CODE, pattern=MOTIF_CODE)]
Version = Annotated[StrictStr, Field(pattern=MOTIF_VERSION)]
Nom = Annotated[StrictStr, Field(min_length=1, max_length=LONGUEUR_NOM)]
Description = Annotated[StrictStr, Field(max_length=LONGUEUR_DESCRIPTION)]

# Un champ facultatif du schéma peut manquer, mais ne vaut jamais null.
_FACULTATIFS_NON_NULS = ("nom", "description", "type", "reglages", "code_fige", "donnees_reprises")


def _refuser_les_nuls(valeurs: Any, champs: tuple[str, ...]) -> Any:
    if isinstance(valeurs, dict):
        for champ in champs:
            if champ in valeurs and valeurs[champ] is None:
                raise ValueError(f"le champ « {champ} » ne peut pas valoir null : le retirer s'il est vide")
    return valeurs


class _Strict(BaseModel):
    # Un champ que le format ne connaît pas est refusé, comme dans le schéma.
    model_config = ConfigDict(extra="forbid")


class TypeCite(_Strict):
    """Un type du catalogue, cité par son code et sa version, sans être recopié."""

    code: Code
    version: Version


class ReglagesDeZone(_Strict):
    exigence: Literal[OBLIGATOIRE, FACULTATIVE]
    justification: Annotated[StrictStr, Field(max_length=LONGUEUR_JUSTIFICATION)] | None = None

    @model_validator(mode="before")
    @classmethod
    def _pas_de_nul(cls, valeurs: Any) -> Any:
        return _refuser_les_nuls(valeurs, ("justification",))


class Element(_Strict):
    id: Identifiant
    sorte: StrictStr
    # Obligatoire, mais null pour un enfant direct du bundle.
    parent: Identifiant | None
    code: Code
    nom: Nom | None = None
    description: Description | None = None
    type: TypeCite | None = None
    reglages: dict | None = None
    code_fige: StrictBool | None = None
    donnees_reprises: dict | None = None

    @model_validator(mode="before")
    @classmethod
    def _pas_de_nul(cls, valeurs: Any) -> Any:
        return _refuser_les_nuls(valeurs, _FACULTATIFS_NON_NULS)

    @model_validator(mode="after")
    def _selon_la_sorte(self) -> "Element":
        if self.sorte not in SORTES:
            raise ValueError("la sorte doit être l'une de celles-ci : " + ", ".join(SORTES))
        if self.sorte in SORTES_AVEC_NOM and self.nom is None:
            raise ValueError("le champ « nom » manque : une zone, la salle, un service, une application, "
                             "une unité et un canal ont un nom affiché")
        if self.sorte in SORTES_AVEC_TYPE and self.type is None:
            raise ValueError("le champ « type » manque : la salle, un service, une application et une unité "
                             "citent leur type du catalogue, par son code et sa version")
        if self.sorte in SORTES_SANS_TYPE and self.type is not None:
            raise ValueError("un traitement, une interface, une bande, un bus ou un canal n'a pas de type "
                             "du catalogue : retirer « type »")
        if self.reglages is not None:
            if self.sorte not in SORTES_AVEC_REGLAGES:
                raise ValueError("seuls une zone et un canal ont des réglages : retirer « reglages »")
            if self.sorte == ZONE:
                try:
                    ReglagesDeZone.model_validate(self.reglages)
                except ValidationError as erreur:
                    detail = " ; ".join(f"{'.'.join(map(str, e['loc'])) or 'reglages'} : {e['msg']}"
                                        for e in erreur.errors())
                    raise ValueError(f"réglages de zone mal formés ({detail})") from None
        return self


class EnTeteDuBundle(_Strict):
    code: Code
    nom: Nom
    description: Description | None = None

    @model_validator(mode="before")
    @classmethod
    def _pas_de_nul(cls, valeurs: Any) -> Any:
        return _refuser_les_nuls(valeurs, ("description",))


class Liaison(_Strict):
    """Une liaison de données, d'un canal d'émission vers un canal de réception."""

    id: Identifiant
    source: Identifiant
    destination: Identifiant


class ModeleBundle(_Strict):
    """Le modèle d'un bundle, format oscar.bundle/1."""

    format: Literal[FORMAT_DU_BUNDLE]
    bundle: EnTeteDuBundle
    elements: list[Element]
    liaisons: list[Liaison]

    def en_json(self) -> dict:
        """Le document tel qu'il s'enregistre : les champs absents restent absents."""
        return self.model_dump(mode="json", exclude_unset=True)


Coordonnee = Annotated[StrictInt | StrictFloat, Field(allow_inf_nan=False)]


class Position(_Strict):
    """La position d'un bloc, relative à son parent (le cadre du bundle, ou sa zone)."""

    x: Coordonnee
    y: Coordonnee


class MiseEnPage(_Strict):
    """La mise en page d'un bundle, format oscar.mise-en-page/1."""

    format: Literal[FORMAT_DE_LA_MISE_EN_PAGE]
    blocs: dict[Identifiant, Position]

    def en_json(self) -> dict:
        return self.model_dump(mode="json", exclude_unset=True)


def mise_en_page_vide() -> dict:
    return {"format": FORMAT_DE_LA_MISE_EN_PAGE, "blocs": {}}
