#!/bin/bash
# Frontend E2E testleri (Playwright) — yerel
# Ön koşul: Uygulama http://localhost:3000 adresinde çalışıyor olmalı (npm run dev)
# Kullanım: ./scripts/test-frontend-e2e.sh [playwright-opsiyonel-argümanlar]

set -e
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT/frontend"

echo -e "${YELLOW}[Frontend E2E] npm run test:e2e $*${NC}"
npm run test:e2e -- "$@"
echo -e "${GREEN}✓ Frontend E2E tests done${NC}"
