# ==============================================================================
# Multi-Stage Dockerfile for Kinship (x86_64 & ARM64 compatible)
# ==============================================================================
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++ vips-dev

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Production Runtime ---
FROM node:22-alpine AS runner
WORKDIR /app

# Install ffmpeg for video transcoding/HLS, vips for sharp, and postgresql-client for Admin backups
RUN apk add --no-cache ffmpeg vips postgresql16-client tzdata wget

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts

RUN mkdir -p /data/media/originals /data/media/display /data/media/thumbs /data/media/hls /data/media/chunks /data/backups \
    && chown -R node:node /app /data

USER node
EXPOSE 3000

CMD ["node", "server.js"]
