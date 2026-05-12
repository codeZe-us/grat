FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

COPY package*.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages

RUN pnpm install
RUN pnpm --filter @grat/server build
RUN pnpm --filter @grat/server --prod deploy /app/out --legacy

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl
RUN addgroup -S nodegroup && adduser -S nodeuser -G nodegroup

COPY --from=builder /app/out ./

USER nodeuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["node", "dist/server.js"]
