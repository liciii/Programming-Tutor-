# ── Stage 1: build the React client ──────────────────────────────────────────
FROM node:20-alpine AS client-builder

WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ── Stage 2: production server ────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install only production dependencies
COPY server/package*.json ./
RUN npm ci --omit=dev

# Copy server source
COPY server/ ./

# Copy built React app into server/public so Express can serve it
COPY --from=client-builder /app/client/dist ./public

# Persistent data lives in a volume mounted at runtime
VOLUME ["/app/data"]

EXPOSE 3001

CMD ["node", "index.js"]
