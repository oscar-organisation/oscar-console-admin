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
construit, se teste et se met en ligne de son côté, par son propre workflow de
GitHub: l'interface ne se remet pas en ligne quand seule l'API change, et
l'inverse.

| | L'interface | L'API |
|---|---|---|
| Dossier | [`oscar_console_admin_frontend/`](oscar_console_admin_frontend/LISEZ-MOI.md) | [`oscar_console_admin_api_backend/`](oscar_console_admin_api_backend/LISEZ-MOI.md) |
| Ce que c'est | l'application web (React, Vite), servie par nginx, avec le cockpit XR sous `/xr/` | l'API centrale (FastAPI) et sa base PostgreSQL 16 |
| Production | `https://console.oscar-bot.com` | `https://api-console.oscar-bot.com` |
| Test | `https://test-console.oscar-bot.com` | `https://test-api-console.oscar-bot.com` |
| Sur le poste | `http://127.0.0.1:18200` | `http://127.0.0.1:18202` (base sur `18203`) |
| Santé | `/index.html` | `/health` (200 si l'API et sa base répondent, 503 sinon) |
| Workflow de GitHub | `console-admin-interface.yml`, « Interface de la console » | `console-admin-api.yml`, « API de la console » |
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

## Les vérifications automatiques de GitHub

Trois workflows, dans `.github/workflows/` (un workflow est un fichier qui dit
à GitHub quoi vérifier, et quand): un pour ce qui vaut dans tout le dépôt, et
un par application (décision 124). Chacun ne se lance que pour ce qui le
concerne.

| Workflow | Ce qu'il vérifie | Ce qui le lance |
|---|---|---|
| `verifications-communes.yml`, « Vérifications communes » | aucune ligne d'attribution dans les commits, aucun secret, chaque fichier `.env` a son modèle, la typographie, les fichiers des workflows eux-mêmes | toute PR vers `test` ou `main`, et tout envoi sur ces branches, quoi qu'ils modifient |
| `console-admin-api.yml`, « API de la console » | les compositions et leur modèle `.env.exemple`, la documentation, les tests (`tester.sh`), puis la mise en ligne de l'API | une PR ou un envoi qui modifie `oscar_console_admin_api_backend/` ou son propre fichier de workflow |
| `console-admin-interface.yml`, « Interface de la console » | la même chose pour l'interface, plus ses deux règles de sécurité nginx, le cockpit XR et l'image construite (`controler-l-image.sh`), puis sa mise en ligne | une PR ou un envoi qui modifie `oscar_console_admin_frontend/` ou son propre fichier de workflow |

Une modification qui ne touche aucune des deux applications (les autres
dossiers, le `LISEZ-MOI.md` de la racine) ne lance que les vérifications
communes. Une modification des deux applications lance leurs deux workflows en
même temps: chacun réussit ou échoue de son côté, et ne met en ligne que son
application. Dans une PR, chaque workflow écrit son propre résumé, un
commentaire qui porte son nom.

Le workflow d'une application se relance aussi à la main, sans rien modifier:
page « Actions » du dépôt sur GitHub, choisir le workflow, « Run workflow »,
branche `test` ou `main`. Cela sert par exemple après une mise en ligne en
échec qu'aucun envoi suivant ne touche.

### L'API reste compatible avec l'interface déjà en ligne

L'API et l'interface ne s'attendent pas: quand les deux changent, elles sont
mises en ligne en même temps, sans ordre entre elles (décision 125). D'où une
règle pour tout changement de l'API: **une modification de l'API doit
continuer à marcher avec l'interface déjà en ligne: on ajoute d'abord, on
retire plus tard, une fois l'interface passée.** Par exemple, pour renommer un
champ, l'API sert d'abord l'ancien et le nouveau; l'interface passe au
nouveau; une modification suivante de l'API retire l'ancien.

### Détacher un jour une application dans son propre dépôt

Chaque application est prête à partir: son workflow n'écrit le nom de son
dossier qu'en tête, et ses tests, ses réglages et sa documentation vivent dans
son dossier. Les étapes, les mêmes pour toutes les applications OSCAR, sont
dans le guide commun, page
[« Un workflow par sous-projet »](https://github.com/oscar-organisation/oscar-general-gouvernance-project/blob/main/docs/05-un-workflow-par-sous-projet.md),
section « Détacher un jour un sous-projet dans son propre dépôt ».

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

Sur une machine neuve, il faut seulement **git** et **Docker** avec son
greffon Compose (essayé avec Docker Compose 5.5.1), et trois ports libres sur
la boucle locale: `18200`, `18202` et `18203`. Rien d'autre ne s'installe:
chaque image se construit dans Docker. L'API d'abord, puis l'interface,
chacune depuis son dossier.

**L'API et sa base:**

```bash
cd oscar_console_admin_api_backend
cp .env.exemple .env                  # une fois: les réglages du poste, sans aucun secret réel
docker compose up --build -d          # construit l'image de l'API, démarre la base puis l'API
docker compose ps                     # attendre « healthy » pour api et base-de-donnees (moins d'une minute)
curl http://127.0.0.1:18202/health    # {"status":"ok", ... "database":"ok"}
```

Au premier démarrage, l'API crée le schéma de la base (13 migrations),
l'administrateur du `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) et, avec
`SEED_DEMO=true`, des organisations, des robots et des comptes de
démonstration.

**L'interface:**

```bash
cd ../oscar_console_admin_frontend
cp .env.exemple .env
docker compose up --build -d
docker compose ps                     # attendre « healthy » pour interface
```

La console s'ouvre sur `http://127.0.0.1:18200`, le cockpit XR sur
`http://127.0.0.1:18200/xr/`. Après une modification du code,
`docker compose up --build -d` dans le dossier touché la reconstruit.
`docker compose down` arrête; les données de la base restent dans ses volumes
(`console-admin-base-de-donnees`, `console-admin-modeles-ia`,
`console-admin-paquets-embarques`). Pour mettre dans la base locale une copie
des données d'un autre environnement, voir la procédure « Restaurer un
instantané » de la documentation de l'API
(`oscar_console_admin_api_backend/docs/restaurer-un-instantane.md`).

Sur le poste, l'API répond en `http`: `compose.override.yaml` donne à
l'interface une règle de sécurité qui l'autorise à l'appeler, alors que
l'image, en test et en production, garde la sienne, qui n'accepte que
`https` (décision 120).

### 3. Tester

```bash
oscar_console_admin_api_backend/tester.sh          # toute la suite de l'API (pytest)
oscar_console_admin_frontend/tester.sh             # relecture, types, tests unitaires, construction
oscar_console_admin_frontend/tester-les-ecrans.sh  # les tests d'écran, à la main, si on a touché aux écrans
oscar_console_admin_frontend/tester-la-connexion-sur-le-poste.sh  # la connexion de bout en bout, contre la console lancée à l'étape 2
```

Les deux premiers sont ceux que lancent les vérifications automatiques de
GitHub, chacun dans le workflow de son application: s'ils réussissent sur le
poste, ils réussissent sur GitHub.

### 4. Proposer sa modification: une PR vers `test`

```bash
git add <les fichiers modifiés, nommés un par un>
git commit -m "Ce qui change, dit simplement"
git push -u origin travail/<sujet>
```

Puis ouvrir une PR de `travail/<sujet>` vers `test` sur GitHub. Les
vérifications automatiques de GitHub la contrôlent: les vérifications communes
toujours, et le workflow de chaque application dont la PR modifie le dossier
(voir « Les vérifications automatiques de GitHub » plus haut). Une PR ne met
jamais rien en ligne.

### 5. La voir en test

À la fusion de la PR dans `test`, le workflow de chaque application **dont le
dossier a changé** construit son image, une seule fois, la range dans Harbor,
puis la met en ligne en test et vérifie sa santé réelle. Si les deux
applications ont changé, les deux mises en ligne se font en même temps, sans
ordre entre elles. On regarde le résultat sur
`https://test-console.oscar-bot.com`. Une modification de la seule
documentation d'une application (`*.md`, `docs/`, `mkdocs.yml`,
`catalog-info.yaml`) lance son workflow, qui vérifie la documentation, mais ne
reconstruit et ne remet rien en ligne: la mise en ligne dit « déjà en ligne ».

### 6. La mettre en production: une PR de `test` vers `main`

Une PR de `test` vers `main`, à la fin d'une mission. Elle lance les
vérifications communes et le workflow de chaque application qui a changé
depuis la dernière mise en production; chacun s'assure en quelques secondes
que son image a bien été testée. À la fusion, **la même image** est mise en
ligne en production, sans rien reconstruire. On regarde le résultat sur
`https://console.oscar-bot.com`, et la santé sur
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

Ils ne se mettent pas en ligne et n'ont pas changé à la reprise du code. Ils
n'ont pas de workflow propre, faute de tests: seules les vérifications
communes les relisent.

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
