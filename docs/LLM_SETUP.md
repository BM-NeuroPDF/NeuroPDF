# LLM kurulumu: bulut ve yerel (Ollama)

NeuroPDF `aiService` katmanı üretimde en az bir çalışır LLM kaynağı ister: **Google Gemini (bulut)** veya **OpenAI uyumlu yerel uç** (genelde Ollama’nın `/v1` API’si). Davranış ve doğrulama `aiService/app/config.py` içindeki `Settings` ile yapılır.

## Hızlı karşılaştırma

| | Bulut (Gemini) | Yerel (Ollama) |
|---|----------------|----------------|
| Ana değişken | `GEMINI_API_KEY` | `LOCAL_LLM_URL` (örn. `http://ollama:11434/v1`) ve/veya `OLLAMA_HOST` + `OLLAMA_MODEL` |
| Ağ | Google API’ye çıkış gerekir | Ollama’nın erişilebilir olduğu host yeterli |
| Üretim kontrolü | Anahtar dolu ise yeterli | `LOCAL_LLM_URL` dolu ise Gemini zorunlu değil |

## `LLM_PROVIDER` (`.env.example`)

`LLM_PROVIDER=cloud` veya `local` değeri **yalnızca işletim/dokümantasyon** içindir: kod bu anahtarı okumaz. Hangi modda çalıştığınızı `.env` ve runbook’ta net göstermek için kullanın. Gerçek yönlendirme `GEMINI_API_KEY` ve `LOCAL_LLM_URL` ile belirlenir.

## Bulut (OpenAI / Gemini)

Bu repoda birincil bulut yolu **Gemini** (`GEMINI_API_KEY`) üzerindedir. Üretim ortamında:

1. Geçerli bir Gemini API anahtarı ayarlayın.
2. Yerel modele ihtiyaç yoksa `LOCAL_LLM_URL` boş bırakılabilir (üretim doğrulaması anahtar ile geçer).

OpenAI uyumlu HTTP çağrıları için ayrıca `OPENAI_API_KEY` ve yerel uç URL’si kullanılabilir; ayrıntılar için `aiService/.env.example` ve `local_llm_service` kod yolu.

## Yerel (Ollama)

İki yaygın yapı:

### A) OpenAI uyumlu taban (`LOCAL_LLM_URL`)

Ollama’yı OpenAI uyumlu API ile kullanın:

- Örnek URL: `http://localhost:11434/v1` (geliştirme) veya Docker ağında `http://ollama:11434/v1`.
- Üretimde `LOCAL_LLM_URL` dolu ise `config.py` üretim kontrolü Gemini olmadan da tamamlanır.

### B) Doğrudan Ollama istemcisi (`OLLAMA_HOST`, `OLLAMA_MODEL`)

`LOCAL_LLM_URL` boşken veya ek olarak kod `ollama.Client(host=OLLAMA_HOST)` yolunu kullanabilir:

- **`OLLAMA_HOST`**: API kökü, `/v1` **eklemeyin** (örn. `http://localhost:11434`, Docker içi `http://ollama:11434`).
- **`OLLAMA_MODEL`**: Kullanılacak model adı (örn. `phi3:mini`).

Docker Compose prod yığınında varsayılan olarak ayrı bir Ollama servisi tanımlı değildir; yerel LLM kullanacaksanız **`OLLAMA_HOST=http://ollama:11434`** (veya seçtiğiniz servis adı) ile uyumlu bir Ollama konteynerı/servisi eklemeniz gerekir. İlgili not `docker-compose.prod.yml` içindeki `aiservice` üstündeki yorumda yer alır.

## Ortak notlar

- **Redis**: Celery ve kuyruk için `REDIS_URL` gereklidir (`aiService/.env.example`).
- **Güvenlik**: `AI_SERVICE_API_KEY`, `CALLBACK_SECRET` üretimde zorunlu tutulmalıdır (`config.py`).
- **Örnek değişken listesi**: `aiService/.env.example`.
