# L'interface de la console d'administration

L'interface web de la console: React et Vite, servie par nginx, avec le cockpit
XR sous `/xr/`. Elle ne garde aucune donnée et appelle l'API de la console
(`../oscar_console_admin_api_backend/`) depuis le navigateur.

| | |
|---|---|
| Application (déploiement commun) | `console-admin-interface` |
| Image dans Harbor | `registry-container.oscar-bot.com/oscar/console-admin-interface` |
| Test | `https://test-console.oscar-bot.com` |
| Production | `https://console.oscar-bot.com` |
| Sur le poste | `http://127.0.0.1:18200` |
| Santé | `/index.html` (404 si l'application manque) |

La documentation complète, affichée aussi dans le portail technique:
[`docs/index.md`](docs/index.md) et [`docs/le-cockpit-xr.md`](docs/le-cockpit-xr.md).
Le trajet d'une modification, du poste à la production: le
[`LISEZ-MOI.md`](../LISEZ-MOI.md) de la racine du dépôt.

## Les commandes

Il faut Docker et git, rien d'autre. Depuis ce dossier:

```bash
cp .env.exemple .env              # une fois: les réglages du poste
docker compose up --build -d      # construire et lancer, sur http://127.0.0.1:18200
./tester.sh                       # relecture du code, types, tests unitaires, construction
./tester-les-ecrans.sh            # les tests d'écran (Playwright), à la main
./tester-la-connexion-sur-le-poste.sh   # la connexion de bout en bout, contre l'API du poste
docker compose down               # arrêter
```

Pour se connecter, l'API doit tourner aussi: même commande dans
`../oscar_console_admin_api_backend/`.

## Les fichiers

| Fichier | Ce qu'il fait |
|---|---|
| `src/`, `index.html`, `public/` | le code de l'application, et ses fichiers servis tels quels |
| `public/xr/` | le cockpit XR, construit depuis le dépôt `oscar_front_casque_vr_ar` (révision dans `.source-revision`) |
| `scripts/update-xr-bundle.sh` | reconstruit le cockpit XR, dans un conteneur, sans jeton |
| `Dockerfile` | l'image: Vite sous Node 22 construit, nginx sert |
| `nginx-spa.conf`, `nginx-security-headers.conf` | les règles du serveur web et ses en-têtes de sécurité |
| `nginx-security-headers.poste.conf` | la même règle de sécurité, plus l'API du poste en `http`; montée sur le poste seulement, par `compose.override.yaml` (décision 120) |
| `controler-l-image.sh` | contrôle une image construite: règle de sécurité d'origine, cockpit XR sans jeton |
| `runtime-config.template.js` | les réglages publics écrits au démarrage du conteneur |
| `compose.yaml` | la composition que Coolify met en ligne: l'image de Harbor, aucun port publié |
| `compose.override.yaml` | le complément du poste: construction locale, port 18200 |
| `.env.exemple` | chaque réglage expliqué, avec les valeurs du poste |
| `tester.sh`, `tester-les-ecrans.sh` | les tests, dans un conteneur jetable |
| `e2e/`, `playwright.config.ts` | les scénarios des tests d'écran |
| `e2e-poste/`, `playwright.poste.config.ts`, `tester-la-connexion-sur-le-poste.sh` | le scénario de bout en bout contre la console qui tourne sur le poste |
| `catalog-info.yaml`, `mkdocs.yml`, `docs/` | la fiche et la documentation du portail technique |
| `README.md` | les règles de contribution des développeurs de la console |
| `LISEZ-MOI-espaces.md` | les cinq espaces que porte l'application |
