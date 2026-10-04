#!/bin/sh
# Reconstruit le cockpit XR de la console (public/xr/) à partir du dépôt
# oscar_front_casque_vr_ar, dans un conteneur jetable: rien ne s'installe sur
# la machine, il suffit de Docker et de git.
#
# Utilisation, depuis n'importe quel dossier:
#
#   scripts/update-xr-bundle.sh <dossier du dépôt du cockpit> [révision]
#
# La révision vaut HEAD par défaut; on peut donner un commit, une branche ou
# une étiquette. Le script écrit la révision exacte dans public/xr/.source-revision.
#
# POURQUOI CES PRÉCAUTIONS
#
# Le cockpit lit ses réglages VITE_* au moment de la construction et les
# recopie dans le JavaScript produit. Une ancienne construction, faite sur un
# poste, avait ainsi embarqué un jeton LiveKit dans la console. Ici:
#   - seuls les fichiers suivis par git à cette révision entrent dans la
#     construction (git archive): un fichier .env du poste n'y entre jamais;
#   - le conteneur ne reçoit aucune variable d'environnement: le cockpit reçoit
#     son adresse LiveKit, sa salle et son jeton de la console, à l'ouverture;
#   - le résultat est refusé s'il contient une chaîne qui ressemble à un jeton
#     signé (trois morceaux en base 64 séparés par des points, le premier
#     commençant par eyJ).
#
# L'image de Node est celle de la construction de la console: elle se lit dans
# le Dockerfile, pour qu'il n'y ait qu'un endroit où la changer.
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
FRONTEND_DIR=$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)
XR_TARGET="$FRONTEND_DIR/public/xr"

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Utilisation: $0 <dossier du dépôt oscar_front_casque_vr_ar> [révision]" >&2
  exit 2
fi
XR_SOURCE=$1
REVISION_DEMANDEE=${2:-HEAD}

if ! git -C "$XR_SOURCE" rev-parse --git-dir >/dev/null 2>&1; then
  echo "Le dossier $XR_SOURCE n'est pas un dépôt git: donner le clone de oscar_front_casque_vr_ar." >&2
  exit 1
fi
if ! XR_REVISION=$(git -C "$XR_SOURCE" rev-parse --verify --quiet "$REVISION_DEMANDEE^{commit}"); then
  echo "La révision $REVISION_DEMANDEE est introuvable dans $XR_SOURCE." >&2
  exit 1
fi
if ! git -C "$XR_SOURCE" cat-file -e "$XR_REVISION:package.json" 2>/dev/null; then
  echo "La révision $XR_REVISION n'a pas de package.json: ce n'est pas le dépôt du cockpit." >&2
  exit 1
fi
XR_REPOSITORY=$(git -C "$XR_SOURCE" remote get-url origin)

IMAGE_NODE=$(sed -n 's/^FROM \(node:[^ ]*\) AS build$/\1/p' "$FRONTEND_DIR/Dockerfile")
if [ -z "$IMAGE_NODE" ]; then
  echo "Image de Node introuvable dans $FRONTEND_DIR/Dockerfile (ligne « FROM node:... AS build »)." >&2
  exit 1
fi

DOSSIER_TEMPORAIRE=$(mktemp -d)
trap 'rm -rf -- "$DOSSIER_TEMPORAIRE"' EXIT INT TERM
mkdir "$DOSSIER_TEMPORAIRE/dist"

echo "Construction du cockpit $XR_REVISION avec $IMAGE_NODE, base /xr/..." >&2
# Le conteneur lit les fichiers de la révision sur son entrée et rend le
# dossier dist/ construit sur sa sortie, en archive tar: aucun dossier du poste
# n'est monté, et aucun fichier n'appartient à root sur le poste. Les messages
# de npm vont sur la sortie d'erreur, pour ne pas se mêler à l'archive.
git -C "$XR_SOURCE" archive --format=tar "$XR_REVISION" \
  | docker run --rm -i "$IMAGE_NODE" sh -eu -c '
      mkdir /construction && cd /construction
      tar -xf -
      npm ci --no-audit --no-fund >&2
      npm run build -- --base=/xr/ >&2
      test -f dist/index.html
      grep -q "/xr/assets/" dist/index.html
      tar -cf - -C dist .
    ' \
  | tar -xf - -C "$DOSSIER_TEMPORAIRE/dist"

if [ ! -f "$DOSSIER_TEMPORAIRE/dist/index.html" ] || ! grep -q '/xr/assets/' "$DOSSIER_TEMPORAIRE/dist/index.html"; then
  echo "La construction du cockpit n'a pas produit d'index.html servi sous /xr/." >&2
  exit 1
fi

# Seuls les noms des fichiers s'affichent, jamais la chaîne trouvée.
MOTIF_JETON='eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}'
if grep -rlE "$MOTIF_JETON" "$DOSSIER_TEMPORAIRE/dist" >&2; then
  echo "Le cockpit construit contient une chaîne qui ressemble à un jeton signé (fichiers ci-dessus): rien n'est copié." >&2
  exit 1
fi

mkdir -p "$XR_TARGET"
find "$XR_TARGET" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
cp -R "$DOSSIER_TEMPORAIRE/dist/." "$XR_TARGET/"
{
  printf 'repository=%s\n' "$XR_REPOSITORY"
  printf 'revision=%s\n' "$XR_REVISION"
} > "$XR_TARGET/.source-revision"

echo "Cockpit $XR_REVISION copié dans $XR_TARGET" >&2
