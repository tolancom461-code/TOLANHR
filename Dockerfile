# Stable GitHub -> Railway deployment for the CEO-report Puppeteer PDF exporter.
FROM node:22-bookworm-slim

# Install Chromium/Chrome runtime libraries and fonts (including Arabic glyphs).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fontconfig fonts-liberation fonts-noto-core \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 \
    libcairo2 libcups2 libdbus-1-3 libdrm2 libexpat1 \
    libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 \
    libpango-1.0-0 libx11-6 libx11-xcb1 libxcb1 \
    libxcomposite1 libxdamage1 libxext6 libxfixes3 \
    libxkbcommon0 libxrandr2 libxrender1 libxshmfence1 libxss1 \
    libxtst6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Puppeteer's browser binary must be inside the deployed image, not /root/.cache.
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Match the package manager version declared in package.json.
RUN npm install --global pnpm@10.4.1

# The wouter patch is needed by pnpm's frozen lockfile install.
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile

COPY . .

# Explicit browser installation works even when package postinstall scripts are skipped.
RUN pnpm exec puppeteer browsers install chrome \
    && node -e "const fs=require('node:fs'); const p=require('puppeteer'); const c=p.executablePath(); if (!fs.existsSync(c)) { throw new Error('Chrome missing: '+c); } console.log('Puppeteer Chrome installed at:', c);" \
    && pnpm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
