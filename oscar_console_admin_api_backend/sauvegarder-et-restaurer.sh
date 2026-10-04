#!/bin/sh
# Sauvegarder et restaurer les données de l'API de la console: la base
# PostgreSQL, les modèles d'IA et les paquets embarqués des robots.
#
# Le même script sert sur le poste du développeur et sur le serveur: il
# retrouve les conteneurs et les volumes d'une composition de l'API par les
# étiquettes que Docker Compose leur pose (le nom du projet et le nom du
# service), puis par le dossier où chaque volume est monté dans le conteneur de
# l'API. Il n'a besoin que de Docker: chaque opération tourne dans un
# conteneur, avec l'image de la base, déjà présente, sans réseau et sans rien
# télécharger.
#
# Utilisation, depuis n'importe quel dossier:
#
#   sauvegarder-et-restaurer.sh [--projet <nom>] sauvegarder <dossier neuf>
#   sauvegarder-et-restaurer.sh [--projet <nom>] compter-les-lignes
#   sauvegarder-et-restaurer.sh [--projet <nom>] restaurer-la-base <fichier.dump> --remplacer-les-donnees-presentes
#   sauvegarder-et-restaurer.sh [--projet <nom>] restaurer-les-modeles-ia <archive.tar> --remplacer-les-donnees-presentes
#   sauvegarder-et-restaurer.sh [--projet <nom>] restaurer-les-paquets-embarques <archive.tar> --remplacer-les-donnees-presentes
#
# --projet: le nom du projet Docker Compose de la composition de l'API. Sur le
# poste, console-admin-api (ou la valeur de OSCAR_NOM_DU_DEPLOIEMENT); sur le
# serveur, l'identifiant de l'application Coolify. Défaut: console-admin-api.
#
# Les formats: la base au format de pg_dump --format=custom (« -Fc »), chaque
# volume en archive tar de son contenu. « sauvegarder » écrit exactement ces
# fichiers, avec leurs empreintes et le nombre de lignes de chaque table.
#
# Une restauration REMPLACE les données présentes: le script refuse de la
# lancer sans --remplacer-les-donnees-presentes. Sauvegardez d'abord l'état
# présent (« sauvegarder »): c'est le chemin du retour. Pendant une
# restauration, l'API est arrêtée, puis relancée; le script attend sa santé.
#
# La procédure pas à pas: docs/restaurer-un-instantane.md.
set -eu

# Les noms des services et les dossiers des volumes dans le conteneur de l'API:
# ceux de compose.yaml, qui ne changent pas sans ce script.
SERVICE_API="api"
SERVICE_BASE="base-de-donnees"
DOSSIER_MODELES_IA=/app/storage/models
DOSSIER_PAQUETS_EMBARQUES=/app/storage/edge-releases
ATTENTE_DE_LA_SANTE=300

PROJET=${OSCAR_NOM_DU_DEPLOIEMENT:-console-admin-api}

erreur() {
  echo "Erreur: $*" >&2
  exit 1
}

utilisation() {
  cat >&2 <<'TEXTE'
Utilisation:
  sauvegarder-et-restaurer.sh [--projet <nom>] sauvegarder <dossier neuf>
  sauvegarder-et-restaurer.sh [--projet <nom>] compter-les-lignes
  sauvegarder-et-restaurer.sh [--projet <nom>] restaurer-la-base <fichier.dump> --remplacer-les-donnees-presentes
  sauvegarder-et-restaurer.sh [--projet <nom>] restaurer-les-modeles-ia <archive.tar> --remplacer-les-donnees-presentes
  sauvegarder-et-restaurer.sh [--projet <nom>] restaurer-les-paquets-embarques <archive.tar> --remplacer-les-donnees-presentes
TEXTE
  exit 2
}

# Le conteneur d'un service de la composition, en marche ou arrêté: un seul.
conteneur_du_service() {
  trouves=$(docker ps --all \
    --filter "label=com.docker.compose.project=$PROJET" \
    --filter "label=com.docker.compose.service=$1" \
    --format '{{.Names}}')
  nombre=$(printf '%s' "$trouves" | grep -c . || true)
  if [ "$nombre" -eq 0 ]; then
    erreur "aucun conteneur du service $1 dans le projet « $PROJET ». Vérifier --projet (sur le poste: docker compose ls)."
  fi
  if [ "$nombre" -gt 1 ]; then
    erreur "plusieurs conteneurs du service $1 dans le projet « $PROJET »: $(printf '%s' "$trouves" | tr '\n' ' ')"
  fi
  printf '%s\n' "$trouves"
}

# Le volume monté sur un dossier du conteneur de l'API.
volume_monte_sur() {
  volume=$(docker inspect --format "{{range .Mounts}}{{if eq .Destination \"$2\"}}{{.Name}}{{end}}{{end}}" "$1")
  [ -n "$volume" ] || erreur "aucun volume monté sur $2 dans le conteneur $1."
  printf '%s\n' "$volume"
}

# L'image de la base: déjà sur la machine, elle porte tar et les outils de PostgreSQL.
image_de_la_base() {
  base=$(conteneur_du_service "$SERVICE_BASE")
  docker inspect --format '{{.Config.Image}}' "$base"
}

base_en_marche() {
  base=$(conteneur_du_service "$SERVICE_BASE")
  [ "$(docker inspect --format '{{.State.Running}}' "$base")" = true ] \
    || erreur "la base ($base) est arrêtée: la démarrer d'abord (docker start $base)."
  docker exec "$base" sh -c 'pg_isready --quiet --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' \
    || erreur "la base ($base) ne répond pas encore: réessayer dans quelques secondes."
  printf '%s\n' "$base"
}

arreter_l_api() {
  api=$(conteneur_du_service "$SERVICE_API")
  if [ "$(docker inspect --format '{{.State.Running}}' "$api")" = true ]; then
    echo "Arrêt de l'API ($api) pendant la restauration." >&2
    docker stop "$api" >/dev/null
  fi
}

relancer_l_api() {
  api=$(conteneur_du_service "$SERVICE_API")
  echo "Relance de l'API ($api), puis attente de sa santé (${ATTENTE_DE_LA_SANTE} s au plus)." >&2
  docker start "$api" >/dev/null
  debut=$(date +%s)
  while :; do
    etat=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}sans-controle{{end}}' "$api")
    case "$etat" in
      healthy) echo "L'API est saine: elle répond, et sa base aussi." >&2; return 0 ;;
      unhealthy) erreur "l'API s'est déclarée malade après la restauration: lire son journal (docker logs $api)." ;;
      sans-controle) erreur "le conteneur $api n'a pas de contrôle de santé: ce n'est pas la composition attendue." ;;
    esac
    [ $(( $(date +%s) - debut )) -lt "$ATTENTE_DE_LA_SANTE" ] \
      || erreur "l'API n'est pas saine après ${ATTENTE_DE_LA_SANTE} s: lire son journal (docker logs $api)."
    # Le contrôle de santé de la composition tourne à son rythme: on relit son
    # verdict toutes les deux secondes.
    sleep 2
  done
}

exiger_le_remplacement() {
  [ "${1:-}" = "--remplacer-les-donnees-presentes" ] \
    || erreur "une restauration remplace les données présentes. Sauvegarder d'abord l'état présent (verbe sauvegarder), puis relancer avec --remplacer-les-donnees-presentes."
}

fichier_lisible() {
  [ -f "$1" ] && [ -r "$1" ] || erreur "fichier introuvable ou illisible: $1"
}

compter_les_lignes() {
  base=$(base_en_marche)
  # Le nombre exact de lignes de chaque table du schéma public, une par ligne:
  # « table nombre », par ordre alphabétique.
  docker exec -i "$base" sh -c 'psql --quiet --no-align --tuples-only --field-separator=" " --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' <<'SQL'
SELECT table_name,
       (xpath('/row/n/text()',
              query_to_xml(format('SELECT count(*) AS n FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
SQL
}

sauvegarder() {
  dossier=$1
  if [ -e "$dossier" ] && [ -n "$(ls -A "$dossier" 2>/dev/null)" ]; then
    erreur "le dossier $dossier existe déjà et n'est pas vide: donner un dossier neuf."
  fi
  mkdir -p "$dossier"
  base=$(base_en_marche)
  api=$(conteneur_du_service "$SERVICE_API")
  image=$(image_de_la_base)

  echo "La base, au format pg_dump --format=custom..." >&2
  docker exec "$base" sh -c 'pg_dump --format=custom --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' > "$dossier/base-de-donnees.dump"
  for paire in "modeles-ia:$DOSSIER_MODELES_IA" "paquets-embarques:$DOSSIER_PAQUETS_EMBARQUES"; do
    nom=${paire%%:*}
    volume=$(volume_monte_sur "$api" "${paire#*:}")
    echo "Le volume $volume, en archive tar..." >&2
    docker run --rm --network none --pull never -v "$volume:/source:ro" "$image" tar -cf - -C /source . > "$dossier/$nom.tar"
  done
  compter_les_lignes > "$dossier/comptes-des-lignes.txt"
  ( cd "$dossier" && sha256sum base-de-donnees.dump modeles-ia.tar paquets-embarques.tar comptes-des-lignes.txt > empreintes.sha256 )
  echo "Sauvegarde écrite dans $dossier:" >&2
  ls -l "$dossier" >&2
}

restaurer_la_base() {
  fichier=$1
  fichier_lisible "$fichier"
  base=$(base_en_marche)
  # Le fichier se lit avant de toucher à quoi que ce soit.
  docker exec -i "$base" pg_restore --list < "$fichier" > /dev/null \
    || erreur "$fichier n'est pas une sauvegarde lisible au format pg_dump --format=custom: rien n'a été touché."
  arreter_l_api
  echo "Remplacement de la base par $fichier..." >&2
  docker exec "$base" sh -c 'dropdb --force --if-exists --username "$POSTGRES_USER" "$POSTGRES_DB" && createdb --username "$POSTGRES_USER" --owner "$POSTGRES_USER" "$POSTGRES_DB"'
  # --no-owner: les objets reviennent au compte de cette base, quel que soit le
  # compte de la base d'origine.
  docker exec -i "$base" sh -c 'pg_restore --no-owner --role "$POSTGRES_USER" --exit-on-error --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' < "$fichier" \
    || erreur "la restauration a échoué en cours de route; l'API reste arrêtée. Restaurer la sauvegarde prise avant, de la même façon."
  echo "Les lignes de chaque table, juste après la restauration (avant que l'API ne démarre):" >&2
  compter_les_lignes
  relancer_l_api
}

restaurer_un_volume() {
  archive=$1
  dossier_dans_l_api=$2
  fichier_lisible "$archive"
  api=$(conteneur_du_service "$SERVICE_API")
  volume=$(volume_monte_sur "$api" "$dossier_dans_l_api")
  image=$(image_de_la_base)
  # L'archive se lit avant de toucher au volume; elle ne doit contenir aucun
  # chemin absolu ni remontée de dossier.
  liste=$(docker run --rm -i --network none --pull never "$image" tar -tf - < "$archive") \
    || erreur "$archive n'est pas une archive tar lisible: rien n'a été touché."
  if printf '%s\n' "$liste" | grep -qE '^/|(^|/)\.\.(/|$)'; then
    erreur "$archive contient un chemin absolu ou une remontée de dossier: rien n'a été touché."
  fi
  arreter_l_api
  echo "Remplacement du contenu du volume $volume par $archive..." >&2
  docker run --rm -i --network none --pull never -v "$volume:/cible" "$image" \
    sh -euc 'find /cible -mindepth 1 -delete && tar -xf - -C /cible && echo "Fichiers dans le volume: $(find /cible -type f | wc -l)"' < "$archive"
  relancer_l_api
}

# --- Les arguments ----------------------------------------------------------
if [ "${1:-}" = "--projet" ]; then
  [ -n "${2:-}" ] || utilisation
  PROJET=$2
  shift 2
fi
verbe=${1:-}
[ -n "$verbe" ] || utilisation
shift

case "$verbe" in
  sauvegarder)
    [ "$#" -eq 1 ] || utilisation
    sauvegarder "$1" ;;
  compter-les-lignes)
    [ "$#" -eq 0 ] || utilisation
    compter_les_lignes ;;
  restaurer-la-base)
    [ "$#" -ge 1 ] || utilisation
    exiger_le_remplacement "${2:-}"
    restaurer_la_base "$1" ;;
  restaurer-les-modeles-ia)
    [ "$#" -ge 1 ] || utilisation
    exiger_le_remplacement "${2:-}"
    restaurer_un_volume "$1" "$DOSSIER_MODELES_IA" ;;
  restaurer-les-paquets-embarques)
    [ "$#" -ge 1 ] || utilisation
    exiger_le_remplacement "${2:-}"
    restaurer_un_volume "$1" "$DOSSIER_PAQUETS_EMBARQUES" ;;
  *)
    utilisation ;;
esac
