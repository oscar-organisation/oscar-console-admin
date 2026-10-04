# L'API de la console d'administration

**L'API centrale de la console d'administration du client.** Elle porte les
organisations et leur hiérarchie, les sites, les utilisateurs, les rôles et
les droits par fonctionnalité, les robots et les jetons de leurs sessions
LiveKit, les modèles d'IA et leur affectation, le Studio des déploiements, les
paquets embarqués des robots, et le journal d'audit. L'interface de la console
(composant `console-admin-interface`) l'appelle depuis le navigateur.

Le code vient du dépôt des développeurs de la console
(`oscar-organisation/oscar_front_admin_systeme`, dossier `Backend/`, commit
`09004be` du 04/10/2026), repris tel quel le 04/10/2026, avec les seules
corrections listées dans la PR de reprise (plan 20, décision 109).

## Les adresses

| | Adresse |
|---|---|
| Production | `https://api-console.oscar-bot.com` |
| Test | `https://test-api-console.oscar-bot.com` |
| Sur le poste du développeur | `http://127.0.0.1:18202` (la base: `127.0.0.1:18203`) |
| Les routes | sous `/api`, par exemple `/api/auth/login` |
| La description de l'API | `/docs` (à lire) et `/openapi.json` (pour les outils) |
| La santé | `/health` |

L'application Coolify de chaque environnement s'appelle
`console-admin-api-test` et `console-admin-api-production` (projet Coolify
`console-admin`). Son image est rangée dans Harbor, l'entrepôt des images:
`registry-container.oscar-bot.com/oscar/console-admin-api`. La base est
l'image publique `postgres:16.15-alpine`.

## Comment elle est faite

| | |
|---|---|
| Langage | Python 3.12 (`python:3.12-slim`), FastAPI, SQLAlchemy 2, Pydantic 2 |
| Base | PostgreSQL 16; SQLite pour les tests seulement |
| Schéma de la base | Alembic, 13 migrations (`alembic/versions/`, de `0001` à `0013`) |
| Code | `app/routers/` (une route par sujet), `app/models.py` (les tables), `app/rbac.py` (le catalogue des droits), `app/seed.py` et `app/seed_data/` (les données de départ) |
| Tests | `tests/`, pytest, sur une base SQLite: ni PostgreSQL ni service extérieur |

**Au démarrage** (`docker-entrypoint.sh`), l'API applique les migrations de la
base (`alembic upgrade head`), puis crée les données de départ: le catalogue
des fonctionnalités, les rôles du système, l'administrateur initial s'il
n'existe pas, et les données de démonstration si `SEED_DEMO` vaut `true`.

**La connexion** est celle de la console (`AUTH_MODE=legacy`): des jetons
signés par `SECRET_KEY`. Un module Keycloak existe dans le code, mais n'est
branché sur aucune route; Keycloak n'est pas déployé.

**LiveKit**, le serveur temps réel, transporte la vidéo et les commandes entre
un robot et son opérateur. L'API fabrique les jetons de session avec
`LIVEKIT_API_KEY` et `LIVEKIT_API_SECRET`, et interroge LiveKit à
`LIVEKIT_HOST_URL`.

Le fonctionnement de la perception (modèles, Model Boxes, affectations, service
de perception) est décrit dans
[L'intégration de l'IA et de la vision](integration-ia-et-vision.md).

## Les réglages

La liste complète, expliquée, est dans
[`.env.exemple`](https://github.com/oscar-organisation/oscar-console-admin/blob/main/oscar_console_admin_api_backend/.env.exemple);
`compose.yaml` les transmet à l'API. Les valeurs par défaut de la composition
sont celles du code (`app/config.py`), sauf les secrets, toujours vides, et
`SEED_DEMO`, éteint: le test `tests/test_composition.py` le vérifie. En test et
en production, les variables sont posées sur l'application Coolify par
l'assistant de déploiement, et les secrets viennent de `secret_root/`.

| Secret | Rôle |
|---|---|
| `POSTGRES_PASSWORD` | le mot de passe de la base (lettres, chiffres et tirets seulement: il entre dans l'adresse de connexion) |
| `SECRET_KEY` | signe les jetons de connexion à la console |
| `ADMIN_PASSWORD` | le mot de passe de l'administrateur créé au premier démarrage |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | signent les jetons des sessions des robots et du cockpit |
| `SMTP_PASSWORD` | le compte du courriel sortant, s'il est réglé |
| `PERCEPTION_WORKER_API_KEY`, `EDGE_AGENT_API_KEY` | les clés du service de perception et de l'agent embarqué des robots |

## La santé

`/health` répond **200** quand l'API répond et que sa base répond, **503**
sinon (`{"status": "error", "database": "unreachable"}`). Le contrôle de santé
de la composition et le déploiement automatique lisent cette route: une API
qui ne peut pas lire sa base n'est pas déclarée saine. Les tests
`tests/test_sante.py` vérifient les deux cas.

## Les données

| Volume | Monté sur | Contenu |
|---|---|---|
| `console-admin-base-de-donnees` | `/var/lib/postgresql/data` (la base) | toute la base de la console |
| `console-admin-modeles-ia` | `/app/storage/models` (l'API) | les fichiers des modèles d'IA déposés |
| `console-admin-paquets-embarques` | `/app/storage/edge-releases` (l'API) | les paquets embarqués publiés pour les robots |

La restauration des données de l'ancien serveur dans ces volumes est l'objet
de la phase 3 du plan 20, qui en écrira la procédure pas à pas.

## Travailler sur son poste

Il faut Docker et git, rien d'autre. Depuis ce dossier:

```bash
cp .env.exemple .env
docker compose up --build -d
curl http://127.0.0.1:18202/health      # {"status":"ok", ... "database":"ok"}
```

Le compte administrateur du poste est celui de `.env` (`ADMIN_EMAIL`,
`ADMIN_PASSWORD`). Les autres commandes:

```bash
./tester.sh               # toute la suite de tests, dans un conteneur jetable
./tester.sh -k sante      # une partie seulement: les arguments vont à pytest
docker compose logs -f api
docker compose down       # arrêter; les données restent dans les volumes
```

Les vérifications automatiques de GitHub lancent `./tester.sh` à chaque PR.

## La mise en ligne et le retour en arrière

Une PR fusionnée dans `test` met l'API en ligne en test; une PR de `test` vers
`main`, la même image en production. Le trajet complet est dans le
`LISEZ-MOI.md` à la racine du dépôt, et dans le guide du cycle de
développement du portail. Pour revenir en arrière, on remet en ligne une image
déjà rangée, par son étiquette (procédure « Revenir en arrière par
l'étiquette » de la documentation du déploiement, `oscar-infrastructure`).
**La base ne revient pas en arrière**: avant de remettre une image plus
ancienne, vérifier qu'elle sait lire la base d'aujourd'hui (les migrations
Alembic ne se défont pas seules).
