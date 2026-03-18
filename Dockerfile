FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy manifests and install deps (cached layer)
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Install Playwright Chromium browser
RUN npx playwright install chromium

# Copy source and build
COPY . .
RUN pnpm build

# Persistent data volume mount point
RUN mkdir -p /data

EXPOSE 3037

ENV PERSIST=/data
ENV PORT=3037
ENV NODE_ENV=production

CMD ["node", "dist/cli.mjs", "serve"]
