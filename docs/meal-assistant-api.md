# Meal Assistant API

PocketBase serves this purpose-built API from `/api/meal-assistant/*`. The routes use
server-side collection access and do not require, accept, issue, or expose a PocketBase
superuser credential. The generic records API for the assistant-owned collections is
locked by `null` collection rules.

## Configuration

Set a random token of at least 32 characters in the PocketBase process environment. Do
not commit it, place it in `NEXT_PUBLIC_*`, or send it to the browser application.

```bash
export MEAL_ASSISTANT_TOKEN="$(openssl rand -hex 32)"
./pocketbase serve --http=127.0.0.1:8090
```

For Docker, pass the secret at runtime (or use your platform's secret manager):

```bash
docker run -p 8090:8090 \
  -e MEAL_ASSISTANT_TOKEN="$MEAL_ASSISTANT_TOKEN" \
  -v meal-planner-pb-data:/pb/pb_data \
  meal-planner
```

Every request must include:

```text
Authorization: Bearer <MEAL_ASSISTANT_TOKEN>
```

Missing and invalid credentials receive the same `401` response. Token hashes are
compared using PocketBase's constant-time security helper. If the configured token is
absent or shorter than 32 characters, the API remains unavailable.

The examples below assume:

```bash
BASE_URL=https://meals.example.com
TOKEN="$MEAL_ASSISTANT_TOKEN"
```

## GitHub meal-data synchronization

PocketBase can mirror the configured GitHub repository's `meal-data/` tree into
the existing meal-assistant collections. GitHub is authoritative only for fields
represented by those documents; unrelated PocketBase fields and uploaded image
binaries are preserved.

Configure the repository in the PocketBase process environment:

```bash
export MEAL_DATA_GITHUB_OWNER=owner
export MEAL_DATA_GITHUB_REPO=repository
export MEAL_DATA_GITHUB_BRANCH=master
export MEAL_DATA_GITHUB_ROOT=meal-data
```

Public repositories need no GitHub credential. For a private repository, create a
fine-grained token restricted to that repository with only **Contents: read** and
set one of the following variables. The dedicated name takes precedence:

```bash
export MEAL_DATA_GITHUB_TOKEN=github_pat_REDACTED
# GITHUB_TOKEN is also accepted as a fallback.
```

Optional scheduling settings are:

```bash
export MEAL_DATA_SYNC_CRON="0 6 * * *"
export MEAL_DATA_SYNC_TIMEZONE=Europe/Amsterdam
```

The defaults above run once per day at 06:00 Amsterdam time, including daylight
saving transitions. The cron is registered as `github-meal-data-sync` and can also
be inspected or run by a superuser from PocketBase Dashboard > Settings > Crons.

The production container includes `tzdata` and the checked-in schemas under
`meal-data/schema/`. `MEAL_DATA_GITHUB_API_URL` may override `https://api.github.com`
for GitHub Enterprise or local integration testing.

### Manual sync

Logged-in household users can open the unlocked account menu in the application's
bottom navigation and select **Synchronize meals**. The browser sends the current
PocketBase `users` auth token; the internal assistant token is never sent to or
stored by the frontend.

The same operation can be requested by backend automation through the existing
bearer-protected route:

```bash
curl --fail-with-body -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/internal/github-sync"
```

The route accepts either a valid PocketBase `users` token or the configured
`MEAL_ASSISTANT_TOKEN`. No request body is needed. A new commit returns a summary
such as:

```json
{
  "status": "completed",
  "trigger": "manual",
  "repository": "owner/repository",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "summary": {
    "recipesUpserted": 2,
    "daysUpserted": 1,
    "feedbackUpserted": 2
  }
}
```

An already processed commit returns `status: "unchanged"`. Validation and mapping
failures return `400`; GitHub and configuration failures return a server error. The
commit is recorded only after the data transaction succeeds.

### Import behavior

- The latest configured branch commit is compared with the most recently processed
  commit; initial and force-push recovery runs scan the complete repository tree.
- Only recognized `household.json`, `recipes/*.json`, and dated `days/**/day.json`
  files below the configured root are imported. Schema and unrelated files are skipped.
- All fetched documents are validated before persistence. Recipe filename IDs and day
  folder dates must agree with their document values.
- Household members, recipes, three daily meal slots, suggestions, cooked occurrences,
  and feedback are upserted by their stable source or natural keys.
- Every successful commit SHA is retained in the locked `github_sync_commits`
  collection, making retries idempotent.
- Source-file deletion is deliberately non-destructive: it is logged and recorded in
  the commit metadata, but existing recipes and historical meal/feedback records are
  not hard-deleted. Explicit fields in documents continue to update normally.
- GitHub photo objects populate URL metadata fields only. Existing PocketBase file
  uploads remain untouched.

Formal Draft 2020-12 schemas and working examples live in the checked-in
[`meal-data`](../meal-data/) directory.

## Context

`date` is the target planning date (normally tomorrow). Consequently `today` is the
preceding date and `tomorrow` is the target date. The week always contains the calendar
Monday through Sunday that contains the target date.

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/meal-assistant/context?date=2026-08-12"
```

The response contains:

- today and target-day breakfast, lunch, and dinner slots;
- each slot's category schedule, assignment, cooked occurrence, and feedback;
- all seven Monday-Sunday days, plus `usedDishIds` and complete used dishes;
- recent cooked-dish history, per-member feedback, and suggestion outcomes;
- active household members and their stored preference notes.

The existing two-week rotation only defines dinner. Breakfast and lunch therefore have
an `unspecified` schedule until assigned. Saturday dinner is `eat-out`; Sunday dinner
returns the existing two category choices.

## Assign an existing dish

```bash
curl --fail-with-body -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-08-12",
    "meal": "breakfast",
    "dishId": "REPLACE_WITH_DISH_ID"
  }' \
  "$BASE_URL/api/meal-assistant/assign"
```

Sending the same assignment again is idempotent. A different existing assignment
receives `409` and remains untouched. A caller may only replace it by deliberately
sending `"replaceExisting": true`.

## Create and assign a recipe

Ingredients may be strings or structured objects with `name`, `quantity`, `unit`, and
optional `notes`. Category values can be PocketBase category IDs, legacy numeric
`catId`s, or category names. Unmatched category labels are retained as tags.

```bash
curl --fail-with-body -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-08-12",
    "meal": "dinner",
    "dish": {
      "name": "Lemon herb salmon",
      "categories": ["fish"],
      "difficulty": "easy",
      "cuisine": "Mediterranean",
      "tags": ["non-spicy"],
      "recipe": {
        "ingredients": [
          {"name": "salmon", "quantity": 2, "unit": "fillets"},
          {"name": "lemon", "quantity": 1}
        ],
        "instructions": ["Season the salmon.", "Bake until cooked."],
        "prepMinutes": 10,
        "cookMinutes": 20
      }
    }
  }' \
  "$BASE_URL/api/meal-assistant/assign"
```

Dish creation/update and assignment happen in one database transaction. The unique
database index on `(date, meal)` is a second line of duplicate protection.

## Feedback

Use a `memberId` returned by the context endpoint. Repeating feedback for the same
cooked occurrence and member updates that member's prior response; another member gets
an independent response.

```bash
curl --fail-with-body -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-08-11",
    "meal": "dinner",
    "dishId": "REPLACE_WITH_DISH_ID",
    "memberId": "REPLACE_WITH_MEMBER_ID",
    "rating": "liked",
    "makeAgain": "yes",
    "changes": "Used less salt and added more lemon."
  }' \
  "$BASE_URL/api/meal-assistant/feedback"
```

Valid ratings are `liked`, `okay`, and `disliked`. Valid `makeAgain` values are `yes`,
`maybe`, and `no`. Feedback creates the cooked occurrence if one does not exist, while
checking that its dish agrees with the meal assignment.

## Upload photos

Reference images and real cooked photos are deliberately separate. Accepted image
types are JPEG, PNG, WebP, and GIF. Reference files are limited to 5 MiB; cooked photos
to 10 MiB each, with at most 10 photos per occurrence.

Reference recipe image (one file, replaces the prior reference):

```bash
curl --fail-with-body -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F type=reference \
  -F dishId=REPLACE_WITH_DISH_ID \
  -F file=@reference.jpg \
  "$BASE_URL/api/meal-assistant/photo"
```

Cooked-meal photo (one or more `file` parts, appended to the occurrence):

```bash
curl --fail-with-body -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F type=cooked \
  -F date=2026-08-11 \
  -F meal=dinner \
  -F dishId=REPLACE_WITH_DISH_ID \
  -F modifications="Added more lemon" \
  -F file=@cooked.jpg \
  "$BASE_URL/api/meal-assistant/photo"
```

Photo metadata includes a `/api/meal-assistant/photo/...` URL. That download URL also
requires the bearer header; the underlying PocketBase file fields are protected.

## Record suggestion outcomes

This small optional endpoint lets future recommendations learn from explicit rejection
reasons without creating rejected dishes first.

```bash
curl --fail-with-body -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-08-12",
    "meal": "dinner",
    "suggestedName": "Spicy noodle bowl",
    "outcome": "rejected",
    "rejectionReason": "Too spicy for the household",
    "memberId": "REPLACE_WITH_MEMBER_ID"
  }' \
  "$BASE_URL/api/meal-assistant/suggestion"
```

`outcome` is `accepted` or `rejected`. Either `dishId` or `suggestedName` is required;
`memberId` and `rejectionReason` are optional.

## Schema

The migration extends `dishes` while preserving legacy `catId` compatibility:

- multi-category relation, ingredients/instructions JSON, prep/cook minutes;
- optional difficulty, cuisine, tags, and a relation to separately stored reference media;
- created/updated timestamps (pre-migration seed records have no historical creation
  timestamp to backfill, so their `created` value remains `null`).

It adds locked collections for `household_members`, `dish_reference_photos`,
`meal_assignments`, `cooked_occurrences`, `meal_feedback`, and `meal_suggestions`. Amir and Maryam are
seeded as active members. Additional members and preference notes can be managed from
the private PocketBase Admin UI.

The GitHub sync migration extends those collections with stable external IDs and
source metadata. It also adds locked `household_settings` and
`github_sync_commits` collections. `meal_assignments` represents the natural
`date + meal` slot, so unplanned, skipped, and eating-out slots do not require a dish.

## Cloudflare

No broad `/api/*` bypass is needed. Keep the existing public block for `/_/` exactly as
it is. If a Cloudflare rule currently blocks all unknown paths, add
`/api/meal-assistant/*` plus the exact `/api/internal/github-sync` path to the origin
allowlist. Permit `GET` and `POST` with request bodies up to 25 MiB. Forward the
`Authorization` header and multipart bodies unchanged.

Cloudflare's allow rule is not authentication: PocketBase still validates the bearer
token on every assistant route. Do not cache context or mutation responses, and redact
the `Authorization` header from request logs if it is captured by any custom logging.

## Tests

Pure date/auth parsing tests run with the normal suite. Full route tests need a
PocketBase 0.39.10 binary:

```bash
POCKETBASE_BIN=/path/to/pocketbase npm test
```

Without `POCKETBASE_BIN` (and without `pocketbase` on `PATH`), the integration suite is
reported as skipped while the unit suite still runs.
