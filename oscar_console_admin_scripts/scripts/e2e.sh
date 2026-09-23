#!/usr/bin/env bash
# E2E Playwright portable : démarre le backend (SQLite, sans Postgres requis),
# build + prévisualise le front, attend la disponibilité, joue les scénarios, nettoie.
set -euo pipefail

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
BACK="$PROJECT/Backend"
FRONT="$PROJECT/Admin-Console-Front-end"

export DATABASE_URL="sqlite:///$BACK/e2e_oscar.db"
export CORS_ORIGINS="http://127.0.0.1:4173,http://localhost:4173"
export SECRET_KEY="e2e-secret-key-0123456789abcdef0123456789xyz"
export ADMIN_EMAIL="admin@oscar.fr"
export ADMIN_PASSWORD="oscar-admin"
export LIVEKIT_API_KEY="oscar_prod_key"
export LIVEKIT_API_SECRET="oscar_super_secret_prod_key"
# Pas de serveur LiveKit en E2E : on pointe vers un port fermé pour un echec immediat
# (evite la lenteur de resolution DNS d'un hote docker inexistant en local).
export LIVEKIT_HOST_URL="http://127.0.0.1:9"
export MODEL_STORAGE_DIR="$BACK/e2e_storage"
rm -f "$BACK/e2e_oscar.db"

# --- Backend ---
cd "$BACK"
. .venv/bin/activate
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 >/tmp/e2e-backend.log 2>&1 &
BACK_PID=$!

# --- Front (VITE_API_URL figé au build) ---
cd "$FRONT"
export VITE_API_URL="http://127.0.0.1:8000/api"
npm run build >/tmp/e2e-build.log 2>&1
npx vite preview --host 127.0.0.1 --port 4173 >/tmp/e2e-front.log 2>&1 &
FRONT_PID=$!

cleanup() { kill "$BACK_PID" "$FRONT_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "⏳ attente backend..."
for _ in $(seq 1 60); do curl -sf http://127.0.0.1:8000/health >/dev/null 2>&1 && break || sleep 0.5; done
echo "⏳ attente front..."
for _ in $(seq 1 60); do curl -sf http://127.0.0.1:4173 >/dev/null 2>&1 && break || sleep 0.5; done

export E2E_BASE_URL="http://127.0.0.1:4173"
echo "▶️  Playwright..."
npx playwright test "$@"
