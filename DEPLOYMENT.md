# Meal Planner deployment

Production runs from a normal Git checkout on the printer server:

| Field | Value |
| --- | --- |
| Host | `raptor@printer-server.local` |
| Checkout | `/home/raptor/meal-planner` |
| Branch | `master` |
| Compose file | `/home/raptor/meal-planner/docker-compose.yml` |
| Configuration | `/home/raptor/meal-planner/.env` (`0600`) |
| Container | `meal-planner` with `unless-stopped` |
| Port | host `8091` → container `8090` |
| Persistent volume | `meal-planner-pb-data` → `/pb/pb_data` |
| Backups | `/home/raptor/meal-planner/backups` |
| Health check | `curl --fail http://127.0.0.1:8091/api/health` |

## Deploy

Run this on the server:

```bash
cd ~/meal-planner
./deploy.sh
```

The script performs a fast-forward-only pull from `origin/master`, protects
`.env` with mode `0600`, backs up the PocketBase volume, builds the exact Git
commit, and recreates the service with Docker Compose. It retains the newest
eight volume backups. A failed Compose start or health check restores the
previous image as `meal-planner:rollback`. After the application is healthy,
the script registers Telegram's four commands and webhook using the current
`.env`, then tags the verified image as `meal-planner:latest`.

Changing `.env` requires running `./deploy.sh` again because restarting an
existing Docker container does not reload its environment.

## Useful commands

```bash
cd ~/meal-planner
docker compose ps
docker compose logs --tail=100 meal-planner
# Follow received Telegram messages and the actions taken for them.
docker compose logs --follow meal-planner
curl --fail http://127.0.0.1:8091/api/health
```

Manual image rollback, if a later problem appears after a successful deploy:

```bash
cd ~/meal-planner
docker rm -f meal-planner
MEAL_PLANNER_IMAGE=meal-planner:rollback docker compose up -d --no-build
curl --fail http://127.0.0.1:8091/api/health
```

To restore PocketBase data, first stop the service and verify the selected
archive under `~/meal-planner/backups`. Data restoration is intentionally not
automated by `deploy.sh`.

## Secret handling

Never commit `.env`, print its contents, or copy credentials into deployment
logs. Telegram and OpenRouter credentials exposed during the original
environment inspection still require owner rotation. After changing `.env`,
run `./deploy.sh` and verify health and Telegram webhook status without sending
an unsolicited family-chat message.
