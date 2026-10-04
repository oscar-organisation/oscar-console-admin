#!/bin/sh
# Lance les vérifications de l'interface dans un conteneur jetable: rien ne
# s'installe sur la machine, il suffit de Docker.
#
#   oscar_console_admin_frontend/tester.sh
#
# C'est « npm run quality »: la relecture du code (lint), les types
# (TypeScript), les tests unitaires (Vitest) et la construction (Vite). Les
# vérifications automatiques de GitHub lancent la même commande. Les tests
# d'écran (Playwright) se lancent à la main: tester-les-ecrans.sh.
#
# Le conteneur travaille sur une copie du dossier, sans node_modules ni dist du
# poste: les dépendances s'installent depuis package-lock.json, et rien ne
# s'écrit dans le dépôt.
#
# L'image de Node est celle de la construction de l'image de l'interface: elle
# se lit dans le Dockerfile, pour qu'il n'y ait qu'un endroit où la changer.
set -eu

DOSSIER=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
IMAGE_NODE=$(sed -n 's/^FROM \(node:[^ ]*\) AS build$/\1/p' "$DOSSIER/Dockerfile")
if [ -z "$IMAGE_NODE" ]; then
  echo "Image de Node introuvable dans $DOSSIER/Dockerfile (ligne « FROM node:... AS build »)." >&2
  exit 1
fi

docker run --rm -v "$DOSSIER:/source:ro" "$IMAGE_NODE" sh -ceu '
  mkdir /tmp/interface
  tar -C /source --exclude=./node_modules --exclude=./dist -cf - . | tar -C /tmp/interface -xf -
  cd /tmp/interface
  npm ci --no-audit --no-fund
  npm run quality
'
