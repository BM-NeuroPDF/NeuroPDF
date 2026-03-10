#!/bin/bash

# NeuroPDF Test Report Generator
# Tüm testleri çalıştırır ve kapsamlı coverage raporu oluşturur

set -e

# Renkler
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Proje root dizini
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

REPORT_DIR="$PROJECT_ROOT/test-reports"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_FILE="$REPORT_DIR/test_report_$TIMESTAMP.txt"

# Rapor dizinini oluştur
mkdir -p "$REPORT_DIR"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}NeuroPDF Test Report Generator${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Rapor başlığı
{
    echo "=========================================="
    echo "NeuroPDF Test Report"
    echo "Generated: $(date)"
    echo "=========================================="
    echo ""
} > "$REPORT_FILE"

# Backend testleri ve coverage
echo -e "${YELLOW}[1/3] Running Backend Tests with Coverage...${NC}"
cd "$PROJECT_ROOT/backend"

if [ -f "pytest.ini" ]; then
    {
        echo "=== Backend Tests ==="
        echo ""
    } >> "$REPORT_FILE"
    
    pytest tests/ -v --cov=app --cov-report=term-missing --cov-report=html:htmlcov/backend --cov-report=json:coverage_backend.json 2>&1 | tee -a "$REPORT_FILE"
    BACKEND_EXIT=$?
    
    if [ $BACKEND_EXIT -eq 0 ]; then
        echo -e "${GREEN}✓ Backend tests passed${NC}"
    else
        echo -e "${RED}✗ Backend tests failed${NC}"
    fi
else
    echo -e "${RED}Backend pytest.ini not found!${NC}"
    BACKEND_EXIT=1
fi

cd "$PROJECT_ROOT"
echo "" >> "$REPORT_FILE"

# AI Service testleri ve coverage
echo -e "${YELLOW}[2/3] Running AI Service Tests with Coverage...${NC}"
cd "$PROJECT_ROOT/aiService"

if [ -f "pytest.ini" ]; then
    {
        echo "=== AI Service Tests ==="
        echo ""
    } >> "$REPORT_FILE"
    
    pytest tests/ -v --cov=app --cov-report=term-missing --cov-report=html:htmlcov/aiservice --cov-report=json:coverage_aiservice.json 2>&1 | tee -a "$REPORT_FILE"
    AISERVICE_EXIT=$?
    
    if [ $AISERVICE_EXIT -eq 0 ]; then
        echo -e "${GREEN}✓ AI Service tests passed${NC}"
    else
        echo -e "${RED}✗ AI Service tests failed${NC}"
    fi
else
    echo -e "${RED}AI Service pytest.ini not found!${NC}"
    AISERVICE_EXIT=1
fi

cd "$PROJECT_ROOT"
echo "" >> "$REPORT_FILE"

# Frontend testleri ve coverage
echo -e "${YELLOW}[3/3] Running Frontend Tests with Coverage...${NC}"
cd "$PROJECT_ROOT/frontend"

if [ -f "package.json" ]; then
    {
        echo "=== Frontend Tests ==="
        echo ""
    } >> "$REPORT_FILE"
    
    npm test -- --run --coverage 2>&1 | tee -a "$REPORT_FILE"
    FRONTEND_EXIT=$?
    
    if [ $FRONTEND_EXIT -eq 0 ]; then
        echo -e "${GREEN}✓ Frontend tests passed${NC}"
    else
        echo -e "${RED}✗ Frontend tests failed${NC}"
    fi
else
    echo -e "${RED}Frontend package.json not found!${NC}"
    FRONTEND_EXIT=1
fi

cd "$PROJECT_ROOT"
echo "" >> "$REPORT_FILE"

# Özet
{
    echo "=========================================="
    echo "Test Summary"
    echo "=========================================="
    echo ""
    
    if [ $BACKEND_EXIT -eq 0 ]; then
        echo "Backend: PASSED"
    else
        echo "Backend: FAILED"
    fi
    
    if [ $AISERVICE_EXIT -eq 0 ]; then
        echo "AI Service: PASSED"
    else
        echo "AI Service: FAILED"
    fi
    
    if [ $FRONTEND_EXIT -eq 0 ]; then
        echo "Frontend: PASSED"
    else
        echo "Frontend: FAILED"
    fi
    
    echo ""
    echo "Coverage Reports:"
    echo "  - Backend: backend/htmlcov/index.html"
    echo "  - AI Service: aiService/htmlcov/index.html"
    echo "  - Frontend: frontend/coverage/index.html"
    echo ""
    echo "Full Report: $REPORT_FILE"
    echo "=========================================="
} >> "$REPORT_FILE"

# Konsol özeti
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"

if [ $BACKEND_EXIT -eq 0 ]; then
    echo -e "${GREEN}Backend: PASSED${NC}"
else
    echo -e "${RED}Backend: FAILED${NC}"
fi

if [ $AISERVICE_EXIT -eq 0 ]; then
    echo -e "${GREEN}AI Service: PASSED${NC}"
else
    echo -e "${RED}AI Service: FAILED${NC}"
fi

if [ $FRONTEND_EXIT -eq 0 ]; then
    echo -e "${GREEN}Frontend: PASSED${NC}"
else
    echo -e "${RED}Frontend: FAILED${NC}"
fi

echo ""
echo -e "${BLUE}Coverage Reports:${NC}"
echo -e "  - Backend: ${GREEN}backend/htmlcov/index.html${NC}"
echo -e "  - AI Service: ${GREEN}aiService/htmlcov/index.html${NC}"
echo -e "  - Frontend: ${GREEN}frontend/coverage/index.html${NC}"
echo ""
echo -e "${BLUE}Full Report: ${GREEN}$REPORT_FILE${NC}"

TOTAL_FAILED=$((BACKEND_EXIT + AISERVICE_EXIT + FRONTEND_EXIT))

if [ $TOTAL_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
