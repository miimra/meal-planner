# Meal Planner deployment

Production runs as a Docker Compose service on the printer server. PocketBase
serves both the bot API and the statically exported Next.js overview.

| Field | Value |
| --- | --- |
| Host | `raptor@printer-server.local` |
| Checkout | `/home/raptor/meal-planner` |
| Branch | `main` |
| Configuration | `/home/raptor/meal-planner/.env` (`0600`) |
| Container | `meal-planner` with `unless-stopped` |
| Port | host `8091` → container `8090` |
| Persistent volume | `meal-planner-pb-data` → `/pb/pb_data` |
| Backups | `/home/raptor/meal-planner/backups` (newest eight retained) |
| Public URL | `https://meal.number34.nl` |

## Deploy

Commit and push `main`, then run this from the development checkout:

```bash
./deploy.sh
```

The script refuses to deploy a dirty tree, another branch, or a commit that is
not exactly `origin/main`. Before touching production it runs `npm ci`, rejects
high-severity production dependency advisories, runs the complete test suite,
and creates the Next.js production build.

Over SSH it fast-forwards the production checkout to the verified commit and
runs `scripts/deploy-host.sh`. The host helper:

1. validates the exact commit and production `.env`;
2. creates a timestamped PocketBase volume backup;
3. retains the newest eight backups;
4. builds a commit-tagged image while the current container stays online;
5. recreates the service and checks the local API and static app;
6. restores `meal-planner:rollback` if startup or health checks fail;
7. registers Telegram commands and the webhook, then verifies Telegram's API;
8. tags the healthy image as `meal-planner:latest`.

Optional overrides are available for a different environment:

```bash
DEPLOY_HOST=user@example DEPLOY_PATH=/srv/meal-planner ./deploy.sh
```

Changing production `.env` requires another deployment because recreating the
container is what reloads its environment.

## Verify and inspect

```bash
ssh raptor@printer-server.local
cd ~/meal-planner
docker compose ps
docker compose logs --tail=100 meal-planner
curl --fail http://127.0.0.1:8091/api/health
curl --fail http://127.0.0.1:8091/
```

Follow bot activity without sending a test message to the household:

```bash
docker compose logs --follow meal-planner
```

The expected startup log includes successful PocketBase migrations and command
registration. Normal Telegram activity is logged as a sanitized received line
followed by its resulting action.

## Roll back

The deployment helper automatically restores the previous image when the new
container cannot start or pass its local health checks. For a manual image
rollback after a later issue:

```bash
ssh raptor@printer-server.local
cd ~/meal-planner
MEAL_PLANNER_IMAGE=meal-planner:rollback \
  docker compose up -d --no-build --force-recreate --remove-orphans
curl --fail http://127.0.0.1:8091/api/health
```

An image rollback does not change PocketBase data. To restore data, stop the
service and deliberately select a timestamped archive under
`~/meal-planner/backups`. Data restoration is intentionally not automated.

## Secret handling

Never commit `.env`, print its contents, or copy credentials into deployment
logs. Keep it mode `0600`. Telegram and OpenRouter credentials exposed during
the original environment inspection still require owner rotation; after
rotation, deploy again and verify health and webhook registration without
sending an unsolicited family-chat message.
