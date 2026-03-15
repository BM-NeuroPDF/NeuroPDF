#!/bin/bash
# Tüm testleri yerel ortamda çalıştırır (Backend + AI Service + Frontend Vitest).
# Docker kullanmaz; backend ve aiService için Python venv, frontend için npm gerekir.
# E2E (Playwright) dahil değildir — ayrıca scripts/test-frontend-e2e.sh kullanın.

set -e
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

RUN_E2E="${1:-}"
# Örnek: ./scripts/test-all-local.sh e2e  → E2E de çalıştır (uygulama 3000'de olmalı)

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}NeuroPDF — Tüm testler (yerel)${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

FAILED=0

echo -e "${YELLOW}[1/3] Backend${NC}"
if "$PROJECT_ROOT/scripts/test-backend.sh"; then
  echo -e "${GREEN}✓ Backend passed${NC}"
else
  echo -e "${RED}✗ Backend failed${NC}"
  FAILED=1
fi
echo ""

echo -e "${YELLOW}[2/3] AI Service${NC}"
if "$PROJECT_ROOT/scripts/test-aiservice.sh"; then
  echo -e "${GREEN}✓ AI Service passed${NC}"
else
  echo -e "${RED}✗ AI Service failed${NC}"
  FAILED=1
fi
echo ""

echo -e "${YELLOW}[3/3] Frontend (Vitest)${NC}"
if "$PROJECT_ROOT/scripts/test-frontend.sh"; then
  echo -e "${GREEN}✓ Frontend passed${NC}"
else
  echo -e "${RED}✗ Frontend failed${NC}"
  FAILED=1
fi
echo ""

if [ "$RUN_E2E" = "e2e" ]; then
  echo -e "${YELLOW}[E2E] Frontend Playwright (uygulama localhost:3000'de çalışıyor olmalı)${NC}"
  if "$PROJECT_ROOT/scripts/test-frontend-e2e.sh"; then
    echo -e "${GREEN}✓ E2E passed${NC}"
  else
    echo -e "${RED}✗ E2E failed${NC}"
    FAILED=1
  fi
  echo ""
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Özet${NC}"
echo -e "${GREEN}========================================${NC}"
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}Tüm testler geçti.${NC}"
  exit 0
else
  echo -e "${RED}Bazı testler başarısız.${NC}"
  exit 1
fi
