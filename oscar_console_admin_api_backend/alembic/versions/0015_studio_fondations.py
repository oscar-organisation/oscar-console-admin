"""Les fondations du Studio de L1 : le projet robotique créé d'office.

Ce que fait la montée :

1. Elle crée la table `projets_robotiques` : le projet robotique, qui range les
   bundles d'une organisation.
2. Elle crée, pour chaque organisation qui existe déjà, son projet d'office,
   de code PROJET_ROBOTIQUE_PRINCIPAL. Les organisations créées ensuite le
   reçoivent de l'application (app/studio_modele/projets.py).
3. Elle ajoute à `deployment_bundles` la colonne `projet_id`, la remplit avec
   le projet d'office de l'organisation du bundle, puis la rend obligatoire.

Ce qui ne bouge pas : aucune composition n'est réécrite. `bundle_versions`,
`bundle_deployments` et `composition_presets` restent tels quels, au caractère
près : un robot qui lit une ancienne version la lit toujours. Aucune table de
sauvegarde n'est donc nécessaire.

La descente retire la colonne puis la table, et rend la base d'avant.

Sur SQLite (tests et poste), changer une colonne demande de reconstruire la
table : c'est ce que fait le mode « batch » d'Alembic. PostgreSQL fait les
mêmes changements directement.

Revision ID: 0015
Revises: 0014
"""

import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Recopiés ici et non importés de l'application : une migration décrit la base
# à sa date, et doit rendre le même résultat quand l'application aura changé.
CODE_PROJET_D_OFFICE = "PROJET_ROBOTIQUE_PRINCIPAL"
NOM_PROJET_D_OFFICE = "Projet robotique principal"
DESCRIPTION_PROJET_D_OFFICE = (
    "Créé avec l'organisation : il range ses bundles tant qu'elle n'a pas d'autre projet."
)

CLE_DU_PROJET = "fk_deployment_bundles_projet_id"
INDEX_DU_PROJET = "ix_deployment_bundles_projet_id"


def upgrade() -> None:
    op.create_table(
        "projets_robotiques",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("org_id", sa.String(32), sa.ForeignKey("organisations.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("code", sa.String(80), nullable=False),
        sa.Column("nom", sa.String(160), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("statut", sa.String(20), nullable=False),
        sa.Column("cree_d_office", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("org_id", "code", name="uq_projet_robotique_org_code"),
    )

    # Le projet d'office de chaque organisation déjà là.
    connexion = op.get_bind()
    projets = sa.table(
        "projets_robotiques",
        sa.column("id", sa.String), sa.column("org_id", sa.String), sa.column("code", sa.String),
        sa.column("nom", sa.String), sa.column("description", sa.Text), sa.column("statut", sa.String),
        sa.column("cree_d_office", sa.Boolean),
    )
    organisations = connexion.execute(sa.text("SELECT id FROM organisations ORDER BY id")).scalars().all()
    if organisations:
        connexion.execute(sa.insert(projets), [
            dict(id=uuid.uuid4().hex, org_id=org_id, code=CODE_PROJET_D_OFFICE, nom=NOM_PROJET_D_OFFICE,
                 description=DESCRIPTION_PROJET_D_OFFICE, statut="active", cree_d_office=True)
            for org_id in organisations
        ])

    # La colonne naît vide, se remplit, puis devient obligatoire : chaque
    # bundle rejoint le projet d'office de son organisation.
    with op.batch_alter_table("deployment_bundles") as bundles:
        bundles.add_column(sa.Column("projet_id", sa.String(32), nullable=True))
    connexion.execute(
        sa.text(
            "UPDATE deployment_bundles SET projet_id = ("
            " SELECT p.id FROM projets_robotiques p"
            " WHERE p.org_id = deployment_bundles.org_id AND p.code = :code)"
        ),
        {"code": CODE_PROJET_D_OFFICE},
    )
    with op.batch_alter_table("deployment_bundles") as bundles:
        bundles.alter_column("projet_id", existing_type=sa.String(32), nullable=False)
        bundles.create_index(INDEX_DU_PROJET, ["projet_id"])
        bundles.create_foreign_key(CLE_DU_PROJET, "projets_robotiques", ["projet_id"], ["id"],
                                   ondelete="RESTRICT")


def downgrade() -> None:
    with op.batch_alter_table("deployment_bundles") as bundles:
        bundles.drop_constraint(CLE_DU_PROJET, type_="foreignkey")
        bundles.drop_index(INDEX_DU_PROJET)
        bundles.drop_column("projet_id")
    op.drop_table("projets_robotiques")
