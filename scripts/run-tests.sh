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

# Test sonuç dosyası
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_FILE="${PROJECT_ROOT}/test-results-${TIMESTAMP}.txt"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}NeuroPDF Test Runner${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Test sonuçları kaydedilecek: ${OUTPUT_FILE}"
echo ""

# Test modu seçimi
MODE="${1:-all}"
# İkinci parametre: dosyaya kaydetme (default: true)
SAVE_TO_FILE="${2:-true}"

# Backend testleri
run_backend_tests() {
    echo -e "${YELLOW}[1/3] Running Backend Tests...${NC}"
    
    if docker compose ps backend | grep -q "Up"; then
        if [ "$SAVE_TO_FILE" = "true" ]; then
            echo "=== Backend Tests ===" >> "$OUTPUT_FILE"
            docker compose exec backend pytest tests/ -v --cov=app --cov-report=term-missing --cov-report=html:htmlcov/backend 2>&1 | tee -a "$OUTPUT_FILE"
            BACKEND_EXIT=${PIPESTATUS[0]}
        else
            docker compose exec backend pytest tests/ -v --cov=app --cov-report=term-missing --cov-report=html:htmlcov/backend
            BACKEND_EXIT=$?
        fi
    else
        echo -e "${RED}Backend container is not running!${NC}"
        if [ "$SAVE_TO_FILE" = "true" ]; then
            echo "=== Backend Tests ===" >> "$OUTPUT_FILE"
            echo "ERROR: Backend container is not running!" >> "$OUTPUT_FILE"
        fi
        BACKEND_EXIT=1
    fi
    
    if [ "$SAVE_TO_FILE" = "true" ]; then
        echo "" >> "$OUTPUT_FILE"
    fi
    
    return $BACKEND_EXIT
}

# AI Service testleri
run_aiservice_tests() {
    echo -e "${YELLOW}[2/3] Running AI Service Tests...${NC}"
    
    if docker compose ps aiservice | grep -q "Up"; then
        if [ "$SAVE_TO_FILE" = "true" ]; then
            echo "=== AI Service Tests ===" >> "$OUTPUT_FILE"
            docker compose exec aiservice pytest tests/ -v --cov=app --cov-report=term-missing --cov-report=html:htmlcov/aiservice 2>&1 | tee -a "$OUTPUT_FILE"
            AISERVICE_EXIT=${PIPESTATUS[0]}
        else
            docker compose exec aiservice pytest tests/ -v --cov=app --cov-report=term-missing --cov-report=html:htmlcov/aiservice
            AISERVICE_EXIT=$?
        fi
    else
        echo -e "${RED}AI Service container is not running!${NC}"
        if [ "$SAVE_TO_FILE" = "true" ]; then
            echo "=== AI Service Tests ===" >> "$OUTPUT_FILE"
            echo "ERROR: AI Service container is not running!" >> "$OUTPUT_FILE"
        fi
        AISERVICE_EXIT=1
    fi
    
    if [ "$SAVE_TO_FILE" = "true" ]; then
        echo "" >> "$OUTPUT_FILE"
    fi
    
    return $AISERVICE_EXIT
}

# Frontend testleri
run_frontend_tests() {
    echo -e "${YELLOW}[3/3] Running Frontend Tests...${NC}"
    
    if docker compose ps frontend | grep -q "Up"; then
        # Frontend container'ında npm install çalıştır (bağımlılıklar eksikse)
        docker compose exec frontend sh -c "npm install 2>&1 | grep -v 'up to date' || true"
        
        if [ "$SAVE_TO_FILE" = "true" ]; then
            echo "=== Frontend Tests ===" >> "$OUTPUT_FILE"
            docker compose exec frontend npm test -- --run --coverage 2>&1 | tee -a "$OUTPUT_FILE"
            FRONTEND_EXIT=${PIPESTATUS[0]}
        else
            docker compose exec frontend npm test -- --run --coverage
            FRONTEND_EXIT=$?
        fi
    else
        echo -e "${RED}Frontend container is not running!${NC}"
        if [ "$SAVE_TO_FILE" = "true" ]; then
            echo "=== Frontend Tests ===" >> "$OUTPUT_FILE"
            echo "ERROR: Frontend container is not running!" >> "$OUTPUT_FILE"
        fi
        FRONTEND_EXIT=1
    fi
    
    if [ "$SAVE_TO_FILE" = "true" ]; then
        echo "" >> "$OUTPUT_FILE"
    fi
    
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
    
    if [ "$SAVE_TO_FILE" = "true" ]; then
        echo "========================================" >> "$OUTPUT_FILE"
        echo "Test Summary" >> "$OUTPUT_FILE"
        echo "========================================" >> "$OUTPUT_FILE"
        
        if [ $BACKEND_FAILED -eq 0 ]; then
            echo "Backend: PASSED" >> "$OUTPUT_FILE"
        else
            echo "Backend: FAILED" >> "$OUTPUT_FILE"
        fi
        
        if [ $AISERVICE_FAILED -eq 0 ]; then
            echo "AI Service: PASSED" >> "$OUTPUT_FILE"
        else
            echo "AI Service: FAILED" >> "$OUTPUT_FILE"
        fi
        
        if [ $FRONTEND_FAILED -eq 0 ]; then
            echo "Frontend: PASSED" >> "$OUTPUT_FILE"
        else
            echo "Frontend: FAILED" >> "$OUTPUT_FILE"
        fi
        
        echo "" >> "$OUTPUT_FILE"
        echo "Test sonuçları kaydedildi: $OUTPUT_FILE"
    fi
    
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
