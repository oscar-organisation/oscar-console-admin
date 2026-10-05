#!/bin/sh
# Lance les tests d'écran de l'interface (Playwright) dans un conteneur
# jetable. Ils se lancent à la main, avant une PR qui touche aux écrans: les
# vérifications automatiques de GitHub ne les lancent pas (décision 91).
#
#   oscar_console_admin_frontend/tester-les-ecrans.sh                 tous les scénarios
#   oscar_console_admin_frontend/tester-les-ecrans.sh e2e/studio.spec.ts
#
# Les arguments vont à « playwright test ». Les scénarios simulent l'API
# (page.route): ni l'API ni sa base ne sont nécessaires. Chaque scénario se joue
# sur un écran de bureau et sur un écran de téléphone (Pixel 7).
#
# L'image est celle de Playwright à la version verrouillée dans
# package-lock.json, qui porte déjà son navigateur. Pour employer une autre
# image déjà présente sur la machine, la donner dans IMAGE_PLAYWRIGHT: le
# navigateur de la bonne version se télécharge alors dans le conteneur, et
# disparaît avec lui.
set -eu

DOSSIER=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
VERSION_PLAYWRIGHT=$(sed -n '/"node_modules\/@playwright\/test": {/{n;s/.*"version": "\([^"]*\)".*/\1/p;}' "$DOSSIER/package-lock.json")
if [ -z "$VERSION_PLAYWRIGHT" ]; then
  echo "Version de @playwright/test introuvable dans $DOSSIER/package-lock.json." >&2
  exit 1
fi
IMAGE_PLAYWRIGHT=${IMAGE_PLAYWRIGHT:-mcr.microsoft.com/playwright:v$VERSION_PLAYWRIGHT-noble}

docker run --rm --ipc=host -v "$DOSSIER:/source:ro" "$IMAGE_PLAYWRIGHT" sh -ceu '
  mkdir /tmp/interface
  tar -C /source --exclude=./node_modules --exclude=./dist -cf - . | tar -C /tmp/interface -xf -
  cd /tmp/interface
  npm ci --no-audit --no-fund
  # Sans effet si l image porte deja le navigateur de cette version.
  npx playwright install chromium
  npx playwright test "$@"
' sh "$@"
