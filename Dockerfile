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
RUN apk add --no-cache ca-certificates unzip curl \
  && curl -Lo /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
  && unzip /tmp/pb.zip pocketbase -d /pb \
  && rm /tmp/pb.zip \
  && apk del unzip curl

WORKDIR /pb
COPY --from=builder /app/out ./pb_public
COPY pb_migrations ./pb_migrations

EXPOSE 8090
VOLUME /pb/pb_data
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
