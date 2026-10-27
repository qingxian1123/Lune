# syntax=docker/dockerfile:1
# Node 24 LTS; keep this digest reviewed when upgrading the base image.
ARG NODE_IMAGE=node@sha256:ec857ea6bb60cb3d0fa4d97495590c5fe7d51be8572c307b55957eeb06569cf7

FROM ${NODE_IMAGE} AS build
WORKDIR /build
RUN npm install --global pnpm@9.15.9
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/shared/package.json apps/shared/tsconfig.json ./apps/shared/
COPY apps/shared/src ./apps/shared/src
COPY server/package.json server/tsconfig.json ./server/
COPY server/src ./server/src
RUN pnpm install --frozen-lockfile --filter @lune/server...
RUN pnpm -r --filter @lune/server... run build

FROM ${NODE_IMAGE} AS production-dependencies
WORKDIR /opt/lune
COPY server-deploy/package.json server-deploy/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
LABEL org.lune.data-schema="1" \
      org.lune.provider-config-schema="1" \
      org.opencontainers.image.source="https://github.com/qingxian1123/Lune"
ENV NODE_ENV=production \
    NODE_OPTIONS=--dns-result-order=ipv4first \
    PORT=9527 \
    HOST=0.0.0.0 \
    LUNE_CONFIG_FILE=/var/lib/lune/config/providers.json \
    LUNE_DATA_DIR=/var/lib/lune/data
WORKDIR /opt/lune
COPY --from=production-dependencies --chown=10001:10001 /opt/lune/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /build/server/dist ./dist
COPY --chown=10001:10001 server/package.json ./package.json
COPY --chown=10001:10001 server/admin-public/dashboard.html ./admin-public/dashboard.html
USER 10001:10001
EXPOSE 9527 9528
STOPSIGNAL SIGTERM
CMD ["node", "dist/main.js"]
