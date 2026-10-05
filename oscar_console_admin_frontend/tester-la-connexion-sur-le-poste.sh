#!/bin/sh
# Prouve, dans le navigateur des tests d'écran, que la console qui tourne sur le
# poste fonctionne de bout en bout: l'interface (port 18200) se connecte à l'API
# du poste (port 18202), sans aucune API simulée (décision 120).
#
# Avant de le lancer, les deux applications tournent, comme le dit le
# LISEZ-MOI.md de la racine (étape 2):
#
#   (cd oscar_console_admin_api_backend && cp .env.exemple .env && docker compose up --build -d)
#   (cd oscar_console_admin_frontend && cp .env.exemple .env && docker compose up --build -d)
#   oscar_console_admin_frontend/tester-la-connexion-sur-le-poste.sh
#
# Le compte est l'administrateur du .env de l'API (ADMIN_EMAIL, ADMIN_PASSWORD),
# créé par l'API à son premier démarrage. Il passe au conteneur par son
# environnement, jamais sur une ligne de commande, et ne s'affiche jamais.
#
# Le conteneur de Playwright joint les ports du poste par le réseau de la
# machine (--network host): éprouvé sous Linux; sous macOS et Windows, non
# vérifié. Comme tester-les-ecrans.sh, l'image est celle de Playwright à la
# version verrouillée; IMAGE_PLAYWRIGHT en désigne une autre.
set -eu

DOSSIER=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
REGLAGES_API="$DOSSIER/../oscar_console_admin_api_backend/.env"
INTERFACE="http://127.0.0.1:${OSCAR_PORT_PUBLIE_INTERFACE:-18200}"
API="http://127.0.0.1:${OSCAR_PORT_PUBLIE_API:-18202}"

if [ ! -f "$REGLAGES_API" ]; then
  echo "Le fichier $REGLAGES_API manque: lancer d'abord l'API comme le dit le LISEZ-MOI.md (cp .env.exemple .env)." >&2
  exit 1
fi
if ! curl -s -o /dev/null -f "$API/health"; then
  echo "L'API du poste ne répond pas sur $API/health: la lancer d'abord (docker compose up --build -d dans oscar_console_admin_api_backend/)." >&2
  exit 1
fi
if ! curl -s -o /dev/null -f "$INTERFACE/index.html"; then
  echo "L'interface du poste ne répond pas sur $INTERFACE: la lancer d'abord (docker compose up --build -d dans oscar_console_admin_frontend/)." >&2
  exit 1
fi

# La valeur d'une variable du .env de l'API, telle quelle (« NOM=valeur »).
valeur_du_reglage() {
  sed -n "s/^$1=//p" "$REGLAGES_API" | tail -n 1
}
ADMIN_EMAIL=$(valeur_du_reglage ADMIN_EMAIL)
ADMIN_PASSWORD=$(valeur_du_reglage ADMIN_PASSWORD)
export ADMIN_EMAIL ADMIN_PASSWORD
ADRESSE_DE_L_INTERFACE_DU_POSTE=$INTERFACE
export ADRESSE_DE_L_INTERFACE_DU_POSTE

VERSION_PLAYWRIGHT=$(sed -n '/"node_modules\/@playwright\/test": {/{n;s/.*"version": "\([^"]*\)".*/\1/p;}' "$DOSSIER/package-lock.json")
if [ -z "$VERSION_PLAYWRIGHT" ]; then
  echo "Version de @playwright/test introuvable dans $DOSSIER/package-lock.json." >&2
  exit 1
fi
IMAGE_PLAYWRIGHT=${IMAGE_PLAYWRIGHT:-mcr.microsoft.com/playwright:v$VERSION_PLAYWRIGHT-noble}

docker run --rm --ipc=host --network host \
  -e ADMIN_EMAIL -e ADMIN_PASSWORD -e ADRESSE_DE_L_INTERFACE_DU_POSTE \
  -v "$DOSSIER:/source:ro" "$IMAGE_PLAYWRIGHT" sh -ceu '
  mkdir /tmp/interface
  tar -C /source --exclude=./node_modules --exclude=./dist -cf - . | tar -C /tmp/interface -xf -
  cd /tmp/interface
  npm ci --no-audit --no-fund
  # Sans effet si l image porte deja le navigateur de cette version.
  npx playwright install chromium
  npx playwright test --config playwright.poste.config.ts
'
