"""Le Studio au nouveau format (lot L1) : le catalogue des types, et le brouillon.

Ces routes s'ajoutent à celles de app/routers/studio.py, qui restent pour
l'interface d'avant : l'API ajoute avant de retirer (décision 125).

Le brouillon s'enregistre par révision entière (conception du lot L1, partie 5) :
chaque enregistrement envoie les deux documents (le modèle et sa mise en page)
et la révision dont il part. Le serveur revérifie tout le modèle, quoi que le
navigateur ait déjà vérifié : c'est lui qui fait foi. Un refus ne change rien.
"""

from fastapi import APIRouter, Depends, Request
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import request_organisation_id, require
from ..models import BrouillonBundle, BundleVersion, DeploymentBundle, TypeCatalogue
from ..schemas import BrouillonEnregistreOut, BrouillonIn, BrouillonOut, CatalogueOut, VerificationOut
from ..studio_modele.ancien_format import brouillon_depuis_ancien_format
from ..studio_modele.brouillons import ETAT_EN_EDITION, codes_publies, empreinte_du_modele, modele_vide
from ..studio_modele.catalogue import catalogue_enregistre, familles
from ..studio_modele.formats import (
    FORMAT_DE_LA_MISE_EN_PAGE, FORMAT_DU_BUNDLE, MiseEnPage, ModeleBundle, mise_en_page_vide,
)
from ..studio_modele.refus import RefusDuStudio
from ..studio_modele.regles import verifier_modele
from ..studio_modele.verification import AVERTISSEMENT, ERREUR, verifier_brouillon
from .studio import _bundle_du_perimetre

router = APIRouter(prefix="/studio", tags=["studio"])


def _version_en_nombres(version: str) -> tuple[int, ...]:
    # « 1.10.0 » vient après « 1.9.0 », ce que l'ordre du texte ne dit pas.
    return tuple(int(nombre) for nombre in version.split("."))


@router.get("/catalogue", response_model=CatalogueOut)
def lire_catalogue(db: Session = Depends(get_db), _=Depends(require("api:bundle.read"))):
    """Les familles de la palette, dans leur ordre, et les types publiés,
    rangés par famille puis dans l'ordre de chaque famille."""
    rangs = {famille["code"]: famille["ordre"] for famille in familles()}
    # Un type enregistré avant qu'on retire sa famille du fichier passe en dernier.
    apres_les_autres = max(rangs.values(), default=0) + 1
    publies = db.execute(select(TypeCatalogue).where(TypeCatalogue.statut == "publie")).scalars().all()
    types = sorted(
        (type_.definition for type_ in publies),
        key=lambda d: (rangs.get(d["famille"], apres_les_autres), d["ordre"], d["code"],
                       _version_en_nombres(d["version"])),
    )
    return {"familles": familles(), "types": types}


# --------------------------------------------------------------------------- #
#  Le brouillon
# --------------------------------------------------------------------------- #
def _composition_a_reprendre(bundle: DeploymentBundle) -> BundleVersion | None:
    """La composition de l'ancien format à reprendre : le brouillon ancien s'il
    existe, sinon la dernière version publiée, sinon la plus récente."""
    versions = sorted(bundle.versions, key=lambda v: v.numero)
    for statut in ("draft", "published"):
        trouvees = [v for v in versions if v.statut == statut]
        if trouvees:
            return trouvees[-1]
    return versions[-1] if versions else None


def _brouillon_servi(bundle: DeploymentBundle, catalogue: dict) -> dict:
    """Le brouillon tel que le Studio l'ouvre.

    Un bundle qui n'a pas encore de brouillon au nouveau format s'ouvre à la
    révision 0, que rien n'enregistre tant que le Studio ne l'envoie pas : un
    bundle de l'ancienne console, par la reprise de l'adaptateur (avec son
    rapport) ; un bundle qui n'a rien, sur un modèle vide.
    """
    brouillon = bundle.brouillon
    if brouillon is not None:
        return {
            "bundle_id": bundle.id, "format": brouillon.format, "modele": brouillon.modele,
            "mise_en_page": brouillon.mise_en_page, "revision": brouillon.revision, "etat": brouillon.etat,
            "origine": brouillon.origine, "reprise": brouillon.reprise, "modifie_le": brouillon.updated_at,
            "modifie_par": brouillon.modifie_par,
        }
    ancienne = _composition_a_reprendre(bundle)
    if ancienne is not None:
        reprise = brouillon_depuis_ancien_format(ancienne.spec, codes_publies(bundle.versions), catalogue)
        return {
            "bundle_id": bundle.id, "format": FORMAT_DU_BUNDLE, "modele": reprise.modele,
            "mise_en_page": reprise.mise_en_page, "revision": 0, "etat": ETAT_EN_EDITION,
            "origine": {"sorte": "ANCIEN_FORMAT", "version_id": ancienne.id, "numero": ancienne.numero},
            "reprise": reprise.rapport, "modifie_le": None, "modifie_par": None,
        }
    return {
        "bundle_id": bundle.id, "format": FORMAT_DU_BUNDLE, "modele": modele_vide(bundle.nom, bundle.description),
        "mise_en_page": mise_en_page_vide(), "revision": 0, "etat": ETAT_EN_EDITION,
        "origine": {"sorte": "VIDE"}, "reprise": None, "modifie_le": None, "modifie_par": None,
    }


def _lieu(prefixe: str, erreur: ValidationError) -> str:
    """L'endroit de la première erreur : modele/elements/6/id."""
    premiere = erreur.errors()[0]
    return "/".join([prefixe, *(str(morceau) for morceau in premiere["loc"])])


def _lire_les_documents(corps: BrouillonIn) -> tuple[ModeleBundle, MiseEnPage]:
    """Les deux documents reçus, au bon format et bien formés ; sinon un refus 422."""
    for document, attendu in ((corps.modele, FORMAT_DU_BUNDLE), (corps.mise_en_page, FORMAT_DE_LA_MISE_EN_PAGE)):
        recu = document.get("format")
        if recu != attendu:
            raise RefusDuStudio(422, "FORMAT_INCONNU",
                                f"Ce serveur lit le format {attendu}, pas « {recu} ». Rechargez le Studio.")
    try:
        modele = ModeleBundle.model_validate(corps.modele)
    except ValidationError as erreur:
        raise RefusDuStudio(422, "STRUCTURE_INVALIDE", f"La composition est mal formée ({_lieu('modele', erreur)}). "
                            "Rechargez le Studio ; si cela se reproduit, signalez-le.") from erreur
    try:
        mise_en_page = MiseEnPage.model_validate(corps.mise_en_page)
    except ValidationError as erreur:
        raise RefusDuStudio(422, "STRUCTURE_INVALIDE",
                            f"La composition est mal formée ({_lieu('mise_en_page', erreur)}). "
                            "Rechargez le Studio ; si cela se reproduit, signalez-le.") from erreur
    return modele, mise_en_page


@router.get("/bundles/{bundle_id}/brouillon", response_model=BrouillonOut)
def lire_brouillon(request: Request, bundle_id: str, db: Session = Depends(get_db),
                   _=Depends(require("api:bundle.read"))):
    bundle = _bundle_du_perimetre(db, bundle_id, request_organisation_id(request), verrouiller=False)
    return _brouillon_servi(bundle, catalogue_enregistre(db))


@router.put("/bundles/{bundle_id}/brouillon", response_model=BrouillonEnregistreOut)
def enregistrer_brouillon(request: Request, bundle_id: str, corps: BrouillonIn, db: Session = Depends(get_db),
                          user=Depends(require("api:bundle.write", "update"))):
    """Enregistre le brouillon entier, s'il part de la révision du serveur.

    Rien n'est écrit si la révision est dépassée (409), si un document n'est
    pas au bon format ou mal formé, ou si le modèle enfreint une règle (422).
    La révision ne monte que si le modèle ou la mise en page a changé.
    Enregistrer ne crée ni version ni déploiement.
    """
    # La ligne du bundle est verrouillée : deux enregistrements simultanés
    # passent l'un après l'autre, et le second voit la révision du premier.
    bundle = _bundle_du_perimetre(db, bundle_id, request_organisation_id(request))
    catalogue = catalogue_enregistre(db)
    # Ce que le Studio a ouvert : le brouillon enregistré, ou la reprise d'un
    # bundle ancien. Ses codes figés ne doivent pas changer.
    servi = _brouillon_servi(bundle, catalogue)
    if corps.revision_attendue != servi["revision"]:
        raise RefusDuStudio(409, "BROUILLON_MODIFIE_AILLEURS",
                            f"Ce brouillon a été modifié depuis un autre poste (révision {servi['revision']}). "
                            "Rechargez-le pour voir ces changements ; vos modifications restent proposées à côté.",
                            revision_serveur=servi["revision"])
    modele, mise_en_page = _lire_les_documents(corps)
    refus = verifier_modele(modele, catalogue, avant=ModeleBundle.model_validate(servi["modele"]),
                            publications=codes_publies(bundle.versions))
    if refus:
        premier = refus[0]
        raise RefusDuStudio(422, premier.code, premier.message, element=premier.element,
                            parents_compatibles=list(premier.parents_compatibles))

    nouveau_modele, nouvelle_mise_en_page = modele.en_json(), mise_en_page.en_json()
    brouillon = bundle.brouillon
    if brouillon is None:
        brouillon = BrouillonBundle(bundle_id=bundle.id, format=FORMAT_DU_BUNDLE, revision=0,
                                    etat=ETAT_EN_EDITION, origine=servi["origine"], reprise=servi["reprise"])
        bundle.brouillon = brouillon
    if brouillon.revision == 0 or (nouveau_modele, nouvelle_mise_en_page) != (brouillon.modele, brouillon.mise_en_page):
        brouillon.modele = nouveau_modele
        brouillon.mise_en_page = nouvelle_mise_en_page
        brouillon.empreinte_modele = empreinte_du_modele(nouveau_modele)
        brouillon.revision += 1
        brouillon.modifie_par = user.id
        db.commit()
        db.refresh(brouillon)
    return {"revision": brouillon.revision, "etat": brouillon.etat, "empreinte_modele": brouillon.empreinte_modele,
            "modifie_le": brouillon.updated_at}


@router.post("/bundles/{bundle_id}/brouillon/verification", response_model=VerificationOut)
def verifier_le_brouillon(request: Request, bundle_id: str, db: Session = Depends(get_db),
                          _=Depends(require("api:bundle.read"))):
    """Les problèmes du brouillon enregistré. N'écrit rien."""
    bundle = _bundle_du_perimetre(db, bundle_id, request_organisation_id(request), verrouiller=False)
    if bundle.brouillon is None:
        raise RefusDuStudio(409, "BROUILLON_ABSENT", "Ce bundle n'a pas encore de brouillon au nouveau format : "
                                                     "ouvrez-le dans le Studio.")
    problemes = verifier_brouillon(ModeleBundle.model_validate(bundle.brouillon.modele), catalogue_enregistre(db))
    return {
        "revision": bundle.brouillon.revision,
        "problemes": problemes,
        "erreurs": sum(1 for p in problemes if p["niveau"] == ERREUR),
        "avertissements": sum(1 for p in problemes if p["niveau"] == AVERTISSEMENT),
    }
