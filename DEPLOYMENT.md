# Meal Planner deployment record

The production service runs on `raptor@printer-server.local` as the Docker
container `meal-planner`. Deployments are performed by
[`scripts/deploy-printer-server.sh`](./scripts/deploy-printer-server.sh).
The household-assistant release below was deployed with the script after the
complete local test suite and production build passed.

## Recorded deployment

| Field | Value |
| --- | --- |
| Status | Healthy and running |
| Image tag | `meal-planner:b39504993bbb` (`sha256:d9679f7a025bfb1c1f83111ab121f32d25ad6ebdd22c5de91aa5518172695e69`) |
| Deployment date | 2026-08-12 21:44 UTC |
| Host | `raptor@printer-server.local` |
| Host port | `8091` |
| Container port | `8090` |
| Persistent volume | `meal-planner-pb-data` mounted at `/pb/pb_data` |
| Restart policy | `unless-stopped` |
| Health check | `curl --fail http://127.0.0.1:8091/api/health` |
| Runtime secrets | `/home/raptor/services/meal-planner/meal-planner.env` (`0600`) |

Post-deployment verification confirmed:

- local and public `/api/health`, plus the public site, return successfully;
- the container is running with `unless-stopped`, host port `8091`, and the
  existing `meal-planner-pb-data:/pb/pb_data` mount;
- the migration history ends with
  `1786800000_message_scoped_telegram_ui.js`; the three protected suggestion
  image/cache fields are present and both obsolete per-chat message pointers
  are absent;
- existing public data remains present (12 categories and existing meal
  assignments), and two pre-deployment volume backups were retained;
- Telegram reports exactly `home`, `meals`, `ask`, and `settings`, with the
  existing webhook URL, the expected update types, and zero pending updates.
  Its last reported delivery error was a historical 502 from
  2026-08-11 20:24:45 UTC, before this deployment.

No test or verification step sent a family-chat message. Do not copy the env
file or any secret values into this record, shell history, or Git.

## What the deployment does

1. Packages the working tree while excluding Git metadata, build output,
   dependencies, PocketBase data, local env files, and archives.
2. Transfers the archive to the printer server over SSH and builds
   `meal-planner:<Git commit>` for `linux/arm64`.
3. On the first run only, copies the existing `meal-planner` container's
   environment into `meal-planner.env` with mode `0600`; the environment is
   redirected through a temporary file and is never printed.
4. Creates a timestamped backup of `meal-planner-pb-data`, retaining the eight
   most recent backups.
5. Replaces `meal-planner` on port `8091`, retaining the same volume and
   `unless-stopped` policy. The existing Telegram webhook URL is not changed.
6. Waits for `/api/health`. If startup or health checking fails, the new
   container is removed and the previous container is restored automatically.
   The previous image is also tagged `meal-planner:previous`; the newest eight
   commit-tagged images are retained.

## Manual rollback

The automatic rollback is the normal path. If a healthy deployment later needs
to be reverted, verify that `meal-planner:previous` exists, then run this on
the printer server:

```bash
set -eu
docker rm -f meal-planner
docker run -d \
  --name meal-planner \
  --restart unless-stopped \
  --env-file /home/raptor/services/meal-planner/meal-planner.env \
  -p 8091:8090 \
  -v meal-planner-pb-data:/pb/pb_data \
  meal-planner:previous
curl --fail http://127.0.0.1:8091/api/health
```

Volume archives are stored under
`/home/raptor/services/meal-planner/backups`. Restore one only after stopping
the container and verifying the selected archive:

```bash
docker rm -f meal-planner
docker run --rm \
  -v meal-planner-pb-data:/target \
  -v /home/raptor/services/meal-planner/backups:/backup \
  alpine:3.20 sh -c 'rm -rf /target/* /target/.[!.]* /target/..?* 2>/dev/null || true; tar -xzf /backup/<backup-file>.tar.gz -C /target'
```

## Credential follow-up

The Telegram and OpenRouter credentials that were present during the original
environment inspection must be rotated immediately by the owner through
BotFather and OpenRouter. The deployment script preserves the current values
in the protected env file to avoid an outage, but never displays, logs, or
commits them. After rotating a credential, edit the env file with mode `0600`,
restart `meal-planner`, and verify the health endpoint and webhook status.
