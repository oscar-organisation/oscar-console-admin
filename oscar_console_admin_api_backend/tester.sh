#!/bin/sh
# Lance toute la suite de tests de l'API dans un conteneur jetable: rien ne
# s'installe sur la machine, il suffit de Docker.
#
# Utilisation, depuis n'importe quel dossier:
#
#   oscar_console_admin_api_backend/tester.sh            toute la suite
#   oscar_console_admin_api_backend/tester.sh -k sante   les arguments vont à pytest
#
# Les vérifications automatiques de GitHub lancent la même commande.
#
# Le conteneur travaille sur une copie du dossier: les tests écrivent une base
# SQLite et des fichiers de modèles, qui disparaissent avec lui au lieu de
# s'ajouter au dépôt. Aucun PostgreSQL ni service extérieur n'est nécessaire.
#
# L'image de Python est celle de l'image de l'API: elle se lit dans le
# Dockerfile, pour qu'il n'y ait qu'un endroit où la changer.
set -eu

DOSSIER=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
IMAGE_PYTHON=$(sed -n 's/^FROM \(python:[^ ]*\)$/\1/p' "$DOSSIER/Dockerfile")
if [ -z "$IMAGE_PYTHON" ]; then
  echo "Image de Python introuvable dans $DOSSIER/Dockerfile (ligne « FROM python:... »)." >&2
  exit 1
fi

docker run --rm -v "$DOSSIER:/source:ro" "$IMAGE_PYTHON" sh -ceu '
  cp -R /source /tmp/api
  cd /tmp/api
  pip install --quiet --no-cache-dir --disable-pip-version-check --root-user-action=ignore -r requirements-dev.txt
  python -m pytest -p no:cacheprovider "$@"
' sh "$@"
