# AI Service

NeuroPDF **AI Service**, PDF odaklı sohbet ve analiz için **FastAPI** tabanlı bir mikro servistir. Backend ile ayrı süreçte çalışır; LLM çağrıları, yapılandırılmış araç döngüsü ve isteğe bağlı arka plan işleri burada toplanır.

## LLM entegrasyonu

- **Bulut:** Google **Gemini** (ör. `flash` / `pro` modları) üzerinden metin üretimi ve analiz.
- **Yerel:** **Ollama** ile uyumlu yerel modeller; ağ gecikmesi ve maliyet profiline göre seçilebilir.
- Yönlendirme ve görev dağılımı `app/services/llm_manager.py` ve ilgili servis katmanlarında yapılır; sağlayıcı seçimi API ve yapılandırma ile kontrol edilir.

## Prompt mühendisliği (prompt engineering)

- Sistem ve kullanıcı talimatları **prompt builder** ve araç özel şablonları ile birleştirilir (`app/core/tools/prompt_builder.py` ve araç modülleri).
- Ajan döngüsü (`agent_loop`), model çıktısından `<tool_call>` benzeri yapıları ayrıştırarak **deterministik araç yürütmesi** ile birleştirir; böylece “serbest metin” ile “eylem” ayrımı korunur.
- Özet, çeviri, çıkarma gibi görevlerde bağlam uzunluğu ve güvenlik sınırları kodda tanımlıdır.

## RAG mimarisi (özet)

- **ChromaDB** ile vektör depolama; PDF/metin parçaları gömülür (embedding) ve benzerlik araması ile **Retrieval-Augmented Generation** akışına beslenir (`app/services/rag_service.py`).
- Test ve çevrimdışı senaryolar için **deterministik embedding** seçenekleri mevcuttur (API maliyeti olmadan tekrarlanabilir testler).
- Üretimde kullanılan embedding stratejisi yapılandırmaya bağlıdır; ayrıntılar için kod ve `requirements.txt` içindeki bağımlılıklara bakın.

## Çalıştırma ve test

```bash
cd aiService
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

Arka plan işleri: `celery` worker (`app/tasks/`). Kök [README.md](../README.md) ve [docs/architecture/ARCHITECTURE.md](../docs/architecture/ARCHITECTURE.md) dosyalarında tam yığın anlatımı bulunur.
