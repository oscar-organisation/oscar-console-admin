#!/usr/bin/env python3
"""Provisioning idempotent du realm OSCAR dans Keycloak (Admin REST API).

Lit le catalogue RBAC (source de verite unique) et UPSERT dans Keycloak :
  - les privileges  -> realm roles simples (par code),
  - les roles metier -> composite roles (par code) referencant leurs privileges.

Rejouable sans doublon : chaque role est identifie par son nom (= code stable).
Le script cree ce qui manque, met a jour les labels/compositions, ne supprime rien.

Config par variables d'environnement (aucun secret en dur) :
  KEYCLOAK_BASE_URL          (defaut http://localhost:8080)
  KEYCLOAK_REALM             (defaut oscar)
  KEYCLOAK_ADMIN_USER        (defaut admin)
  KEYCLOAK_ADMIN_PASSWORD    (defaut admin)
  RBAC_CATALOG_PATH          (defaut ../../Backend/app/seed_data/rbac_catalog.json)

Usage :
  python3 infra/keycloak/sync_realm.py

Dependances : stdlib uniquement (urllib). Portable, sans installation.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get("KEYCLOAK_BASE_URL", "http://localhost:8080").rstrip("/")
REALM = os.environ.get("KEYCLOAK_REALM", "oscar")
ADMIN_USER = os.environ.get("KEYCLOAK_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("KEYCLOAK_ADMIN_PASSWORD", "admin")

_DEFAULT_CATALOG = (
    Path(__file__).resolve().parents[2]
    / "Backend" / "app" / "seed_data" / "rbac_catalog.json"
)
CATALOG_PATH = Path(os.environ.get("RBAC_CATALOG_PATH", str(_DEFAULT_CATALOG)))

TIMEOUT = float(os.environ.get("KEYCLOAK_HTTP_TIMEOUT", "10"))


# --------------------------------------------------------------------------- #
#  Petit client HTTP (stdlib)
# --------------------------------------------------------------------------- #
def _request(method: str, url: str, *, token: str | None = None, data=None, form=False) -> tuple[int, bytes]:
    headers = {"Accept": "application/json"}
    body = None
    if data is not None:
        if form:
            body = urllib.parse.urlencode(data).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:  # noqa: S310
            return resp.status, resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()


def get_admin_token() -> str:
    url = f"{BASE_URL}/realms/master/protocol/openid-connect/token"
    status, body = _request(
        "POST", url, form=True,
        data={
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": ADMIN_USER,
            "password": ADMIN_PASSWORD,
        },
    )
    if status != 200:
        raise SystemExit(f"Echec d'authentification admin ({status}) : {body.decode(errors='replace')}")
    return json.loads(body)["access_token"]


# --------------------------------------------------------------------------- #
#  Operations realm roles (idempotentes)
# --------------------------------------------------------------------------- #
def get_role(token: str, name: str) -> dict | None:
    url = f"{BASE_URL}/admin/realms/{REALM}/roles/{urllib.parse.quote(name)}"
    status, body = _request("GET", url, token=token)
    if status == 200:
        return json.loads(body)
    if status == 404:
        return None
    raise SystemExit(f"Erreur lecture role {name} ({status}) : {body.decode(errors='replace')}")


def upsert_role(token: str, name: str, description: str, composite: bool) -> dict:
    existing = get_role(token, name)
    payload = {"name": name, "description": description, "composite": composite}
    if existing is None:
        url = f"{BASE_URL}/admin/realms/{REALM}/roles"
        status, body = _request("POST", url, token=token, data=payload)
        if status not in (201, 204):
            raise SystemExit(f"Echec creation role {name} ({status}) : {body.decode(errors='replace')}")
        return get_role(token, name)
    # update (label / flag composite) - idempotent
    url = f"{BASE_URL}/admin/realms/{REALM}/roles/{urllib.parse.quote(name)}"
    status, body = _request("PUT", url, token=token, data={**existing, **payload})
    if status not in (200, 204):
        raise SystemExit(f"Echec maj role {name} ({status}) : {body.decode(errors='replace')}")
    return get_role(token, name)


def get_composites(token: str, name: str) -> list[dict]:
    url = f"{BASE_URL}/admin/realms/{REALM}/roles/{urllib.parse.quote(name)}/composites"
    status, body = _request("GET", url, token=token)
    if status == 200:
        return json.loads(body)
    if status == 404:
        return []
    raise SystemExit(f"Erreur lecture composites {name} ({status}) : {body.decode(errors='replace')}")


def add_composites(token: str, name: str, roles: list[dict]) -> None:
    if not roles:
        return
    url = f"{BASE_URL}/admin/realms/{REALM}/roles/{urllib.parse.quote(name)}/composites"
    status, body = _request("POST", url, token=token, data=roles)
    if status not in (200, 204):
        raise SystemExit(f"Echec ajout composites {name} ({status}) : {body.decode(errors='replace')}")


# --------------------------------------------------------------------------- #
#  Synchronisation principale
# --------------------------------------------------------------------------- #
def sync() -> None:
    if not CATALOG_PATH.exists():
        raise SystemExit(f"Catalogue RBAC introuvable : {CATALOG_PATH}")
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    privileges = catalog.get("privileges", [])
    roles = catalog.get("roles", [])

    print(f"Keycloak : {BASE_URL} | realm : {REALM}")
    print(f"Catalogue : {CATALOG_PATH} ({len(privileges)} privileges, {len(roles)} roles)")
    token = get_admin_token()

    # 1) Privileges = realm roles simples.
    priv_repr: dict[str, dict] = {}
    created = updated = 0
    for p in privileges:
        before = get_role(token, p["code"])
        role = upsert_role(token, p["code"], p.get("label", p["code"]), composite=False)
        priv_repr[p["code"]] = role
        if before is None:
            created += 1
        else:
            updated += 1
    print(f"Privileges : {created} crees, {updated} confirmes/majs.")

    # 2) Roles metier = composite roles referencant leurs privileges.
    rc = ru = 0
    for r in roles:
        before = get_role(token, r["code"])
        upsert_role(token, r["code"], r.get("label", r["code"]), composite=True)
        if before is None:
            rc += 1
        else:
            ru += 1
        # Ajoute les composites manquants (idempotent : Keycloak ignore les doublons,
        # on filtre tout de meme sur l'existant pour rester propre).
        existing_names = {c["name"] for c in get_composites(token, r["code"])}
        to_add = [
            priv_repr[code]
            for code in r.get("privileges", [])
            if code in priv_repr and code not in existing_names
        ]
        add_composites(token, r["code"], to_add)
    print(f"Roles metier : {rc} crees, {ru} confirmes/majs (composites synchronises).")
    print("Synchronisation terminee (idempotente).")


if __name__ == "__main__":
    try:
        sync()
    except KeyboardInterrupt:
        sys.exit(130)
