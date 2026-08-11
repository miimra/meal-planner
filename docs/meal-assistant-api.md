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

## Cloudflare

No broad `/api/*` bypass is needed. Keep the existing public block for `/_/` exactly as
it is. If a Cloudflare rule currently blocks all unknown paths, add only
`/api/meal-assistant/*` to the origin allowlist and permit `GET` and `POST` with request
bodies up to 25 MiB. Forward the `Authorization` header and multipart bodies unchanged.

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
