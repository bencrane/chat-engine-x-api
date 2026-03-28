# --- Build stage ---
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# --- Runtime stage ---
FROM node:20-slim AS runtime

WORKDIR /app

# Install Doppler CLI for runtime secrets injection
RUN apt-get update && apt-get install -y \
    apt-transport-https ca-certificates curl gnupg \
    && curl -sLf --retry 3 --tlsv1.2 --proto "=https" \
       'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | \
       gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" > \
       /etc/apt/sources.list.d/doppler-cli.list \
    && apt-get update && apt-get install -y doppler \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 8080

CMD ["doppler", "run", "--", "node", "dist/index.js"]
