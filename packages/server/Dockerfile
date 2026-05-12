# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace configuration
COPY package*.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy all packages (needed for internal dependencies)
COPY packages ./packages

# Install all dependencies and build
RUN pnpm install
RUN pnpm --filter @grat/server build

# Use pnpm deploy to isolate the server package for production
# This creates a standalone folder with only the server and its production deps
RUN pnpm --filter @grat/server --prod deploy /app/out

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -S nodegroup && adduser -S nodeuser -G nodegroup

# Copy the deployed files from the builder stage
# The 'out' folder contains the built server and its flat node_modules
COPY --from=builder /app/out ./

USER nodeuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["node", "dist/server.js"]
