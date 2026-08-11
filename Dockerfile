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
# Detect the architecture from `uname -m` inside this stage rather than
# relying on Docker's TARGETARCH build arg — that arg is only auto-populated
# by BuildKit, and plain `docker build` on older Docker (e.g. Docker 20.10,
# the default on Raspberry Pi OS) uses the legacy builder, which leaves it
# empty. `uname -m` works the same either way, since this is always a
# same-architecture (non-cross-compiling) build.
RUN case "$(uname -m)" in \
      x86_64)  PB_ARCH=amd64 ;; \
      aarch64) PB_ARCH=arm64 ;; \
      armv7l)  PB_ARCH=armv7 ;; \
      *) echo "Unsupported uname -m: $(uname -m)" >&2; exit 1 ;; \
    esac \
  && apk add --no-cache ca-certificates tzdata unzip curl \
  && curl -Lo /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" \
  && unzip /tmp/pb.zip pocketbase -d /pb \
  && rm /tmp/pb.zip \
  && apk del unzip curl

WORKDIR /pb
COPY --from=builder /app/out ./pb_public
COPY pb_migrations ./pb_migrations
COPY pb_hooks ./pb_hooks
COPY meal-data ./meal-data

EXPOSE 8090
VOLUME /pb/pb_data
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
