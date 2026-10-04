# L'interface de la console d'administration

**L'interface web de la console d'administration du client.** On y gère les
organisations, les sites, les utilisateurs et leurs droits, les robots et leurs
flottes, les modèles d'IA, le journal d'audit; on y pilote un robot depuis un
écran ou en casque (le cockpit XR), et on y compose des déploiements dans le
Studio. Elle ne garde aucune donnée: tout passe par l'API de la console
(composant `console-admin-api`), que le navigateur appelle directement.

Le code vient du dépôt des développeurs de la console
(`oscar-organisation/oscar_front_admin_systeme`, dossier
`Admin-Console-Front-end/`, commit `09004be` du 04/10/2026), repris tel quel le
04/10/2026, avec les seules corrections listées dans la PR de reprise
(plan 20, décision 109).

## Les adresses

| | Adresse |
|---|---|
| Production | `https://console.oscar-bot.com` |
| Test | `https://test-console.oscar-bot.com` |
| Sur le poste du développeur | `http://127.0.0.1:18200` |
| Le cockpit XR | la même adresse, suivie de `/xr/` |

L'application Coolify de chaque environnement s'appelle
`console-admin-interface-test` et `console-admin-interface-production` (projet
Coolify `console-admin`). Son image est rangée dans Harbor, l'entrepôt des
images: `registry-container.oscar-bot.com/oscar/console-admin-interface`.

## Comment elle est faite

| | |
|---|---|
| Langages | React 18, React Router 7, TypeScript (le noyau, le routage, les permissions, la configuration), JavaScript pour les pages les plus anciennes |
| Construction | Vite 8, sous Node 22 (`node:22.23.3-alpine`) |
| Service | nginx sans droits d'administrateur (`nginxinc/nginx-unprivileged:1.29-alpine`), port 3000 dans le conteneur |
| Code | `src/modules/` (administration, opérations, studio), `src/shared/` (noyau, appels à l'API, configuration), `src/app/` (démarrage) |
| Tests | Vitest pour les tests unitaires (`src/**/*.test.*`), Playwright pour les tests d'écran (`e2e/`) |

Les règles de contribution des développeurs sont dans le `README.md` du
dossier. Les cinq espaces que porte l'application (mon entreprise, console
d'administration, téléopération sur écran, téléopération en casque, studio)
sont décrits dans
[`LISEZ-MOI-espaces.md`](https://github.com/oscar-organisation/oscar-console-admin/blob/main/oscar_console_admin_frontend/LISEZ-MOI-espaces.md).

L'image se construit en deux étapes (`Dockerfile`): Vite produit les fichiers
de l'application, puis nginx les sert, avec le cockpit XR sous `/xr/`. La
construction refuse de produire une image sans cockpit.

## Les réglages

Ils sont publics: au démarrage du conteneur, `envsubst` écrit
`runtime-config.js` à partir des variables d'environnement, et le navigateur le
lit. Aucun secret n'a sa place ici. La liste complète, expliquée, est dans
[`.env.exemple`](https://github.com/oscar-organisation/oscar-console-admin/blob/main/oscar_console_admin_frontend/.env.exemple).

| Variable | Rôle |
|---|---|
| `OSCAR_API_BASE_URL` | l'adresse publique de l'API, préfixe `/api` compris; sans elle, l'application refuse de démarrer et le dit à l'écran |
| `OSCAR_COCKPIT_URL` | l'adresse complète du cockpit XR, par exemple `https://test-console.oscar-bot.com/xr/` |
| `OSCAR_ENVIRONMENT` | `local`, `test` ou `production`, dit dans les journaux d'erreurs |
| `OSCAR_APPLICATION_NAME`, `OSCAR_SHORT_NAME`, `OSCAR_DEFAULT_THEME`, `OSCAR_BASE_PATH`, `OSCAR_API_TIMEOUT_MS`, `OSCAR_SUPPORT_EMAIL` | l'affichage, avec des valeurs par défaut |

La version dite dans les journaux d'erreurs est l'étiquette de l'image en
ligne (`ETIQUETTE_IMAGE_A_METTRE_EN_LIGNE`).

## La santé

Le contrôle de santé de la composition, et la santé que vérifie le déploiement
automatique, demandent `/index.html`: nginx le sert tel quel, sans repli, et
répond 404 si l'application manque. Une autre adresse répondrait toujours par
le repli de l'application vers sa page d'accueil.

## Travailler sur son poste

Il faut Docker et git, rien d'autre. Depuis ce dossier:

```bash
cp .env.exemple .env
docker compose up --build -d
```

L'interface s'ouvre sur `http://127.0.0.1:18200`. Pour s'y connecter, l'API
doit tourner aussi (`oscar_console_admin_api_backend/`, même commande, sur
`http://127.0.0.1:18202`).

**Limite connue au 04/10/2026, à régler.** Sur le poste, la connexion échoue:
la politique de sécurité du contenu de l'interface (`connect-src 'self' https:
wss:`, dans `nginx-security-headers.conf`) refuse l'appel en `http` vers l'API
du poste. En test et en production, l'API est en `https`: rien ne bloque.

```bash
./tester.sh               # relecture du code, types, tests unitaires, construction
./tester-les-ecrans.sh    # les tests d'écran, à la main, avant une PR qui touche aux écrans
docker compose down       # arrêter
```

Chaque commande tourne dans un conteneur jetable. Les vérifications
automatiques de GitHub lancent `./tester.sh` à chaque PR.

## La mise en ligne et le retour en arrière

Une PR fusionnée dans `test` met l'interface en ligne en test; une PR de
`test` vers `main`, la même image en production. Le trajet complet est dans le
`LISEZ-MOI.md` à la racine du dépôt, et dans le guide du cycle de
développement du portail. Pour revenir en arrière, on remet en ligne une image
déjà rangée, par son étiquette: procédure « Revenir en arrière par
l'étiquette » de la documentation du déploiement (`oscar-infrastructure`).
