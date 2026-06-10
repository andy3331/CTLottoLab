FROM node:22-bookworm-slim AS base

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json

RUN npm install

COPY . .

FROM base AS client-dev

CMD ["npm", "run", "dev", "--workspace", "client", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM base AS api-dev

ENV PORT=4000
ENV NODE_ENV=development
ENV DATABASE_PATH=/data/lottolens.db

CMD ["npm", "run", "dev", "--workspace", "server"]

FROM base AS build

RUN npm run build

FROM node:22-bookworm-slim AS api-prod

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json

RUN npm install --omit=dev

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/shared ./shared

ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_PATH=/data/lottolens.db

EXPOSE 4000

CMD ["node", "server/dist/server/src/index.js"]

FROM nginx:1.27-alpine AS web-prod

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 80
