#!/bin/bash

# NeuroPDF Test Runner Script
# Tüm testleri çalıştırır ve coverage raporu oluşturur

set -e

# Renkler
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Proje root dizini
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}NeuroPDF Test Runner${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Test modu seçimi
MODE="${1:-all}"

# Backend testleri
run_backend_tests() {
    echo -e "${YELLOW}[1/3] Running Backend Tests...${NC}"
    cd "$PROJECT_ROOT/backend"
    
    if [ -f "pytest.ini" ]; then
        pytest tests/ -v --cov=app --cov-report=term-missing --cov-report=html:htmlcov/backend
        BACKEND_EXIT=$?
    else
        echo -e "${RED}Backend pytest.ini not found!${NC}"
        BACKEND_EXIT=1
    fi
    
    cd "$PROJECT_ROOT"
    return $BACKEND_EXIT
}

# AI Service testleri
run_aiservice_tests() {
    echo -e "${YELLOW}[2/3] Running AI Service Tests...${NC}"
    cd "$PROJECT_ROOT/aiService"
    
    if [ -f "pytest.ini" ]; then
        pytest tests/ -v --cov=app --cov-report=term-missing --cov-report=html:htmlcov/aiservice
        AISERVICE_EXIT=$?
    else
        echo -e "${RED}AI Service pytest.ini not found!${NC}"
        AISERVICE_EXIT=1
    fi
    
    cd "$PROJECT_ROOT"
    return $AISERVICE_EXIT
}

# Frontend testleri
run_frontend_tests() {
    echo -e "${YELLOW}[3/3] Running Frontend Tests...${NC}"
    cd "$PROJECT_ROOT/frontend"
    
    if [ -f "package.json" ]; then
        npm test -- --run --coverage
        FRONTEND_EXIT=$?
    else
        echo -e "${RED}Frontend package.json not found!${NC}"
        FRONTEND_EXIT=1
    fi
    
    cd "$PROJECT_ROOT"
    return $FRONTEND_EXIT
}

# Tüm testleri çalıştır
run_all_tests() {
    BACKEND_FAILED=0
    AISERVICE_FAILED=0
    FRONTEND_FAILED=0
    
    if run_backend_tests; then
        echo -e "${GREEN}✓ Backend tests passed${NC}"
    else
        echo -e "${RED}✗ Backend tests failed${NC}"
        BACKEND_FAILED=1
    fi
    echo ""
    
    if run_aiservice_tests; then
        echo -e "${GREEN}✓ AI Service tests passed${NC}"
    else
        echo -e "${RED}✗ AI Service tests failed${NC}"
        AISERVICE_FAILED=1
    fi
    echo ""
    
    if run_frontend_tests; then
        echo -e "${GREEN}✓ Frontend tests passed${NC}"
    else
        echo -e "${RED}✗ Frontend tests failed${NC}"
        FRONTEND_FAILED=1
    fi
    echo ""
    
    # Özet
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Test Summary${NC}"
    echo -e "${GREEN}========================================${NC}"
    
    if [ $BACKEND_FAILED -eq 0 ]; then
        echo -e "${GREEN}Backend: PASSED${NC}"
    else
        echo -e "${RED}Backend: FAILED${NC}"
    fi
    
    if [ $AISERVICE_FAILED -eq 0 ]; then
        echo -e "${GREEN}AI Service: PASSED${NC}"
    else
        echo -e "${RED}AI Service: FAILED${NC}"
    fi
    
    if [ $FRONTEND_FAILED -eq 0 ]; then
        echo -e "${GREEN}Frontend: PASSED${NC}"
    else
        echo -e "${RED}Frontend: FAILED${NC}"
    fi
    
    TOTAL_FAILED=$((BACKEND_FAILED + AISERVICE_FAILED + FRONTEND_FAILED))
    
    if [ $TOTAL_FAILED -eq 0 ]; then
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed!${NC}"
        exit 1
    fi
}

# Moda göre çalıştır
case "$MODE" in
    backend)
        run_backend_tests
        ;;
    aiservice)
        run_aiservice_tests
        ;;
    frontend)
        run_frontend_tests
        ;;
    all|*)
        run_all_tests
        ;;
esac
