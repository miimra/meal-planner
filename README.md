# Family Meal Planner

A small household meal planner served by PocketBase. The public Next.js
application is deliberately read-only and shows only:

- today and tomorrow, with breakfast, lunch, and dinner;
- the complete Monday-to-Sunday plan on `/week`.

Planning, feedback, household questions, and meal photos are handled through
an authorized Telegram assistant. The daily 18:30 Europe/Amsterdam delivery
refreshes one dashboard; meal suggestions and their food photos are generated
only when an authorized user opens them.

## Architecture

```text
PocketBase cron ── OpenRouter text/image ── Telegram private/group chats
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
TELEGRAM_BOT_USERNAME=moghassemi_family_assistant_bot
TELEGRAM_WEBHOOK_SECRET=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
OPENROUTER_IMAGE_MODEL=openai/gpt-5-image-mini
YOUTUBE_API_KEY=
PUBLIC_BASE_URL=https://meal.number34.nl
APP_TIMEZONE=Europe/Amsterdam
TELEGRAM_DAILY_CRON="30 18 * * *"
```

`TELEGRAM_WEBHOOK_SECRET` must be a random value of at least 24 characters.
Tokens and API keys must never be committed.

`YOUTUBE_API_KEY` is optional. When present, recipe-link imports use the
official YouTube Data API to inspect public titles and descriptions. It does
not grant access to arbitrary video transcripts.

For production, keep these values in `/home/raptor/meal-planner/.env` on the
printer server with mode `0600`. Docker Compose loads that file when recreating
the container. Set `OPENROUTER_IMAGE_MODEL` when the Telegram bot's lazy
suggestion images should use a dedicated OpenRouter image model.

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
6. Open `/settings` from an authorized Telegram account in the family group
   and enable the daily update. This makes that chat the single daily-delivery
   destination and disables any previously subscribed private or group chat.

The bot registers its supported commands with Telegram during startup, which
makes Telegram’s command menu available without maintaining a second command
list in BotFather.

Unauthorized Telegram sender IDs are silently ignored. The webhook validates
Telegram's secret header before parsing an update, and repeated `update_id`
values are idempotent.

## Commands

```text
/home — button-driven household dashboard
/meals — view or change meal plans
/ask — ask a household question
/settings — daily update and help
```

`/start` remains an unlisted alias for `/home`. The former meal commands are
not alternate workflows: their behavior is available through categorized
inline buttons.

Authorized ordinary text is read-only. Private chats answer every non-command
text message. Groups answer only when `@moghassemi_family_assistant_bot` is
mentioned or the message replies to the bot. Answers use Amsterdam time,
stored assignments and feedback, household preferences, and the next two
weeks of dinner categories. Natural-language answers can recommend a date but
cannot alter assignments; all mutations require a button.

Authorized members can also send a public recipe URL as ordinary text. The bot
sends a new analysis response and edits that response into a preview. **Save
to want to try** is the only action that creates a dish; cancelling or merely
sending a link never changes the meal library or plan. Public recipe pages use
Schema.org recipe data when available, YouTube uses official metadata and
linked recipe pages, and Instagram is best-effort. If the recipe exists only
inside inaccessible video/audio, the bot asks for pasted ingredients,
instructions, caption, or another public link rather than inventing details.
Confirmed recipes appear under **Meals → Want to try** and can be suggested
when they fit category, household preferences, feedback, recency, time, and
difficulty.

Every new command, authorized question, or feedback photo receives a new bot
response. Buttons edit the response message that contains them, so independent
conversations never overwrite each other and button navigation never posts a
new message. Use **Meals → Change a meal → date → meal** to choose
**Suggest**, **Last meal**, **Buy**, **Eat out**, or **Skip**. Accepting a
suggestion updates an existing assignment as well as a new one. **Another**
replaces the suggestion card rather than posting another card.

Breakfast, dinner, and weekend lunch are sized for two adults and one baby.
Weekday lunch is sized for two adults because the baby is not present.
Suggestions are vegetable-forward, non-spicy, low in added salt and sugar,
and include a dish-specific baby instruction only when the baby is eating.
Breakfast and lunch are always very simple (easy, at most 20 minutes, and no
more than eight ingredients). Dinner's visible rotation category is the main
planning constraint. Ingredients and baby details live behind the card's
**Details** button so photo captions stay compact.

Opening a suggestion lazily requests one square, realistic, text-free food
image from OpenRouter. The protected image and Telegram `file_id` are cached
per suggestion. The photo is embedded in Telegram's editable rich-message
suggestion view: **Another** replaces it, while accepting, opening details, or
navigating away edits the same message back to text and removes the photo. If
generation or upload fails, the text suggestion and all of its buttons remain
usable.

At 18:30, PocketBase sends one new dashboard for that day with today's
feedback entry point and tomorrow's planning status. Its buttons edit that
daily dashboard in place. It does not send separate meal cards or unsolicited
summary messages.

After a feedback button is pressed, the next photo from that same user and chat
is attached to that meal. The bot confirms the exact date, meal slot, and dish.

## Development

```bash
npm install

curl -Lo /tmp/pb.zip \
  https://github.com/pocketbase/pocketbase/releases/download/v0.39.10/pocketbase_0.39.10_linux_amd64.zip
unzip -o /tmp/pb.zip pocketbase -d /tmp/pb

TELEGRAM_BOT_TOKEN=test-token \
TELEGRAM_BOT_USERNAME=moghassemi_family_assistant_bot \
TELEGRAM_WEBHOOK_SECRET=development-webhook-secret-12345 \
OPENROUTER_API_KEY=test-key \
OPENROUTER_MODEL=test/model \
OPENROUTER_IMAGE_MODEL=openai/gpt-5-image-mini \
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

Production is a normal checkout of the `master` branch at
`/home/raptor/meal-planner`. Deploy directly on the printer server:

```bash
ssh raptor@printer-server.local
cd ~/meal-planner
./deploy.sh
```

`deploy.sh` checks out and fast-forwards from `origin/master`, backs up the
external `meal-planner-pb-data` volume, builds the Git commit through
`docker-compose.yml`, recreates the container, and waits for
`http://127.0.0.1:8091/api/health`. If startup fails, it restores the image
that was running before deployment. The latest eight volume backups remain in
`~/meal-planner/backups`.

The deployed runtime uses:

```text
host: raptor@printer-server.local
port: 8091
volume: meal-planner-pb-data -> /pb/pb_data
checkout: /home/raptor/meal-planner (master)
configuration: /home/raptor/meal-planner/.env (0600)
compose file: /home/raptor/meal-planner/docker-compose.yml
health check: curl --fail http://127.0.0.1:8091/api/health
```

PocketBase serves the static export and API on container port 8090. Keep the
PocketBase `/_/` administration path protected. If Cloudflare challenges bot
traffic, bypass interactive challenges only for the exact path:

```text
/api/telegram/webhook
```

Do not whitelist all `/api/*` routes.

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the deployment record, rollback
command, backup policy, and the required follow-up to rotate any credentials
that were exposed during the original environment inspection.

## Data access

Public read access is limited to categories, dishes, and meal assignments so
the no-login website can render live plans. Public mutation rules remain
closed. These collections remain private:

- Telegram users, chats, updates, conversations, and delivery state;
- household members;
- cooked occurrences;
- feedback and suggestions;
- protected meal photos.
