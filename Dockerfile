# Builds the web app once, then runs the server with only the runtime dependencies.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
# No port is set here, so a PINION_PORT or old OPENCHAT_PORT given to the container is the one used (default 3000).
ENV NODE_ENV=production \
    PINION_HOST=0.0.0.0
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# tsconfig.json tells tsx how to compile the server's JSX.
COPY package.json tsconfig.json ./
COPY server/src ./server/src
COPY shared ./shared
RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME /app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PINION_PORT ?? process.env.OPENCHAT_PORT ?? 3000) + '/api/settings').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "--import", "tsx", "server/src/index.ts"]
