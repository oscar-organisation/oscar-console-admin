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
| Schéma de la base | Alembic, 15 migrations (`alembic/versions/`, de `0001` à `0015`) |
| Code | `app/routers/` (une route par sujet), `app/models.py` (les tables), `app/rbac.py` (le catalogue des droits), `app/seed.py` et `app/seed_data/` (les données de départ) |
| Tests | `tests/`, pytest, sur une base SQLite: ni PostgreSQL ni service extérieur |

**Au démarrage** (`docker-entrypoint.sh`), l'API applique les migrations de la
base (`alembic upgrade head`), puis crée les données de départ: le catalogue
des fonctionnalités, le catalogue des types du Studio, les rôles du système,
l'administrateur initial s'il n'existe pas, et les données de démonstration si
`SEED_DEMO` vaut `true`.

**La connexion** est celle de la console (`AUTH_MODE=legacy`): des jetons
signés par `SECRET_KEY`. Un module Keycloak existe dans le code, mais n'est
branché sur aucune route; Keycloak n'est pas déployé.

**LiveKit**, le serveur temps réel, transporte la vidéo et les commandes entre
un robot et son opérateur. L'API fabrique les jetons de session avec
`LIVEKIT_API_KEY` et `LIVEKIT_API_SECRET`, et interroge LiveKit à
`LIVEKIT_HOST_URL`. En test et en production, c'est le LiveKit du nouveau
serveur, `test-stream.oscar-bot.com` pour le test et `stream.oscar-bot.com`
pour la production (décisions 114 et 117): les descriptions de déploiement
de Coolify posent ces valeurs. Sur le poste, aucun LiveKit ne tourne.

Le fonctionnement de la perception (modèles, Model Boxes, affectations, service
de perception) est décrit dans
[L'intégration de l'IA et de la vision](integration-ia-et-vision.md).

## Les unités du Studio et la clé de la machine

Depuis le 05/10/2026, le rôle hébergé par un service ou une application
s'appelle une **unité**: le mot « agent » est réservé à l'intelligence
artificielle. Le programme du robot s'appelle le **runtime embarqué**, et sa
clé, la **clé de la machine**. La migration `0014` a réécrit la base en
conséquence:

| Avant | Maintenant |
|---|---|
| composition: `node.data.agents`, `agentType`, codes `..._AGENT_...` | `node.data.units`, `unitType`, codes `..._UNITE_...` |
| manifeste servi au robot: `oscar.bundle.runtime.v1`, liste `agents` | `oscar.bundle.runtime.v2`, liste `unites` |
| liste des bundles: `agent_count` | `unit_count` |
| `POST /api/robots/{id}/agent-key`, réponse `agent_key` | `POST /api/robots/{id}/machine-key`, réponse `machine_key` |
| en-tête du robot: `x-oscar-agent-key` | `x-oscar-machine-key` |
| permission `api:robot.agent_key` | `api:robot.machine_key` |
| colonnes `robots.agent_key_hash`, `robots.agent_key_issued_at` | `machine_key_hash`, `machine_key_issued_at` |
| réglage `EDGE_AGENT_API_KEY` | `EDGE_RUNTIME_API_KEY` |

Ce qui reste accepté, pour ne rien casser: une composition à l'ancien format
(l'API la convertit et n'écrit que le nouveau), l'en-tête `x-oscar-agent-key`
(les robots déjà installés l'envoient, et c'est par lui qu'ils téléchargent
leur mise à jour), et le réglage `EDGE_AGENT_API_KEY` quand
`EDGE_RUNTIME_API_KEY` est vide. **Un robot dont le programme ne lit que le
manifeste `v1` refuse le `v2`**: son programme doit apprendre à lire `unites`.

**Compatibilité avec l'interface d'avant le renommage (décision 125).** L'API
et l'interface sont mises en ligne en même temps, sans ordre: l'API sert donc
aussi ce que lit l'interface encore en ligne, le temps qu'elle passe.

- La liste des bundles sert `agent_count`, la même valeur que `unit_count`.
- `POST /api/robots/{id}/agent-key` répond comme `/machine-key` (même droit,
  même trace d'audit), et la réponse porte la clé sous `machine_key` et
  `agent_key`, sur les deux adresses.
- Toute composition servie porte, dans chaque bloc qui a `units`, une clé
  `agents` qui contient la même liste, et chaque unité porte `agentType`, la
  valeur de `unitType`. Les codes restent au nouveau format.
- Une composition reçue est enregistrée au seul nouveau format. Si un bloc
  porte les deux listes, chaque interface n'a pu modifier que la sienne: si
  `units` est restée celle que l'API avait servie et que `agents` a changé,
  c'est l'interface d'avant qui a travaillé, et sa liste fait foi; sinon
  `units` fait foi.

Tout cela est à retirer par une prochaine modification de l'API, une fois
l'interface passée (`composition_servie` dans `app/bundle_spec.py`, la clé
`agent_count`, l'adresse `/agent-key` et la clé `agent_key`, et le fichier de
tests `tests/test_compatibilite_decision_125.py`).

## Le brouillon du Studio

Le lot L1 du Studio ajoute un **brouillon au nouveau format**: le bundle n'est
plus un dessin de blocs et de traits, mais un modèle (format `oscar.bundle/1`)
fait de vrais objets: des zones d'environnement (robot, serveur, application
web...), la salle temps réel, des services et des applications dans leurs
zones, des unités avec leur traitement, leur interface, leurs bandes, leurs bus
et leurs canaux, et des liaisons d'un canal d'émission vers un canal de
réception. La mise en page (format `oscar.mise-en-page/1`, la position de
chaque bloc) est un document à part: déplacer un bloc ne change pas le modèle.
Ces routes s'ajoutent aux anciennes, qui restent pour l'interface d'avant
(décision 125).

**Le projet robotique.** Chaque organisation reçoit à sa création un projet
`PROJET_ROBOTIQUE_PRINCIPAL`, et chaque bundle y est rangé: la liste des
bundles sert `projet_id`. Aucune route ne gère encore les projets.

**Le catalogue.** Les types que le Studio propose (les huit environnements dont
la zone Externe, la salle, le service, l'application et l'unité, la bande, les
bus et les canaux) sont des fichiers de `app/seed_data/catalogue_studio/`, un
par type et par version (`<code>-<version>.json`), et les familles de la
palette sont dans `familles.json`. Ils sont recopiés en base à chaque
démarrage. **Une version publiée ne change plus**: si un fichier change le
contenu d'un type déjà en base à la même version, l'API refuse de démarrer et
nomme le fichier; on écrit la correction dans une nouvelle version.

| Route | Droit | Ce qu'elle fait |
|---|---|---|
| `GET /api/studio/catalogue` | `api:bundle.read` | les familles de la palette dans leur ordre, et les types publiés |
| `POST /api/studio/bundles` avec `depart` | `api:bundle.write` (création) | crée le bundle avec son brouillon, révision 1: `{"sorte": "VIDE"}`, ou `{"sorte": "PRESET", "slug": ...}` pour partir d'un préset du catalogue |
| `GET /api/studio/bundles/{id}/brouillon` | `api:bundle.read` | le brouillon; pour un bundle de l'ancienne console, sa reprise au nouveau format, révision 0, avec son rapport |
| `PUT /api/studio/bundles/{id}/brouillon` | `api:bundle.write` (modification) | enregistre `modele` et `mise_en_page`, s'ils partent de `revision_attendue` |
| `POST /api/studio/bundles/{id}/brouillon/verification` | `api:bundle.read` | les problèmes du brouillon; n'écrit rien |

**Enregistrer.** Chaque enregistrement envoie les deux documents entiers et la
révision dont il part (0 pour un brouillon pas encore enregistré). Le serveur
revérifie tout le modèle, quoi que le navigateur ait déjà vérifié. Un refus
ne change rien, et garde sa phrase dans `detail`, avec son code à côté:

| Réponse | Code | Quand |
|---|---|---|
| 409 | `BROUILLON_MODIFIE_AILLEURS` | quelqu'un a enregistré entre-temps; la réponse donne `revision_serveur` |
| 422 | `FORMAT_INCONNU` | un document n'est pas au format que lit le serveur |
| 422 | `STRUCTURE_INVALIDE` | un document est mal formé; le message dit où |
| 422 | le code de la règle enfreinte | par exemple `SERVICE_HORS_ZONE`, `SALLE_EN_DOUBLE`, `CODE_FIGE`; la réponse donne l'élément en cause et les parents où il pourrait aller |

La révision ne monte que si un document a changé. L'empreinte du modèle
(`empreinte_modele`) ne porte que sur le modèle. Enregistrer et vérifier ne
créent jamais ni version ni déploiement.

**Les règles du modèle** (`app/studio_modele/regles.py`) sont celles de la
conception du lot L1 (partie 3.4), chacune avec son code et son message. Le
navigateur joue les mêmes: un fichier de cas commun, pris aux formats OSCAR
(dépôt `oscar-tools`, étiquette `formats-oscar-v1.1.0`), dit le verdict attendu
de chaque cas, et les tests du serveur le rendent
(`tests/donnees/formats_oscar_v1/`, voir son `SOURCE.txt`).

**Un bundle de l'ancienne console** s'ouvre par une reprise
(`app/studio_modele/ancien_format.py`): ses blocs vont dans la zone de leur
environnement (l'ancienne « application métier » dans une zone « à
préciser »), la salle est posée, ses unités gagnent leur structure, ses
liaisons de données relient les mêmes canaux. Rien n'est deviné ni perdu: ce
qui n'a pas encore sa place (Box IA, mise en route) est gardé dans
`donnees_reprises`, et le rapport dit le reste. Un code déjà publié est figé.
L'ancienne version n'est jamais modifiée: un robot qui l'a reçue la lit
toujours.

**L'interface d'avant** crée, enregistre, publie et déploie toujours des
bundles à l'ancien format. Sur un bundle passé au nouvel éditeur,
`PUT .../draft` et `POST .../publish` répondent 409
`BUNDLE_PASSE_AU_NOUVEL_EDITEUR`. La liste des bundles garde ses champs et
ajoute `projet_id` et `format_brouillon` (`oscar.bundle/1`, `ancien` ou rien).

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
| `PERCEPTION_WORKER_API_KEY`, `EDGE_RUNTIME_API_KEY` | les clés du service de perception et du runtime embarqué des robots (`EDGE_AGENT_API_KEY`, l'ancien nom de la seconde, est encore lu quand elle est vide) |

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

Ils se sauvegardent et se restaurent par `sauvegarder-et-restaurer.sh`, sur le
poste comme sur le serveur: procédure [Restaurer un instantané](restaurer-un-instantane.md).
Les noms des services, des volumes et des dossiers où ils sont montés ne
changent pas: le script et la procédure s'appuient dessus.

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

**Revenir avant la migration `0014`** (le passage d'« agent » à « unité »,
voir plus haut): une image d'avant ne sait pas lire la base migrée. On défait
d'abord la migration, avec l'image actuelle qui la connaît, dans le conteneur
de l'API: `alembic downgrade 0013`. Puis on remet tout de suite l'ancienne
image, sans redémarrer l'actuelle entre les deux: à son démarrage, elle
referait la migration (`alembic upgrade head`).

**Revenir avant la migration `0015`** (les fondations du Studio de L1): de
même, `alembic downgrade 0014` avec l'image actuelle, puis l'ancienne image.
La descente s'arrête sans rien effacer s'il existe des brouillons au nouveau
format: on sauvegarde d'abord la base (`sauvegarder-et-restaurer.sh`), puis on
retire ces brouillons.
