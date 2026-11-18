# Build from the repo root, since the bundle needs frontend/src/shared:
#   docker build -f relay/Dockerfile -t caipers-cct-relay .
# Dockerfile.dockerignore (next to this file) limits the context to what the build needs

# --- build: install everything, bundle src/ + the shared envelope code into dist/server.js ---
FROM node:22-slim AS build
WORKDIR /repo/relay
COPY relay/package.json relay/package-lock.json ./
RUN npm ci
COPY relay/ ./
COPY frontend/src/shared/check.ts /repo/frontend/src/shared/check.ts
COPY frontend/src/shared/partner/relay.ts /repo/frontend/src/shared/partner/relay.ts
RUN npm run build

# --- runtime: the bundle plus production dependencies (just ws) ---
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY relay/package.json relay/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /repo/relay/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/server.js"]
