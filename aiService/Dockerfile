# Temiz bir Python 3.10 imajı ile başla
FROM python:3.13.2-slim

# Zemberek'in çalışması için Java (JRE) KURULUMU
RUN apt-get update \
    && apt-get install -y --no-install-recommends default-jre curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Çalışma dizinini ayarla
WORKDIR /app

# Önce bağımlılıkları kopyala ve kur (Docker katman önbelleğinden faydalanmak için)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Uygulamanın geri kalan kodunu kopyala
COPY . .

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]