# oscar-console-admin

**La console d'administration du client OSCAR.** C'est l'outil de travail
quotidien du client, qu'il peut aussi installer chez lui: il y gère ses
organisations, ses sites, ses utilisateurs et leurs droits, ses robots et
leurs flottes, ses modèles d'IA et le journal d'audit; il y pilote un robot
depuis un écran ou en casque (le cockpit XR); il y compose des déploiements
dans le Studio.

**Dépôt GitHub:** `oscar-organisation/oscar-console-admin`.

## Les deux applications

La console est faite de deux applications, une par dossier. Chacune se
construit, se teste et se met en ligne de son côté: l'interface ne se remet pas
en ligne quand seule l'API change, et l'inverse.

| | L'interface | L'API |
|---|---|---|
| Dossier | [`oscar_console_admin_frontend/`](oscar_console_admin_frontend/LISEZ-MOI.md) | [`oscar_console_admin_api_backend/`](oscar_console_admin_api_backend/LISEZ-MOI.md) |
| Ce que c'est | l'application web (React, Vite), servie par nginx, avec le cockpit XR sous `/xr/` | l'API centrale (FastAPI) et sa base PostgreSQL 16 |
| Production | `https://console.oscar-bot.com` | `https://api-console.oscar-bot.com` |
| Test | `https://test-console.oscar-bot.com` | `https://test-api-console.oscar-bot.com` |
| Sur le poste | `http://127.0.0.1:18200` | `http://127.0.0.1:18202` (base sur `18203`) |
| Santé | `/index.html` | `/health` (200 si l'API et sa base répondent, 503 sinon) |
| Application du déploiement commun | `console-admin-interface` | `console-admin-api` |
| Image dans Harbor | `oscar/console-admin-interface` | `oscar/console-admin-api` |
| Applications Coolify (projet `console-admin`) | `console-admin-interface-test`, `-production` | `console-admin-api-test`, `-production` |

Le navigateur du visiteur charge l'interface, puis appelle l'API par son
adresse publique. L'API fabrique aussi les jetons des sessions temps réel des
robots (LiveKit). Le port `18201` reste réservé à l'authentification
(convention des ports, bloc `182xx`).

**État au 04/10/2026.** Les quatre adresses mènent au nouveau serveur, mais ne
servent encore rien (mesuré à 22h45 UTC): les applications Coolify, les
environnements et les secrets de GitHub se mettent en place à la phase 2 du
plan 20. Jusque-là, une PR vers `test` est vérifiée, mais la mise en ligne
d'un envoi sur `test` ne peut pas aboutir. La console en service reste
`admin-console.oscar-bot.com`, sur l'ancien serveur.

**D'où vient le code.** Les deux dossiers sont la copie du dépôt des
développeurs de la console (`oscar-organisation/oscar_front_admin_systeme`,
commit `09004be` du 04/10/2026, dossiers `Admin-Console-Front-end/` et
`Backend/`), avec les seules corrections listées dans la PR de reprise. Le
cockpit XR est construit depuis le dépôt `oscar_front_casque_vr_ar`, révision
`ee02b6e`. Le document de l'intégration de l'IA et de la vision, qui était à la
racine du dépôt des développeurs, est dans la documentation de l'API.

## Comment on travaille

Il faut **git et Docker, rien d'autre**: chaque outil (Node, Python, nginx,
PostgreSQL, Playwright) tourne dans un conteneur. Le guide commun du cycle de
développement, valable pour toutes les applications OSCAR, explique chaque
étape en détail:
[`oscar-general-gouvernance-project/docs`](https://github.com/oscar-organisation/oscar-general-gouvernance-project/tree/main/docs),
affiché aussi dans le portail technique, `https://tech.oscar-bot.com`.

### 1. Cloner, et partir de `test`

```bash
git clone https://github.com/oscar-organisation/oscar-console-admin.git
cd oscar-console-admin
git switch test
git switch -c travail/<sujet>         # une branche par sujet, partie de test
```

### 2. Lancer la console sur son poste

L'API d'abord, puis l'interface, chacune depuis son dossier:

```bash
cd oscar_console_admin_api_backend
cp .env.exemple .env                  # une fois: les réglages du poste, sans aucun secret réel
docker compose up --build -d
curl http://127.0.0.1:18202/health    # {"status":"ok", ... "database":"ok"}

cd ../oscar_console_admin_frontend
cp .env.exemple .env
docker compose up --build -d
```

La console s'ouvre sur `http://127.0.0.1:18200`. Le compte administrateur du
poste est celui du `.env` de l'API (`ADMIN_EMAIL` et `ADMIN_PASSWORD`); avec
`SEED_DEMO=true`, des organisations, des robots et des comptes de
démonstration sont créés au premier démarrage. Après une modification du code,
`docker compose up --build -d` dans le dossier touché la reconstruit.
`docker compose down` arrête; les données de la base restent dans son volume.

**Limite connue au 04/10/2026, à régler.** Sur le poste, la connexion par
l'interface échoue: sa politique de sécurité du contenu (CSP, dans
`oscar_console_admin_frontend/nginx-security-headers.conf`) n'autorise le
navigateur à appeler que des adresses en `https`, et l'API du poste répond en
`http`. Le navigateur refuse alors l'appel à `/api/auth/login` (mesuré le
04/10/2026; le même essai, la CSP mise de côté, se connecte et charge la
console). En test et en production, l'API est en `https`: rien ne bloque. Les
tests d'écran simulent l'API et ne sont pas touchés. La correction proposée
est décrite dans la PR de reprise du code.

### 3. Tester

```bash
oscar_console_admin_api_backend/tester.sh          # toute la suite de l'API (pytest)
oscar_console_admin_frontend/tester.sh             # relecture, types, tests unitaires, construction
oscar_console_admin_frontend/tester-les-ecrans.sh  # les tests d'écran, à la main, si on a touché aux écrans
```

Les deux premiers sont ceux que lancent les vérifications automatiques de
GitHub: s'ils réussissent sur le poste, ils réussissent sur GitHub.

### 4. Proposer sa modification: une PR vers `test`

```bash
git add <les fichiers modifiés, nommés un par un>
git commit -m "Ce qui change, dit simplement"
git push -u origin travail/<sujet>
```

Puis ouvrir une PR de `travail/<sujet>` vers `test` sur GitHub. Les
vérifications automatiques de GitHub la contrôlent: vérifications rapides
(lignes d'attribution, secrets, typographie, compositions, documentation),
puis les tests des deux applications. Une PR ne met jamais rien en ligne.

### 5. La voir en test

À la fusion de la PR dans `test`, le déploiement automatique commun construit
l'image de chaque application **dont le dossier a changé**, une seule fois, la
range dans Harbor, puis la met en ligne en test et vérifie sa santé réelle. On
regarde le résultat sur `https://test-console.oscar-bot.com`. Une modification
de la seule documentation (`*.md`, `docs/`, `mkdocs.yml`, `catalog-info.yaml`)
ne reconstruit et ne remet rien en ligne.

### 6. La mettre en production: une PR de `test` vers `main`

Une PR de `test` vers `main`, à la fin d'une mission. Les vérifications
s'assurent en quelques secondes que l'image a bien été testée; à la fusion,
**la même image** est mise en ligne en production, sans rien reconstruire. On
regarde le résultat sur `https://console.oscar-bot.com`, et la santé sur
`https://api-console.oscar-bot.com/health`.

### 7. Revenir en arrière

- **Tout de suite, sans rien reconstruire**: dans Coolify, on donne à
  `ETIQUETTE_IMAGE_A_METTRE_EN_LIGNE` l'étiquette de la version d'avant
  (`en-production-depuis-le-<date>`), puis on remet en ligne. La procédure pas
  à pas: « Revenir en arrière par l'étiquette », dans la documentation du
  déploiement (`oscar-infrastructure/oscar_infra_deploiement/docs/mise-en-ligne/`).
  **La base de l'API ne revient pas en arrière**: avant de remettre une API
  plus ancienne, vérifier qu'elle sait lire la base d'aujourd'hui.
- **Pour de bon**: `git revert` de la fusion fautive, sur une branche
  `travail/<sujet>`, puis le même trajet, PR vers `test`, puis vers `main`.

## Les autres dossiers

Ils ne se mettent pas en ligne et n'ont pas changé à la reprise du code.

```
oscar-console-admin
├── oscar_console_admin_frontend          l'interface, et ses cinq espaces
├── oscar_console_admin_api_backend       l'API et sa base
├── oscar_console_admin_core_iam          la configuration Keycloak (pas en service)
├── oscar_console_admin_scripts           les scripts d'exploitation d'avant
└── oscar_sample_app_and_services         les exemples pour les intégrateurs
      ├── oscar_sample_env_remote
      ├── oscar_sample_env_server
      ├── oscar_sample_env_robot
      └── oscar_sample_config
```

**Les cinq espaces ne sont pas des dossiers.** Ce sont les espaces applicatifs
portés par le code de l'interface, décrits dans
[`oscar_console_admin_frontend/LISEZ-MOI-espaces.md`](oscar_console_admin_frontend/LISEZ-MOI-espaces.md).
Décision 50.

## Le portail technique

Le fichier `catalog-info.yaml` de la racine renvoie aux fiches des deux
dossiers: les composants `console-admin-interface` et `console-admin-api`, la
description de l'API `console-admin-api` et la base
`console-admin-base-de-donnees`, dans le système `console`. Chaque composant a
sa documentation (`mkdocs.yml` et `docs/` de son dossier), que le portail lit
sur `main`. Pour la construire sur le poste, depuis le dossier:
`docker compose -f docs/outils/compose.yaml run --rm construire`.

## Nommage

Le nom du dépôt s'écrit avec des **tirets**, décision 34. Les dossiers à
l'intérieur gardent les **tirets bas**: ce sont des paquets. Les noms des
applications, des images, des services et des volumes suivent le plan 20
(décision 109): `console-admin-interface`, `console-admin-api`, services
`interface`, `api` et `base-de-donnees`.
