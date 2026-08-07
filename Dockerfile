# Stage 1: build the static Next.js export
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: PocketBase serves the static export + the API — one process, one port
FROM alpine:3.20
ARG PB_VERSION=0.39.10
# TARGETARCH is set automatically by BuildKit (amd64, arm64, arm/v7, ...) —
# map it to PocketBase's release-asset naming so this image builds correctly
# on Raspberry Pi / other ARM hosts, not just amd64.
ARG TARGETARCH
ARG TARGETVARIANT
RUN case "${TARGETARCH}${TARGETVARIANT}" in \
      amd64)   PB_ARCH=amd64 ;; \
      arm64)   PB_ARCH=arm64 ;; \
      armv7)   PB_ARCH=armv7 ;; \
      *) echo "Unsupported TARGETARCH/TARGETVARIANT: ${TARGETARCH}/${TARGETVARIANT}" >&2; exit 1 ;; \
    esac \
  && apk add --no-cache ca-certificates unzip curl \
  && curl -Lo /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" \
  && unzip /tmp/pb.zip pocketbase -d /pb \
  && rm /tmp/pb.zip \
  && apk del unzip curl

WORKDIR /pb
COPY --from=builder /app/out ./pb_public
COPY pb_migrations ./pb_migrations

EXPOSE 8090
VOLUME /pb/pb_data
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
