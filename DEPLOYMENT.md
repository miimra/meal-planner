# Meal Planner deployment

Production runs as a Docker Compose service on the production server. PocketBase
serves both the bot API and the statically exported Next.js overview.

| Field | Value |
| --- | --- |
| Host | `ovh-prod` (`ubuntu@vps-90c7df32.vps.ovh.net`) |
| Checkout | `/srv/meal-planner` |
| Branch | `main` |
| Configuration | `/srv/meal-planner/.env` (`0600`) |
| Container | `meal-planner` with `unless-stopped` |
| Port | host `8091` → container `8090` |
| Persistent volume | `meal-planner-pb-data` → `/pb/pb_data` |
| Backups | `/srv/meal-planner/backups` (newest eight retained) |
| Public URL | `https://meals.example.com` |

## Deploy

Production is deployed only by the `Deploy` GitHub Actions workflow
(`.github/workflows/deploy.yml`). Every push to `main` runs it, and it can be
started by hand with **Run workflow**. Development machines hold no production
credentials. Runs are serialised and each one deploys the current tip of `main`,
so a deployed commit always contains every earlier merge.

The workflow runs `./deploy.sh` with these repository settings:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `VPS_SSH_KEY` | private key authorised for the production account |
| Variable | `VPS_HOST` | production server host name |
| Variable | `VPS_USER` | production account, defaults to `ubuntu` |
| Variable | `VPS_KNOWN_HOSTS` | the server's `known_hosts` line(s); scanned when unset |
| Variable | `DEPLOY_PATH` | optional, defaults to `/srv/meal-planner` |
| Variable | `DEPLOY_HEALTH_URL` | public `/api/health` URL |
| Variable | `DEPLOY_VERSION_URL` | public `/api/version` URL |

The script refuses to deploy a dirty tree, another branch, or a commit that is
not exactly `origin/main`. Before touching production it runs `npm ci`, rejects
high-severity production dependency advisories, runs the complete test suite,
and creates the Next.js production build.

### Release identity

Before the first production deployment using this flow, the repository owner
must publish `v0.1.0` on the intended release commit. Each deployment fetches
release tags and requires a reachable `vX.Y.Z` tag for the shipped commit. An
exact tag builds as `X.Y.Z`; a later commit builds as `X.Y.Z+N.<short-sha>`.
A missing or malformed tag anchor stops deployment before an image is built.

The deployment passes the derived version, full commit SHA, and UTC build
timestamp to the image as build arguments. PocketBase exposes that immutable
identity without authentication at `/version` and `/api/version`; `/api/health`
retains its health status and includes the same fields. After the host is
updated, `deploy.sh` reads the public `/api/version` response and fails unless
its `commit` is a well-formed full SHA matching the shipped commit.

After the initial tagged production deployment, the owner should verify that
the public `/api/version` response reports the tagged version and deployed
commit.

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

The same script can deploy a different environment by hand from a machine that
holds that environment's credentials:

```bash
DEPLOY_HOST=user@example DEPLOY_PATH=/srv/meal-planner ./deploy.sh
```

Changing production `.env` requires another deployment because recreating the
container is what reloads its environment.

## Verify and inspect

```bash
ssh ovh-prod
cd /srv/meal-planner
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
ssh ovh-prod
cd /srv/meal-planner
MEAL_PLANNER_IMAGE=meal-planner:rollback \
  docker compose up -d --no-build --force-recreate --remove-orphans
curl --fail http://127.0.0.1:8091/api/health
```

An image rollback does not change PocketBase data. To restore data, stop the
service and deliberately select a timestamped archive under
`/srv/meal-planner/backups`. Data restoration is intentionally not automated.

## Secret handling

Never commit `.env`, print its contents, or copy credentials into deployment
logs. Keep it mode `0600`. If a Telegram or OpenRouter credential is ever
exposed, rotate it, deploy again, and verify health and webhook registration
without sending an unsolicited chat message.
