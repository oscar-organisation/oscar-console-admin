# L'API de la console d'administration

L'API centrale de la console (FastAPI) et sa base PostgreSQL 16. L'interface
de la console (`../oscar_console_admin_frontend/`) l'appelle depuis le
navigateur.

| | |
|---|---|
| Application (déploiement commun) | `console-admin-api` |
| Image dans Harbor | `registry-container.oscar-bot.com/oscar/console-admin-api` |
| Base | `postgres:16.15-alpine`, image publique |
| Test | `https://test-api-console.oscar-bot.com` |
| Production | `https://api-console.oscar-bot.com` |
| Sur le poste | `http://127.0.0.1:18202` (la base sur `127.0.0.1:18203`) |
| Santé | `/health`: 200 si l'API et sa base répondent, 503 sinon |

La documentation complète, affichée aussi dans le portail technique:
[`docs/index.md`](docs/index.md). Le trajet d'une modification, du poste à la
production: le [`LISEZ-MOI.md`](../LISEZ-MOI.md) de la racine du dépôt.

## Les commandes

Il faut Docker et git, rien d'autre. Depuis ce dossier:

```bash
cp .env.exemple .env                   # une fois: les réglages du poste
docker compose up --build -d           # construire et lancer l'API et sa base
curl http://127.0.0.1:18202/health     # {"status":"ok", ... "database":"ok"}
./tester.sh                            # toute la suite de tests, dans un conteneur jetable
docker compose down                    # arrêter; les données restent dans les volumes
```

Pour sauvegarder les données, ou restaurer un instantané (une base
`pg_dump -Fc` et les archives des deux volumes):
[`docs/restaurer-un-instantane.md`](docs/restaurer-un-instantane.md).

## Les fichiers

| Fichier | Ce qu'il fait |
|---|---|
| `app/` | le code de l'API: routes, tables, droits, données de départ |
| `alembic/`, `alembic.ini` | les migrations du schéma de la base |
| `tests/` | les tests (pytest, base SQLite), dont la santé (`test_sante.py`) et la composition (`test_composition.py`) |
| `Dockerfile`, `docker-entrypoint.sh` | l'image, et son démarrage: migrations, puis l'API sur le port 8000 |
| `compose.yaml` | la composition que Coolify met en ligne: l'API (image de Harbor) et sa base, aucun port publié |
| `compose.override.yaml` | le complément du poste: construction locale, ports 18202 et 18203 |
| `.env.exemple` | chaque réglage de la composition expliqué, avec les valeurs du poste |
| `tester.sh` | les tests, dans un conteneur jetable |
| `sauvegarder-et-restaurer.sh` | sauvegarde et restaure la base et les deux volumes, dans des conteneurs, sur le poste comme sur le serveur ([`docs/restaurer-un-instantane.md`](docs/restaurer-un-instantane.md)) |
| `requirements.txt`, `requirements-dev.txt` | les paquets Python de l'API, et ceux des tests |
| `catalog-info.yaml`, `mkdocs.yml`, `docs/` | les fiches et la documentation du portail technique |
| `README.md` | les notes des développeurs de la console: les deux profils d'administrateur, les périmètres |
