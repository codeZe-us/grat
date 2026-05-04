# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy root lockfiles if using workspace, but let's assume standalone for the package build
# Actually, since it's a monorepo, we might need the workspace context.
# But usually we can build the package in isolation if dependencies are handled.
# I'll stick to a standard multi-stage build.

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -S nodegroup && adduser -S nodeuser -G nodegroup

COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules

USER nodeuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["node", "dist/server.js"]
