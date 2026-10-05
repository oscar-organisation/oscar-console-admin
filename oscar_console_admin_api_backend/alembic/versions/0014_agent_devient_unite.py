"""Le rôle « agent » devient « unité », la clé du robot devient celle de la machine.

Décision de Kemkeng Ngouza Kedi Joel, 05/10/2026 : le rôle fonctionnel hébergé
par un service ou une application s'appelle « unité » ; le mot « agent » est
réservé à l'intelligence artificielle. Le programme du robot, appelé jusqu'ici
« agent embarqué », s'appelle « runtime embarqué », et sa clé est la « clé de
la machine ».

Ce que fait la montée :

1. `robots.agent_key_hash` et `robots.agent_key_issued_at` deviennent
   `machine_key_hash` et `machine_key_issued_at`. Les valeurs ne bougent pas :
   chaque robot garde sa clé.
2. Chaque composition enregistrée passe au format « unité » : les versions de
   bundles (brouillons, versions publiées et archivées) et les présets du
   catalogue. `agents` devient `units`, `agentType` devient `unitType`, et
   dans les codes le mot AGENT devient UNITE (TYPE_AGENT_STANDARD devient
   TYPE_UNITE_STANDARD). Les identifiants, donc les liaisons, et les noms
   saisis ne bougent pas.
3. L'empreinte stockée de chaque version est recalculée. Elle porte sur le
   manifeste servi au robot, qui passe au format `oscar.bundle.runtime.v2` :
   sans ce calcul, la console afficherait une empreinte que le serveur ne
   reconnaîtrait plus.
4. La permission `api:robot.agent_key` devient `api:robot.machine_key`. Les
   rôles et les groupes de permissions la désignent par son identifiant, pas
   par son code : ils la gardent sans qu'on les réécrive.

Ce qui ne bouge pas : le journal d'audit, qui garde ses anciennes lignes
(« ROBOT_AGENT_KEY_ISSUE ») parce qu'on ne réécrit pas l'histoire, et les
comptes rendus des robots.

La descente remet l'état d'avant, exactement. Avant de réécrire, la montée
garde chaque composition et chaque empreinte telles qu'elles étaient écrites
dans la table `sauvegarde_avant_0014` ; la descente les remet, puis supprime
la table. Une composition modifiée après la montée n'est pas écrasée par sa
sauvegarde, ce qui perdrait le travail fait entre-temps : elle est reconvertie
à l'ancien format et son empreinte recalculée.

Les fonctions de conversion et de calcul du manifeste sont recopiées ici et
non importées de l'application : une migration décrit la base à sa date, et
doit rendre le même résultat dans un an, quand le code de l'application aura
changé. Le test tests/test_migration_0014.py vérifie qu'elles rendent
aujourd'hui exactement ce que rend l'application.

Revision ID: 0014
Revises: 0013
"""

import hashlib
import json
import re
from typing import Any, Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SAUVEGARDE = "sauvegarde_avant_0014"

# Les deux tables qui portent des compositions. Seules les versions ont une
# empreinte.
TABLES_DE_COMPOSITIONS = (("bundle_versions", True), ("composition_presets", False))

COLONNES_DU_ROBOT = (
    ("agent_key_hash", "machine_key_hash"),
    ("agent_key_issued_at", "machine_key_issued_at"),
)

ANCIENNE_PERMISSION = "api:robot.agent_key"
NOUVELLE_PERMISSION = "api:robot.machine_key"


# --------------------------------------------------------------------------- #
#  Les deux formats d'une composition
# --------------------------------------------------------------------------- #
# Chaque format dit où se trouve la liste des unités d'un bloc, comment
# s'appelle le type d'une unité, sous quel nom la liste passe dans le
# manifeste, et quel mot les codes emploient.
ANCIEN = {"liste": "agents", "type": "agentType", "manifeste": "agents",
          "format": "oscar.bundle.runtime.v1", "mots": {"AGENT": "AGENT", "AGENTS": "AGENTS"}}
NOUVEAU = {"liste": "units", "type": "unitType", "manifeste": "unites",
           "format": "oscar.bundle.runtime.v2", "mots": {"AGENT": "UNITE", "AGENTS": "UNITES"}}

_FORME_D_UN_CODE = re.compile(r"[A-Z0-9]+(?:_[A-Z0-9]+)*")
# Ni les identifiants ni les textes saisis par l'utilisateur ne sont des codes.
_CHAMPS_QUI_NE_SONT_PAS_DES_CODES = frozenset({"id", "name", "description"})


def _noeuds(spec: dict) -> list[dict]:
    noeuds = spec.get("nodes")
    return [n for n in noeuds if isinstance(n, dict)] if isinstance(noeuds, list) else []


def _liens(spec: dict) -> list[dict]:
    liens = spec.get("edges")
    return [e for e in liens if isinstance(e, dict)] if isinstance(liens, list) else []


def _donnees(noeud: Any) -> dict:
    data = noeud.get("data") if isinstance(noeud, dict) else None
    return data if isinstance(data, dict) else {}


def _renommer_cle(objet: dict, ancienne: str, nouvelle: str) -> dict:
    """Copie de l'objet où `ancienne` s'appelle `nouvelle`, à la même place.
    Si les deux clés sont là, la nouvelle est gardée et l'ancienne retirée."""
    if ancienne not in objet:
        return objet
    if nouvelle in objet:
        return {cle: valeur for cle, valeur in objet.items() if cle != ancienne}
    return {(nouvelle if cle == ancienne else cle): valeur for cle, valeur in objet.items()}


def _changer_les_mots(valeur: Any, mots: dict) -> Any:
    """Change un mot entier dans chaque code, jamais au milieu d'un mot."""
    if isinstance(valeur, str):
        if not _FORME_D_UN_CODE.fullmatch(valeur):
            return valeur
        return "_".join(mots.get(mot, mot) for mot in valeur.split("_"))
    if isinstance(valeur, list):
        return [_changer_les_mots(element, mots) for element in valeur]
    if isinstance(valeur, dict):
        return {
            cle: element if cle in _CHAMPS_QUI_NE_SONT_PAS_DES_CODES else _changer_les_mots(element, mots)
            for cle, element in valeur.items()
        }
    return valeur


def _convertir(spec: Any, depart: dict, arrivee: dict) -> Any:
    """La composition passée du format `depart` au format `arrivee`.

    Elle n'est touchée que si l'un de ses blocs porte la liste du format de
    départ sans celle du format d'arrivée. Sinon, et pour tout ce qui n'est
    pas un objet, elle ressort telle quelle.
    """
    if not isinstance(spec, dict):
        return spec
    if not any(depart["liste"] in _donnees(n) and arrivee["liste"] not in _donnees(n)
               for n in _noeuds(spec)):
        return spec
    # Les mots qui changent : AGENT -> UNITE à la montée, UNITE -> AGENT à la descente.
    mots = {depart["mots"][cle]: arrivee["mots"][cle] for cle in depart["mots"]}

    def bloc(donnees: dict) -> dict:
        donnees = _renommer_cle(donnees, depart["liste"], arrivee["liste"])
        unites = donnees.get(arrivee["liste"])
        if isinstance(unites, list):
            donnees = {**donnees, arrivee["liste"]: [
                _renommer_cle(u, depart["type"], arrivee["type"]) if isinstance(u, dict) else u
                for u in unites
            ]}
        return _changer_les_mots(donnees, mots)

    def contenu(element: Any, convertir) -> Any:
        if not isinstance(element, dict) or not isinstance(element.get("data"), dict):
            return element
        return {**element, "data": convertir(element["data"])}

    resultat = dict(spec)
    if isinstance(spec.get("nodes"), list):
        resultat["nodes"] = [contenu(n, bloc) for n in spec["nodes"]]
    if isinstance(spec.get("edges"), list):
        resultat["edges"] = [contenu(e, lambda d: _changer_les_mots(d, mots)) for e in spec["edges"]]
    return resultat


def _manifeste(spec: dict, fmt: dict) -> dict:
    """Le manifeste servi au robot, tel que app/bundle_spec.py le construit à
    cette révision (format v2) et le construisait avant (format v1)."""
    def canaux(unite: dict, champ: str) -> list[dict]:
        liste = unite.get(champ)
        return [c for c in liste if isinstance(c, dict)] if isinstance(liste, list) else []

    def unites_du(noeud: dict) -> list[dict]:
        liste = _donnees(noeud).get(fmt["liste"])
        return [u for u in liste if isinstance(u, dict)] if isinstance(liste, list) else []

    def canal_par_poignee(noeud_id: Any, poignee: Any) -> dict | None:
        if not isinstance(poignee, str) or not isinstance(noeud_id, str):
            return None
        morceaux = poignee.split(":")
        if len(morceaux) != 3:
            return None
        _, unite_id, canal_id = morceaux
        for noeud in _noeuds(spec):
            if noeud.get("id") != noeud_id:
                continue
            for unite in unites_du(noeud):
                if unite.get("id") != unite_id:
                    continue
                for canal in canaux(unite, "inputs") + canaux(unite, "outputs"):
                    if canal.get("id") == canal_id:
                        return canal
        return None

    def canaux_du_manifeste(unite: dict, champ: str) -> list[dict]:
        return sorted(
            ({"code": c.get("technicalCode"), "nom": c.get("name"),
              "type": c.get("channelType"), "format": c.get("dataFormat")}
             for c in canaux(unite, champ)),
            key=lambda canal: canal["code"] or "",
        )

    noeuds = _noeuds(spec)
    bundle = next((n for n in noeuds if _donnees(n).get("kind") == "BUNDLE_DEPLOIEMENT"), None)
    donnees_bundle = _donnees(bundle) if bundle else {}

    composants = []
    for noeud in noeuds:
        donnees = _donnees(noeud)
        if donnees.get("kind") == "BUNDLE_DEPLOIEMENT":
            continue
        unites = [{
            "code": u.get("technicalCode"),
            "nom": u.get("name"),
            "type": u.get(fmt["type"]),
            "traitement": u.get("processingName"),
            "interface": u.get("interfaceName"),
            "bande_donnees": u.get("dataBandName"),
            "bus_reception": u.get("receiveBusName"),
            "bus_emission": u.get("sendBusName"),
            "publie_audio": bool(u.get("canPublishAudio")),
            "publie_video": bool(u.get("canPublishVideo")),
            "entrees": canaux_du_manifeste(u, "inputs"),
            "sorties": canaux_du_manifeste(u, "outputs"),
        } for u in unites_du(noeud)]
        composant = {
            "code": donnees.get("technicalCode"),
            "nom": donnees.get("name"),
            "kind": donnees.get("kind"),
            "cible": donnees.get("target"),
            fmt["manifeste"]: sorted(unites, key=lambda unite: unite["code"] or ""),
        }
        if donnees.get("aiBoxId"):
            composant["box_ia"] = donnees["aiBoxId"]
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
        source = canal_par_poignee(lien.get("source"), lien.get("sourceHandle"))
        cible = canal_par_poignee(lien.get("target"), lien.get("targetHandle"))
        if source is None or cible is None:
            continue
        liaisons.append({"de": source.get("technicalCode"), "vers": cible.get("technicalCode"),
                         "format": source.get("dataFormat")})

    return {
        "format": fmt["format"],
        "bundle": {"code": donnees_bundle.get("technicalCode"), "nom": donnees_bundle.get("name"),
                   "cible": donnees_bundle.get("target")},
        "composants": sorted(composants, key=lambda composant: composant["code"] or ""),
        "liaisons": sorted(liaisons, key=lambda liaison: (liaison["de"] or "", liaison["vers"] or "")),
    }


def _empreinte(spec: Any, fmt: dict) -> str | None:
    """L'empreinte du manifeste, ou None si la composition n'est pas lisible."""
    if not isinstance(spec, dict):
        return None
    try:
        canonique = json.dumps(_manifeste(spec, fmt), sort_keys=True, separators=(",", ":"),
                               ensure_ascii=False)
    except (TypeError, ValueError, AttributeError):
        # Une composition que l'application elle-même ne saurait pas projeter :
        # on garde l'empreinte qu'elle avait plutôt que d'en inventer une.
        return None
    return hashlib.sha256(canonique.encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------- #
#  Lecture et écriture des compositions, en texte
# --------------------------------------------------------------------------- #
# La composition est lue comme le texte enregistré (CAST ... AS TEXT), et
# réécrite comme un texte : c'est ce qui permet à la descente de rendre le
# texte d'origine au caractère près, y compris l'ordre des clés.
def _lire(texte: str | None) -> Any:
    if texte is None:
        return None
    try:
        return json.loads(texte)
    except (TypeError, ValueError):
        return None


def _ecrire(valeur: Any) -> str:
    # Comme le type JSON de SQLAlchemy, qui écrit les compositions de l'application.
    return json.dumps(valeur)


def _table(nom: str, avec_empreinte: bool) -> sa.Table:
    colonnes = [sa.column("id", sa.String), sa.column("spec", sa.Text)]
    if avec_empreinte:
        colonnes.append(sa.column("checksum", sa.String))
    return sa.table(nom, *colonnes)


def _lignes(connexion, table: sa.Table, avec_empreinte: bool) -> list:
    colonnes = [table.c.id, sa.cast(table.c.spec, sa.Text).label("texte")]
    if avec_empreinte:
        colonnes.append(table.c.checksum)
    return connexion.execute(sa.select(*colonnes).order_by(table.c.id)).fetchall()


def _mettre_a_jour(connexion, table: sa.Table, ligne_id: str, valeurs: dict) -> None:
    if valeurs:
        connexion.execute(sa.update(table).where(table.c.id == ligne_id).values(**valeurs))


# --------------------------------------------------------------------------- #
#  La permission
# --------------------------------------------------------------------------- #
def _renommer_permission(connexion, ancien: str, nouveau: str) -> None:
    """Change le code d'une permission, sans toucher à ceux qui l'ont reçue.

    Cas particulier : si une application a déjà démarré sur le nouveau code
    avant la migration, elle l'a créé à côté de l'ancien. Les droits accordés
    sous l'ancien passent alors au nouveau, et l'ancien disparaît : personne
    ne perd ce qu'il avait.
    """
    features = sa.table("features", sa.column("id", sa.String), sa.column("code", sa.String))
    ancienne = connexion.execute(sa.select(features.c.id).where(features.c.code == ancien)).scalar()
    if ancienne is None:
        return
    deja_la = connexion.execute(sa.select(features.c.id).where(features.c.code == nouveau)).scalar()
    if deja_la is None:
        connexion.execute(sa.update(features).where(features.c.id == ancienne).values(code=nouveau))
        return
    for nom_table, proprietaire in (("role_permissions", "role_id"),
                                    ("permission_group_permissions", "group_id")):
        table = sa.table(nom_table, sa.column(proprietaire, sa.String), sa.column("feature_id", sa.String))
        ont_deja = {ligne[0] for ligne in connexion.execute(
            sa.select(table.c[proprietaire]).where(table.c.feature_id == deja_la))}
        for (qui,) in connexion.execute(
                sa.select(table.c[proprietaire]).where(table.c.feature_id == ancienne)).fetchall():
            if qui not in ont_deja:
                connexion.execute(sa.update(table)
                                  .where(table.c.feature_id == ancienne, table.c[proprietaire] == qui)
                                  .values(feature_id=deja_la))
        connexion.execute(sa.delete(table).where(table.c.feature_id == ancienne))
    connexion.execute(sa.delete(features).where(features.c.id == ancienne))


# --------------------------------------------------------------------------- #
#  Montée et descente
# --------------------------------------------------------------------------- #
def _renommer_colonnes_du_robot(sens: int) -> None:
    # Le mode « batch » d'Alembic : SQLite ne sait pas tout faire avec ALTER
    # TABLE, PostgreSQL le fait directement.
    with op.batch_alter_table("robots") as robots:
        for ancienne, nouvelle in COLONNES_DU_ROBOT:
            de, vers = (ancienne, nouvelle) if sens > 0 else (nouvelle, ancienne)
            robots.alter_column(de, new_column_name=vers)


def upgrade() -> None:
    _renommer_colonnes_du_robot(+1)

    op.create_table(
        SAUVEGARDE,
        sa.Column("nom_table", sa.String(40), primary_key=True),
        sa.Column("ligne_id", sa.String(32), primary_key=True),
        sa.Column("spec", sa.Text()),
        sa.Column("checksum", sa.String(64)),
    )
    sauvegarde = sa.table(SAUVEGARDE, sa.column("nom_table", sa.String), sa.column("ligne_id", sa.String),
                          sa.column("spec", sa.Text), sa.column("checksum", sa.String))

    connexion = op.get_bind()
    for nom_table, avec_empreinte in TABLES_DE_COMPOSITIONS:
        table = _table(nom_table, avec_empreinte)
        for ligne in _lignes(connexion, table, avec_empreinte):
            empreinte_d_avant = ligne.checksum if avec_empreinte else None
            connexion.execute(sa.insert(sauvegarde).values(
                nom_table=nom_table, ligne_id=ligne.id, spec=ligne.texte, checksum=empreinte_d_avant))

            avant = _lire(ligne.texte)
            apres = _convertir(avant, ANCIEN, NOUVEAU)
            valeurs = {}
            if apres is not avant:
                valeurs["spec"] = _ecrire(apres)
            # Une version sans empreinte n'en reçoit pas : on n'invente rien.
            if avec_empreinte and empreinte_d_avant is not None:
                nouvelle = _empreinte(apres, NOUVEAU)
                if nouvelle is not None and nouvelle != empreinte_d_avant:
                    valeurs["checksum"] = nouvelle
            _mettre_a_jour(connexion, table, ligne.id, valeurs)

    _renommer_permission(connexion, ANCIENNE_PERMISSION, NOUVELLE_PERMISSION)


def downgrade() -> None:
    connexion = op.get_bind()
    _renommer_permission(connexion, NOUVELLE_PERMISSION, ANCIENNE_PERMISSION)

    sauvegarde = sa.table(SAUVEGARDE, sa.column("nom_table", sa.String), sa.column("ligne_id", sa.String),
                          sa.column("spec", sa.Text), sa.column("checksum", sa.String))
    gardees = {
        (ligne.nom_table, ligne.ligne_id): ligne
        for ligne in connexion.execute(sa.select(sauvegarde)).fetchall()
    }

    for nom_table, avec_empreinte in TABLES_DE_COMPOSITIONS:
        table = _table(nom_table, avec_empreinte)
        for ligne in _lignes(connexion, table, avec_empreinte):
            actuelle = _lire(ligne.texte)
            gardee = gardees.get((nom_table, ligne.id))
            inchangee = gardee is not None and (
                ligne.texte == gardee.spec
                or actuelle == _convertir(_lire(gardee.spec), ANCIEN, NOUVEAU)
            )
            if inchangee:
                # Rien n'a changé depuis la montée : on remet le texte et
                # l'empreinte d'origine, au caractère près.
                valeurs = {"spec": gardee.spec}
                if avec_empreinte:
                    valeurs["checksum"] = gardee.checksum
            else:
                # Créée ou modifiée après la montée : on la reconvertit, pour
                # que l'application d'avant sache la lire, sans perdre le travail.
                ancienne = _convertir(actuelle, NOUVEAU, ANCIEN)
                valeurs = {"spec": _ecrire(ancienne)} if ancienne is not actuelle else {}
                if avec_empreinte and ligne.checksum is not None:
                    empreinte_v1 = _empreinte(ancienne, ANCIEN)
                    if empreinte_v1 is not None:
                        valeurs["checksum"] = empreinte_v1
            _mettre_a_jour(connexion, table, ligne.id, valeurs)

    op.drop_table(SAUVEGARDE)
    _renommer_colonnes_du_robot(-1)
