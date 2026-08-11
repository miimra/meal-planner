# Family Meal Planner

A small household meal planner served by PocketBase. The public Next.js
application is deliberately read-only and shows only:

- today and tomorrow, with breakfast, lunch, and dinner;
- the complete Monday-to-Sunday plan on `/week`.

Planning, feedback, and meal photos are handled through an authorized Telegram
bot. Suggestions are generated through OpenRouter at 18:30 Europe/Amsterdam.

## Architecture

```text
PocketBase cron ── OpenRouter ── Telegram private/group chats
       │                                │
       ├── assignments                  ├── commands and buttons
       ├── feedback                     ├── per-member feedback
       └── protected photos             └── current-meal photos
       │
       └── public read-only Today/Tomorrow and Week UI
```

There is no GitHub meal-data synchronization, ChatGPT integration, frontend
login, or generic bot write API.

## Configuration

Copy the names from [`.env.example`](./.env.example) into the runtime secret
configuration:

```bash
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
PUBLIC_BASE_URL=https://meal.number34.nl
APP_TIMEZONE=Europe/Amsterdam
TELEGRAM_DAILY_CRON="30 18 * * *"
```

`TELEGRAM_WEBHOOK_SECRET` must be a random value of at least 24 characters.
Tokens and API keys must never be committed.

## Telegram setup

1. Create the bot with BotFather and install its token as
   `TELEGRAM_BOT_TOKEN`.
2. Disable BotFather privacy mode if ordinary group photo messages should reach
   the bot. Otherwise, send photos as replies to a bot feedback message.
3. Add one `telegram_users` record for every allowed sender. Store the Telegram
   user ID as text, relate it to Amir or Maryam, and set `active` to true.
4. Deploy the application, then register the webhook:

```bash
curl --fail-with-body \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"https://meal.number34.nl/api/telegram/webhook\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\",\"callback_query\"]}"
```

5. Add the bot to the family group.
6. Send `/subscribe` from an authorized Telegram account. This records the
   group/private chat ID and enables the daily delivery there.

Unauthorized Telegram sender IDs are silently ignored. The webhook validates
Telegram's secret header before parsing an update, and repeated `update_id`
values are idempotent.

## Commands

```text
/subscribe
/unsubscribe
/today
/tomorrow
/week
/suggest [breakfast|lunch|dinner]
/last [breakfast|lunch|dinner]
/buy [breakfast|lunch|dinner]
/eatout [breakfast|lunch|dinner]
/skip [breakfast|lunch|dinner]
/feedback [breakfast|lunch|dinner]
/photo
/cancel
/help
```

Only commands and inline buttons are interpreted. Ordinary text is ignored.

At 18:30, PocketBase asks for simple feedback on today's assigned meals and
sends separate breakfast, lunch, and dinner suggestions for tomorrow. Dinner
uses the existing two-week rotation category; breakfast and lunch use meal
type, recent history, weekly assignments, and feedback.

After a feedback button is pressed, the next photo from that same user and chat
is attached to that meal. The bot confirms the exact date, meal slot, and dish.

## Development

```bash
npm install

curl -Lo /tmp/pb.zip \
  https://github.com/pocketbase/pocketbase/releases/download/v0.39.10/pocketbase_0.39.10_linux_amd64.zip
unzip -o /tmp/pb.zip pocketbase -d /tmp/pb

TELEGRAM_BOT_TOKEN=test-token \
TELEGRAM_WEBHOOK_SECRET=development-webhook-secret-12345 \
OPENROUTER_API_KEY=test-key \
OPENROUTER_MODEL=test/model \
/tmp/pb/pocketbase serve --http=127.0.0.1:8090
```

In another terminal:

```bash
NEXT_PUBLIC_PB_URL=http://127.0.0.1:8090 npm run dev
```

Run all checks with:

```bash
POCKETBASE_BIN=/tmp/pb/pocketbase npm test
npm run build
```

The integration tests use local mock Telegram and OpenRouter servers. They do
not call Telegram or consume paid AI tokens.

## Production

```bash
docker build -t meal-planner .
docker run -p 8090:8090 \
  --env-file /path/to/meal-planner.env \
  -v meal-planner-pb-data:/pb/pb_data \
  meal-planner
```

PocketBase serves the static export and API on port 8090. Keep the PocketBase
`/_/` administration path protected. If Cloudflare challenges bot traffic,
bypass interactive challenges only for the exact path:

```text
/api/telegram/webhook
```

Do not whitelist all `/api/*` routes.

## Data access

Public read access is limited to categories, dishes, and meal assignments so
the no-login website can render live plans. Public mutation rules remain
closed. These collections remain private:

- Telegram users, chats, updates, conversations, and delivery state;
- household members;
- cooked occurrences;
- feedback and suggestions;
- protected meal photos.
