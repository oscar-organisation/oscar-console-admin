"""Le Studio au nouveau format (lot L1) : le catalogue des types.

Ces routes s'ajoutent à celles de app/routers/studio.py, qui restent pour
l'interface d'avant : l'API ajoute avant de retirer (décision 125).
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require
from ..models import TypeCatalogue
from ..schemas import CatalogueOut
from ..studio_modele.catalogue import familles

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
