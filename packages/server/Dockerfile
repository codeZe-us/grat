# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace files
COPY package*.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./

# Copy package files
COPY packages/server/package*.json ./packages/server/
COPY packages/sdk/package*.json ./packages/sdk/

# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install

# Copy source code
COPY packages/server ./packages/server
COPY packages/sdk ./packages/sdk
COPY tsconfig.base.json ./

# Build the packages
RUN pnpm --filter @grat/server build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -S nodegroup && adduser -S nodeuser -G nodegroup

# Copy production dependencies from builder or install them
# For simplicity in this monorepo, we'll just copy the built dist and node_modules
COPY --from=builder /app/packages/server/dist ./dist
COPY --from=builder /app/packages/server/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

USER nodeuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["node", "dist/server.js"]
