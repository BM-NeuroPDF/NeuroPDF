# pdf_project_monorepo/frontend/Dockerfile
# 
# Bu, Geliştirme (Development) için optimize edilmiş bir Dockerfile'dır.

# 1. Temel imaj olarak Node.js 18 (veya projenizin sürümü) kullanın
FROM node:22.14-alpine

# 2. Playwright için gerekli sistem bağımlılıklarını yükle
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    libx11 \
    libxcomposite \
    libxdamage \
    libxext \
    libxfixes \
    libxrandr \
    libxrender \
    libxss \
    libxtst \
    gtk+3.0 \
    dbus \
    glib \
    atk \
    at-spi2-atk \
    cups-libs \
    libdrm \
    libxkbcommon \
    libxshmfence \
    mesa \
    || true

# 3. Çalışma dizinini /app olarak ayarla
WORKDIR /app

# 4. Bağımlılıkları kur
# Sadece package.json'ı kopyala ki her kod değişiminde npm install tekrar çalışmasın
COPY package.json package-lock.json* ./
RUN npm install

# 5. Playwright browser'larını yükle
RUN npx playwright install chromium firefox webkit || true

# 4. Kodun geri kalanını kopyala
# (Bu, docker-compose'daki volume ile üzerine yazılacak,
#  ancak ilk kurulum için iyidir)
COPY . .

# 5. Next.js portunu (3000) dışarı aç
EXPOSE 3000

# 6. Geliştirme sunucusunu çalıştır
CMD ["npm", "run", "dev"]