FROM node:22.22.3-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/webgl-image/package.json ./packages/webgl-image/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=deps /usr/src/app/packages/webgl-image/node_modules ./packages/webgl-image/node_modules
COPY . .
RUN NODE_OPTIONS="--max-old-space-size=4096" pnpm run build:deps
RUN NODE_OPTIONS="--max-old-space-size=8192" pnpm run build
RUN find ./.output -type f -name '*.map' -delete

FROM node:22.22.3-alpine AS runtime_deps
RUN apk add --no-cache ca-certificates perl exiftool ffmpeg \
	&& install -Dm755 "$(readlink -f /usr/bin/perl)" /opt/runtime-bin/perl \
	&& install -Dm755 "$(readlink -f /usr/bin/env)" /opt/runtime-bin/env \
	&& install -Dm755 "$(readlink -f /usr/bin/exiftool)" /opt/runtime-bin/exiftool \
	&& install -Dm755 "$(readlink -f /usr/bin/ffmpeg)" /opt/runtime-bin/ffmpeg \
	&& install -Dm755 "$(readlink -f /usr/bin/ffprobe)" /opt/runtime-bin/ffprobe \
	&& mkdir -p /opt/runtime-bin/appdirs/photos /opt/runtime-bin/appdirs/videos /opt/runtime-bin/appdirs/data

FROM scratch AS runtime
WORKDIR /app

# 预创建只读映射目录与可写数据目录（scratch 阶段无 shell，通过 COPY 空目录实现）
COPY --from=runtime_deps /opt/runtime-bin/appdirs/photos /app/photos
COPY --from=runtime_deps /opt/runtime-bin/appdirs/videos /app/videos
COPY --from=runtime_deps /opt/runtime-bin/appdirs/data /app/data

COPY --from=runtime_deps /usr/local/bin/node /usr/bin/node
COPY --from=runtime_deps /opt/runtime-bin/perl /usr/bin/perl
COPY --from=runtime_deps /opt/runtime-bin/env /usr/bin/env
COPY --from=runtime_deps /opt/runtime-bin/exiftool /usr/bin/exiftool
COPY --from=runtime_deps /usr/lib /usr/lib
COPY --from=runtime_deps /usr/share /usr/share
COPY --from=runtime_deps /lib /lib
COPY --from=runtime_deps /etc/ssl /etc/ssl

COPY --from=build /usr/src/app/.output ./.output
COPY --from=build /usr/src/app/server/database/migrations ./server/database/migrations

EXPOSE 3000
# 单目录数据卷：SQLite 数据库 + 照片原图 + 缩略图
VOLUME ["/app/data"]
# 只读映射目录：用户把照片/视频直接放进这些目录即被自动识别
# 在 docker-compose.yml 或运行时用 -v /data/photos:/app/photos:ro -v /data/videos:/app/videos:ro 挂载

ENV NODE_ENV=production
ENV NITRO_PORT=3000
ENV NITRO_HOST=0.0.0.0
ENV DATABASE_URL=./data/app.sqlite3
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
ENV EXIFTOOL_PATH=/usr/bin/exiftool
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe

CMD ["/usr/bin/node", ".output/server/index.mjs"]
