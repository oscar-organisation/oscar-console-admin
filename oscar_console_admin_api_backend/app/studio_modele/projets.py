"""Le projet robotique créé d'office pour chaque organisation.

Une seule fonction, projet_d_office, que l'on appelle partout où il en faut un :
à la création d'une organisation, et à celle d'un bundle (une organisation née
avant cette règle, ou par les données de démonstration, le reçoit ainsi au
premier bundle). La migration 0015 l'a créé pour les organisations qui
existaient déjà.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.orm import Session

from ..models import ProjetRobotique

CODE_PROJET_D_OFFICE = "PROJET_ROBOTIQUE_PRINCIPAL"
NOM_PROJET_D_OFFICE = "Projet robotique principal"
DESCRIPTION_PROJET_D_OFFICE = (
    "Créé avec l'organisation : il range ses bundles tant qu'elle n'a pas d'autre projet."
)

# L'insertion « sans erreur si la ligne existe déjà » s'écrit avec la syntaxe
# propre à chaque base (INSERT ... ON CONFLICT DO NOTHING). PostgreSQL sert en
# production, SQLite aux tests et au poste.
_INSERTIONS = {"postgresql": postgresql.insert, "sqlite": sqlite.insert}


def _lire_projet_d_office(db: Session, org_id: str) -> ProjetRobotique | None:
    return db.execute(
        select(ProjetRobotique).where(
            ProjetRobotique.org_id == org_id, ProjetRobotique.code == CODE_PROJET_D_OFFICE
        )
    ).scalar_one_or_none()


def projet_d_office(db: Session, org_id: str) -> ProjetRobotique:
    """Le projet d'office de l'organisation : lu s'il existe, créé sinon.

    Tout se passe dans la transaction de l'appelant, qui valide (commit) avec
    le reste de son travail. Deux requêtes peuvent ne pas le trouver au même
    instant et le créer ensemble : la contrainte d'unicité (organisation, code)
    n'en garde qu'un, l'insertion de la seconde ne fait rien au lieu d'échouer,
    et la seconde relecture rend celui qui existe. Aucune erreur, et rien de ce
    que l'appelant avait déjà fait n'est perdu.
    """
    projet = _lire_projet_d_office(db, org_id)
    if projet is not None:
        return projet
    # L'organisation peut avoir été ajoutée dans cette même transaction : elle
    # doit être écrite avant son projet, qui la désigne.
    db.flush()
    inserer = _INSERTIONS[db.get_bind().dialect.name]
    db.execute(
        inserer(ProjetRobotique)
        .values(
            id=uuid.uuid4().hex,
            org_id=org_id,
            code=CODE_PROJET_D_OFFICE,
            nom=NOM_PROJET_D_OFFICE,
            description=DESCRIPTION_PROJET_D_OFFICE,
            statut="active",
            cree_d_office=True,
        )
        .on_conflict_do_nothing(index_elements=["org_id", "code"])
    )
    # Écrit ci-dessus, ou par l'autre requête : il existe forcément.
    projet = _lire_projet_d_office(db, org_id)
    if projet is None:
        raise RuntimeError(f"Le projet d'office de l'organisation {org_id} n'a pu être ni lu ni créé.")
    return projet
