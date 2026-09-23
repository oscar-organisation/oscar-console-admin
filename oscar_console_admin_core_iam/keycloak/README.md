# Provisioning Keycloak - OSCAR (Lot 0)

Keycloak 26.x est l'IAM de la plateforme (voir `docs/evolutions/1/adr/ADR-01`,
`ADR-02`, `ADR-03`). Ce dossier fournit :

- `realm-oscar.json` : export minimal du realm `oscar`, importe automatiquement au
  demarrage du conteneur via `--import-realm`.
- `sync_realm.py` : script Python (stdlib) rejouable qui synchronise les
  privileges (realm roles) et les roles metier (composite roles) depuis la source
  de verite unique `Backend/app/seed_data/rbac_catalog.json`.

## 1. Demarrer Keycloak (local)

Le service `keycloak` (+ sa base dediee `keycloak-db`) est defini dans
`Backend/docker-compose.yml`. La feature Organizations est activee
(`--features=organizations`).

```bash
cd Backend
docker compose up -d keycloak-db keycloak
# Console admin : http://localhost:8080  (admin / admin par defaut, voir .env)
```

Le realm `oscar` est importe au premier demarrage (deux clients OIDC :
`oscar-frontend` public + PKCE S256, `oscar-backend` confidentiel + service
account ; un mapper ajoute le claim `organizations` dans l'access token).

## 2. Synchroniser le catalogue RBAC (idempotent)

Une fois Keycloak demarre, injecter/mettre a jour les privileges et roles :

```bash
python3 infra/keycloak/sync_realm.py
```

Rejouable autant de fois que necessaire : aucun doublon n'est cree. Le script
cree ce qui manque et met a jour les libelles/compositions ; il ne supprime rien.

## 3. Variables d'environnement (aucun secret en dur)

| Variable                     | Defaut (dev)              | Role                                         |
|------------------------------|---------------------------|----------------------------------------------|
| `KEYCLOAK_BASE_URL`          | `http://localhost:8080`   | Base de l'Admin REST API                     |
| `KEYCLOAK_REALM`             | `oscar`                   | Realm cible                                  |
| `KEYCLOAK_ADMIN_USER`        | `admin`                   | Compte admin (bootstrap Keycloak)            |
| `KEYCLOAK_ADMIN_PASSWORD`    | `admin`                   | Mot de passe admin                           |
| `RBAC_CATALOG_PATH`          | `Backend/app/seed_data/rbac_catalog.json` | Catalogue source          |
| `OSCAR_BACKEND_CLIENT_SECRET`| (a fournir)               | Secret du client confidentiel `oscar-backend`|
| `OSCAR_FRONTEND_REDIRECT_URIS` | `http://localhost:5173/*` | Redirect URIs du SPA (import realm)        |
| `OSCAR_FRONTEND_WEB_ORIGINS` | `http://localhost:5173`   | Web origins CORS du SPA                       |

Cote backend (validation des tokens), voir `Backend/app/config.py` :
`OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL`, `KEYCLOAK_*`, `AUTH_MODE`.

En Lot 0 le backend reste en `AUTH_MODE=legacy` : rien n'est casse, la validation
JWKS (`app/auth/keycloak.py`) est prete mais non branchee sur les routes.

## 4. Deploiement (proxy / prod)

En production, Keycloak est defini dans `Backend/docker-compose.proxy.yml` :
- pas de port publie en direct (`expose` uniquement, derriere le proxy nginx/TLS),
- `KC_PROXY=edge`, `KC_HOSTNAME` via env,
- secrets (admin, DB, client backend) par variables d'environnement.

Placeholders du realm resolus a l'import via env (ex `OSCAR_BACKEND_CLIENT_SECRET`,
`OSCAR_FRONTEND_REDIRECT_URIS`). Ne jamais committer de secret exploitable.
