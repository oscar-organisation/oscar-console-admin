# Restaurer un instantané

**Version 1.0 du 04/10/2026.** Pour mettre dans une composition de l'API les
données d'une autre: la base PostgreSQL, les modèles d'IA et les paquets
embarqués des robots. La même procédure vaut sur le poste du développeur et
sur le serveur; seul change le nom du projet.

Un instantané, ce sont trois fichiers au plus:

| Fichier | Contenu | Format |
|---|---|---|
| la base | toute la base de la console | `pg_dump --format=custom` (« `-Fc` ») |
| les modèles d'IA | le contenu du volume `console-admin-modeles-ia` | archive tar |
| les paquets embarqués | le contenu du volume `console-admin-paquets-embarques` | archive tar |

Tout passe par le script `sauvegarder-et-restaurer.sh` du dossier de l'API. Il
n'a besoin que de Docker: chaque opération tourne dans un conteneur, avec
l'image de la base déjà présente, sans réseau et sans rien télécharger.

**Éprouvé** le 04/10/2026 sur le poste, sur des données d'essai: une
composition neuve, lancée depuis un clone propre, a reçu l'instantané d'une
autre (une organisation et des fichiers propres à la source); après
restauration, les 42 tables avaient exactement les lignes de la source, les
fichiers les mêmes empreintes, l'API était saine et l'administrateur de la
source s'est connecté; puis le retour à la sauvegarde prise avant a rendu
l'état de départ. **Non éprouvé sur le serveur**: les applications Coolify de
la console n'existaient pas encore. Ce que la procédure suppose de Coolify a
été lu sur une application en service (le portail): le nom du projet est
l'identifiant de l'application, et chaque conteneur porte le nom de son
service.

## Ce qu'il faut savoir avant

- **Une restauration remplace les données présentes.** On sauvegarde d'abord
  l'état présent (étape 2): c'est le chemin du retour. Le script refuse de
  restaurer sans `--remplacer-les-donnees-presentes`.
- **L'API est arrêtée** pendant chaque restauration, puis relancée; le script
  attend sa santé. La console ne répond pas pendant ce temps (quelques
  secondes à une minute).
- **La base doit venir d'une version du code que l'API connaît.** Au
  démarrage, l'API applique les migrations qui manquent; elle ne sait pas
  défaire celles d'une version plus récente. Les migrations de ce dépôt vont
  de `0001` à `0013`.
- **Au démarrage, l'API ajoute ses données de départ** si elles manquent:
  l'administrateur de `ADMIN_EMAIL`, et les données de démonstration si
  `SEED_DEMO` vaut `true`. Pour restaurer les données réelles d'un
  environnement, mettre `SEED_DEMO=false`, et dans `ADMIN_EMAIL` l'adresse
  d'un administrateur de la base restaurée (sinon un compte de plus est créé).
- **Les fichiers d'un instantané réel sont des données sensibles**: les garder
  hors de tout dépôt, lisibles par le seul compte qui restaure.

## Étape 1. Trouver le nom du projet

Le script retrouve la composition par le nom de son projet Docker Compose.

| Où | Nom du projet |
|---|---|
| Sur le poste | `console-admin-api`, ou la valeur de `OSCAR_NOM_DU_DEPLOIEMENT` dans le `.env` de l'API |
| Sur le serveur | l'identifiant de l'application Coolify `console-admin-api-test` ou `console-admin-api-production`: celui que garde la variable `COOLIFY_APPLICATION` de l'environnement GitHub du même nom |

Sur le serveur, la commande suivante montre, pour chaque conteneur d'API de la
console, le nom de son projet:

```bash
docker ps --filter label=com.docker.compose.service=api \
  --format '{{.Names}}  projet: {{.Label "com.docker.compose.project"}}'
```

Dans les commandes qui suivent, `PROJET` désigne ce nom, et
`SCRIPT=oscar_console_admin_api_backend/sauvegarder-et-restaurer.sh`, depuis la
racine d'un clone à jour du dépôt (sur le serveur, un clone rangé dans
`exploitation/`: rien sur le serveur ne dépend de `code/`).

```bash
PROJET=console-admin-api
SCRIPT=oscar_console_admin_api_backend/sauvegarder-et-restaurer.sh
```

**Ce qu'on doit voir.** `"$SCRIPT" --projet "$PROJET" compter-les-lignes` liste
les tables de la base et leur nombre de lignes. Un nom de projet faux donne:
« aucun conteneur du service base-de-donnees dans le projet ... ».

## Étape 2. Sauvegarder l'état présent

```bash
"$SCRIPT" --projet "$PROJET" sauvegarder <dossier neuf>
```

**Ce qu'on doit voir.** Le dossier contient `base-de-donnees.dump`,
`modeles-ia.tar`, `paquets-embarques.tar`, `comptes-des-lignes.txt` (le nombre
de lignes de chaque table) et `empreintes.sha256`. Le même verbe fabrique un
instantané à restaurer ailleurs.

## Étape 3. Vérifier l'instantané à restaurer

Dans le dossier de l'instantané, si ses empreintes l'accompagnent:

```bash
sha256sum -c <fichier des empreintes>
```

**Ce qu'on doit voir.** `OK` pour chaque fichier. Sinon, ne pas restaurer:
reprendre l'instantané.

## Étape 4. Restaurer la base

```bash
"$SCRIPT" --projet "$PROJET" restaurer-la-base <fichier de la base> --remplacer-les-donnees-presentes
```

Le script lit d'abord le fichier (un fichier illisible ne touche à rien),
arrête l'API, remplace la base, affiche le nombre de lignes de chaque table
juste après la restauration, relance l'API et attend sa santé.

**Ce qu'on doit voir.** « L'API est saine: elle répond, et sa base aussi. » Les
nombres affichés sont ceux de l'instantané (comparer avec son fichier de
comptes, s'il en a un). Ensuite, l'API peut ajouter ses propres lignes: une
connexion ajoute une ligne au journal d'audit.

## Étape 5. Restaurer les fichiers

```bash
"$SCRIPT" --projet "$PROJET" restaurer-les-modeles-ia <archive des modèles> --remplacer-les-donnees-presentes
"$SCRIPT" --projet "$PROJET" restaurer-les-paquets-embarques <archive des paquets> --remplacer-les-donnees-presentes
```

Chaque commande lit l'archive, arrête l'API, vide le volume, y extrait
l'archive, relance l'API et attend sa santé. L'extraction se fait dans un
conteneur jetable où seul le volume est monté; un chemin qui sortirait du
dossier (`/`, `../`) y est ramené à l'intérieur.

**Ce qu'on doit voir.** « Fichiers dans le volume: N », puis l'API saine. Un
instantané sans archive des paquets (par exemple celui de l'ancien serveur, du
04/10/2026) laisse ce volume tel quel.

## Étape 6. Vérifier

```bash
"$SCRIPT" --projet "$PROJET" compter-les-lignes
curl https://<adresse de l'API>/health          # sur le poste: http://127.0.0.1:18202/health
```

**Ce qu'on doit voir.** Les nombres de lignes attendus; la santé
`{"status":"ok", ... "database":"ok"}`; dans la console, la connexion avec un
compte de la base restaurée.

## Revenir en arrière

Restaurer, de la même façon (étapes 4 et 5), la sauvegarde prise à l'étape 2.

## L'instantané de l'ancien serveur

Celui du 04/10/2026 (dossier
`exploitation/instantanes-ancien-serveur/console-admin/20261004-2206/`, sur le
serveur, hors de tout dépôt) porte ses fichiers sous d'autres noms: la base
dans `oscar_admin.dump`, les modèles d'IA dans
`volume-backend_oscar_ai_models.tar`; les paquets embarqués n'y sont pas. Son
fichier `EMPREINTES.sha256` sert à l'étape 3, ses fichiers
`COMPTES-LIGNES-*.txt` à l'étape 6.
