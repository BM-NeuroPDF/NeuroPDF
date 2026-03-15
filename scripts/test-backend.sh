#!/bin/bash
# Backend testleri (yerel — Docker gerekmez)
# Kullanım: ./scripts/test-backend.sh [pytest-opsiyonel-argümanlar]

set -e
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT/backend"

echo -e "${YELLOW}[Backend] pytest tests/ -v --cov=app --cov-report=term-missing${NC}"
pytest tests/ -v --cov=app --cov-report=term-missing "$@"
echo -e "${GREEN}✓ Backend tests done${NC}"
