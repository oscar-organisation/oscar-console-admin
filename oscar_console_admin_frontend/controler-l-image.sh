#!/bin/sh
# Contrôle le contenu d'une image construite de l'interface, avant qu'elle ne
# soit rangée dans l'entrepôt d'images (leçon 3.4: après une construction,
# vérifier le contenu de l'image, pas seulement qu'elle démarre).
#
#   ./controler-l-image.sh <image>
#
# Le déploiement automatique commun le lance sur l'image exacte qui sera
# rangée (entrée controles_des_images), et les vérifications automatiques de
# GitHub sur l'image construite pour chaque PR. Sur le poste, après
# « docker compose build »:
#
#   ./controler-l-image.sh registry-container.oscar-bot.com/oscar/console-admin-interface:construite-sur-le-poste-du-developpeur
#
# Ce qu'il vérifie:
#   1. la règle de sécurité de l'image est exactement nginx-security-headers.conf
#      du dépôt, jamais la variante du poste (décision 120), dans le fichier et
#      dans l'en-tête Content-Security-Policy que le serveur envoie vraiment;
#   2. la configuration de nginx se lit;
#   3. le cockpit XR est là, servi sous /xr/, sans chaîne de la forme d'un
#      jeton signé.
#
# Chaque vérification tourne dans un conteneur de l'image, sans réseau.
set -eu

if [ "$#" -ne 1 ]; then
  echo "Utilisation: $0 <image de l'interface>" >&2
  exit 2
fi
IMAGE=$1
DOSSIER=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
REGLE="$DOSSIER/nginx-security-headers.conf"

dans_l_image() {
  docker run --rm --network none --pull never --entrypoint sh "$IMAGE" -c "$1"
}

echo "1. La règle de sécurité de l'image est celle du dépôt."
dans_l_image 'cat /etc/nginx/snippets/security-headers.conf' | cmp -s - "$REGLE" || {
  echo "Erreur: /etc/nginx/snippets/security-headers.conf de l'image n'est pas nginx-security-headers.conf du dépôt." >&2
  exit 1
}
attendue=$(sed -n 's/^add_header Content-Security-Policy "\(.*\)" always;$/\1/p' "$REGLE")
[ -n "$attendue" ] || { echo "Erreur: aucune ligne Content-Security-Policy dans $REGLE." >&2; exit 1; }
# Le serveur de l'image démarre dans le conteneur, et on lit l'en-tête qu'il
# envoie: c'est ce que le navigateur reçoit. Le script entre apostrophes
# s'exécute dans le conteneur: ses variables y sont lues, pas ici.
# shellcheck disable=SC2016
envoyee=$(dans_l_image 'nginx 2>/dev/null
  essais=0
  until curl -s -o /dev/null http://127.0.0.1:3000/index.html; do
    essais=$((essais + 1)); [ "$essais" -lt 50 ] || exit 1; sleep 0.2
  done
  curl -sI http://127.0.0.1:3000/index.html' | tr -d '\r' | sed -n 's/^[Cc]ontent-[Ss]ecurity-[Pp]olicy: //p')
if [ "$envoyee" != "$attendue" ]; then
  echo "Erreur: l'en-tête Content-Security-Policy envoyé par l'image n'est pas celui de nginx-security-headers.conf." >&2
  exit 1
fi
echo "   identique, dans le fichier et dans l'en-tête envoyé."

echo "2. La configuration de nginx se lit."
dans_l_image 'nginx -t 2>&1' | tail -1

echo "3. Le cockpit XR est là, sans jeton."
dans_l_image 'cd /usr/share/nginx/html/xr \
  && test -f index.html && grep -q "/xr/assets/" index.html \
  && ! grep -rqE "eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}" .' || {
  echo "Erreur: le cockpit XR de l'image manque, n'est pas servi sous /xr/, ou contient une chaîne de la forme d'un jeton signé." >&2
  exit 1
}
echo "   présent, servi sous /xr/, aucun jeton."
echo "Image contrôlée: $IMAGE"
