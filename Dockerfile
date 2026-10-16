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
ARG BUILD_VERSION=development
ARG BUILD_COMMIT=development
ARG BUILD_AT=development
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
  && apk add --no-cache ca-certificates tzdata unzip curl bind-tools \
  && curl -Lo /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" \
  && unzip /tmp/pb.zip pocketbase -d /pb \
  && rm /tmp/pb.zip \
  && apk del unzip

WORKDIR /pb
COPY --from=builder /app/out ./pb_public
COPY pb_migrations ./pb_migrations
COPY pb_hooks ./pb_hooks
RUN if [ "$BUILD_VERSION:$BUILD_COMMIT:$BUILD_AT" != "development:development:development" ]; then \
      printf '%s' "$BUILD_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(\+[0-9]+\.[0-9a-f]{7,40})?$' \
      && printf '%s' "$BUILD_COMMIT" | grep -Eq '^[0-9a-f]{40}$' \
      && printf '%s' "$BUILD_AT" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' \
      || { echo "BUILD_VERSION, BUILD_COMMIT, and BUILD_AT must contain release metadata" >&2; exit 1; }; \
    fi
RUN printf '%s\n' \
    '// Generated during image build; do not read runtime configuration here.' \
    'module.exports = Object.freeze({' \
    '  service: "meal-planner",' \
    "  version: \"$BUILD_VERSION\"," \
    "  commit: \"$BUILD_COMMIT\"," \
    "  builtAt: \"$BUILD_AT\"," \
    '});' > ./pb_hooks/build_identity.js

EXPOSE 8090
VOLUME /pb/pb_data
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
