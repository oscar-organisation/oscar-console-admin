# =============================================================================
# Frontend Console Admin OSCAR - build Vite puis service statique via Nginx
# La configuration publique est injectee au demarrage, sans rebuild du bundle.
# =============================================================================

# --- Etape 1 : build de la SPA React/Vite ---
# Node 22, version figee: Node 20 n'est plus suivi, Vite 8 et ESLint 10 exigent
# au moins 20.19 ou 22.12, et les verifications automatiques de GitHub
# construisent avec cette meme image. Le script scripts/update-xr-bundle.sh lit
# cette ligne pour construire le cockpit XR avec la meme version.
FROM node:22.23.3-alpine AS build
WORKDIR /app

# Dependances (cache Docker sur les lockfiles)
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build \
    && test -f dist/xr/index.html \
    && grep -q '/xr/assets/' dist/xr/index.html

# --- Etape 2 : service statique Nginx avec console et cockpit ---
FROM nginxinc/nginx-unprivileged:1.29-alpine AS production
COPY --chown=101:101 --from=build /app/dist /usr/share/nginx/html
COPY --chown=101:101 runtime-config.template.js /usr/share/nginx/html/runtime-config.template.js
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf
EXPOSE 3000
USER 101
CMD ["/bin/sh", "-c", "envsubst < /usr/share/nginx/html/runtime-config.template.js > /usr/share/nginx/html/runtime-config.js && exec nginx -g 'daemon off;'"]
