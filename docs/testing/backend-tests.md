# Backend Test Mimarisi

Bu dizin NeuroPDF backend için kapsamlı test mimarisini içerir.

## Klasör Yapısı

```
tests/
├── conftest.py              # Global fixtures ve test DB konfigürasyonu
├── unit/                    # Birim testleri (mock'lanmış bağımlılıklar)
│   ├── test_auth_service.py
│   ├── test_avatar_service.py
│   ├── test_storage_service.py
│   └── test_security.py
├── integration/             # Veritabanı entegrasyon testleri
│   ├── test_db_models.py
│   ├── test_user_operations.py
│   ├── test_pdf_operations.py
│   └── test_guest_session.py
└── api/                     # API endpoint testleri
    ├── test_auth_endpoints.py
    ├── test_files_endpoints.py
    ├── test_guest_endpoints.py
    └── test_user_avatar_endpoints.py
```

## Test Kategorileri

### Unit Tests (`tests/unit/`)
- Veritabanı ve dış servisler mock'lanır
- Hızlı çalışır, izole edilmiş testler
- İş mantığı fonksiyonlarını test eder
- Marker: `@pytest.mark.unit`

### Integration Tests (`tests/integration/`)
- Gerçek test veritabanı kullanır
- CRUD operasyonlarını test eder
- Model ilişkilerini ve foreign key constraint'lerini test eder
- Marker: `@pytest.mark.integration`

### API Tests (`tests/api/`)
- FastAPI TestClient kullanır
- HTTP endpoint'lerini test eder
- Status kodları ve JSON formatlarını doğrular
- Marker: `@pytest.mark.api`

## Test Veritabanı Kurulumu

1. **Test veritabanı oluşturma:**
   ```bash
   createdb test_db
   ```

2. **Environment variables:**
   Test DB için environment variable'ları ayarlayın:
   ```bash
   export TEST_DB_NAME=test_db
   export TEST_DB_HOST=localhost
   export TEST_DB_PORT=5432
   export TEST_DB_USER=postgres
   export TEST_DB_PASSWORD=your_password
   export TEST_DB_SSLMODE=disable
   ```

   Veya `.env.test` dosyası oluşturun (`.env.test.example` dosyasını referans alın).

3. **Alembic migrations:**
   Test DB'ye migration'lar otomatik olarak uygulanır (`conftest.py` içinde).

## Test Çalıştırma

### Tüm testleri çalıştır:
```bash
pytest
```

### Belirli kategorideki testleri çalıştır:
```bash
# Sadece unit testler
pytest -m unit

# Sadece integration testler
pytest -m integration

# Sadece API testler
pytest -m api
```

### Coverage raporu ile:
```bash
pytest --cov=app --cov-report=html
```

### Belirli bir test dosyası:
```bash
pytest tests/unit/test_auth_service.py
```

## Fixtures

`conftest.py` içinde tanımlı önemli fixtures:

- `test_db_engine`: Test veritabanı engine'i (session-scoped)
- `test_db_session`: Test veritabanı session'ı (function-scoped, rollback ile)
- `clean_db`: Her test öncesi DB temizleme
- `test_supabase_client`: Mock Supabase client
- `test_client`: FastAPI TestClient
- `test_user`: Test kullanıcısı oluşturma
- `test_user_with_auth`: Auth bilgileri ile test kullanıcısı
- `auth_headers`: JWT token ile authorization headers
- `sample_pdf_content`: Örnek PDF içeriği
- `sample_pdf_file`: Mock PDF dosyası

## Helper Fonksiyonlar

`conftest.py` içinde tanımlı helper fonksiyonlar:

- `create_test_pdf(db, user_id, filename, pdf_data)`: Test PDF kaydı oluşturma

## Test Yazma Kuralları

1. **Her test bağımsız olmalı**: Testler birbirine bağımlı olmamalı
2. **Cleanup**: Her test sonrası veritabanı temizlenmeli (fixtures otomatik yapar)
3. **Mock kullanımı**: Unit testlerde dış bağımlılıklar mock'lanmalı
4. **Gerçek DB**: Integration testlerde gerçek test DB kullanılmalı
5. **Markers**: Test kategorilerini belirtmek için marker'lar kullanılmalı

## Örnek Test Yazma

### Unit Test Örneği:
```python
@pytest.mark.unit
class TestMyService:
    @patch('app.services.my_service.external_api')
    def test_my_function(self, mock_api):
        mock_api.return_value = {"result": "success"}
        result = my_function()
        assert result == "success"
```

### Integration Test Örneği:
```python
@pytest.mark.integration
class TestMyModel:
    def test_create_model(self, test_db_session, clean_db):
        model = MyModel(name="test")
        test_db_session.add(model)
        test_db_session.commit()
        assert model.id is not None
```

### API Test Örneği:
```python
@pytest.mark.api
class TestMyEndpoint:
    def test_get_endpoint(self, test_client, auth_headers):
        response = test_client.get("/api/my-endpoint", headers=auth_headers)
        assert response.status_code == 200
        assert "data" in response.json()
```

## Notlar

- Test veritabanı her test öncesi temizlenir (truncate veya rollback)
- Alembic migration'lar test başlangıcında otomatik uygulanır
- Test DB için ayrı bir PostgreSQL veritabanı kullanılır
- Supabase client API testlerinde mock'lanır
