# syntax=docker/dockerfile:1

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV DOCKER=1
ENV PORT=3000
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# `playwright` (devDependency) is only needed here, transiently, to run its
# install CLI: pulls Chromium's OS-level libs via apt and downloads the
# browser binary into PLAYWRIGHT_BROWSERS_PATH. The actual runtime deps
# come from the Next.js standalone output copied below, so node_modules
# from this step is discarded afterwards.
COPY package.json package-lock.json ./
RUN npm ci && \
    npx playwright install --with-deps chromium && \
    rm -rf node_modules && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

RUN chown -R node:node /ms-playwright /app
USER node
EXPOSE 3000
CMD ["node", "server.js"]
