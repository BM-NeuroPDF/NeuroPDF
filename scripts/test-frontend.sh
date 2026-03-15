#!/bin/bash
# Frontend Vitest testleri (yerel — Docker gerekmez)
# Kullanım: ./scripts/test-frontend.sh

set -e
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT/frontend"

echo -e "${YELLOW}[Frontend] npm test -- --run --coverage${NC}"
npm test -- --run --coverage
echo -e "${GREEN}✓ Frontend (Vitest) tests done${NC}"
