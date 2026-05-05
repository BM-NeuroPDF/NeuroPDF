PYTEST_BACKEND = cd backend && python -m pytest

.PHONY: test-unit test-integration test-all

test-unit:
	$(PYTEST_BACKEND) -m "unit and not integration" tests/ --tb=no -q

test-integration:
	docker compose up -d db
	cd backend && TEST_DATABASE_URL=postgresql+psycopg2://myuser:mypassword@localhost:5432/neuropdf_local?sslmode=disable \
		python -m pytest -m integration tests/ --tb=no -q

test-all: test-unit test-integration
