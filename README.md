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
TELEGRAM_BOT_USERNAME=your_bot_username
TELEGRAM_WEBHOOK_SECRET=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
YOUTUBE_API_KEY=
PUBLIC_BASE_URL=https://meals.example.com
APP_TIMEZONE=Europe/Amsterdam
TELEGRAM_DAILY_CRON="30 18 * * *"
```

`TELEGRAM_WEBHOOK_SECRET` must be a random value of at least 24 characters.
Tokens and API keys must never be committed.

`YOUTUBE_API_KEY` is optional. When present, recipe-link imports use the
official YouTube Data API to inspect public titles and descriptions. It does
not grant access to arbitrary video transcripts.

For production, keep these values in `/srv/meal-planner/.env` on the
production server with mode `0600`. Docker Compose loads that file when recreating
the container. Suggestion photos are looked up from Wikimedia thumbnails, so
no image model or extra key is needed.

## Telegram setup

1. Create the bot with BotFather and install its token as
   `TELEGRAM_BOT_TOKEN`.
2. Disable BotFather privacy mode if ordinary group photo messages should reach
   the bot. Otherwise, send photos as replies to a bot feedback message.
3. Add one `telegram_users` record for every allowed sender. Store the Telegram
   user ID as text, relate it to a household member, and set `active` to true.
4. Deploy the application, then register the webhook:

```bash
curl --fail-with-body \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"https://meals.example.com/api/telegram/webhook\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\",\"callback_query\"]}"
```

5. Add the bot to the family group.
6. Open `/settings` from an authorized Telegram account in the family group
   and enable the weekly reminder. This makes that chat the scheduled-delivery
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
/plan — plan or change this week's dinners
/settings — weekly reminder and help
```

`/start`, `/meals`, and `/ask` remain unlisted aliases so commands and buttons
in older messages keep working. Questions do not need a command: send ordinary
text in private chat, or mention/reply to the bot in a group.

Authorized ordinary text is read-only. Private chats answer every non-command
text message. Groups answer only when the username configured in
`TELEGRAM_BOT_USERNAME` is mentioned or the message replies to the bot. Answers use Amsterdam time,
stored assignments and feedback, household preferences, and the next two
weeks of dinner categories. Natural-language answers can recommend a date but
cannot alter assignments; all mutations require a button.

Every user-triggered bot message is a Telegram reply to the exact incoming
message. Button actions edit the bot message containing the button, while the
scheduled Sunday reminder remains a standalone message. Authorized activity is
logged as `Telegram received (Person from Chat): message` followed by
`Telegram action (Person from Chat): result`; control characters are removed
and bot credentials or internal record metadata are never added automatically
to these audit lines.

Authorized members can also send a public recipe URL as ordinary text. The bot
sends a new analysis response and edits that response into a preview. **Save
to want to try** is the only action that creates a dish; cancelling or merely
sending a link never changes the meal library or plan. Public recipe pages use
Schema.org recipe data when available, YouTube uses official metadata and
linked recipe pages, and Instagram is best-effort. If the recipe exists only
inside inaccessible video/audio, the bot asks for pasted ingredients,
instructions, caption, or another public link rather than inventing details.
Confirmed recipes appear under **More → Saved recipes** and can be suggested
when they fit category, household preferences, feedback, recency, time, and
difficulty.

Every new command, authorized question, or feedback photo receives a new bot
response. Buttons edit the response message that contains them, so independent
conversations never overwrite each other and button navigation never posts a
new message. Use **Week → day** to choose **Suggest**, **Enter a dish**, or
**Leftovers**. Less common outcomes—**Buy food**, **Eat out**, and **Skip**—are
under **Not cooking…**. Use **More → Choose another date** for dates outside
the current week. **Leftovers**
stores only the neutral “Left over” state and never guesses which earlier dish
is being reused. The change screen always shows the current choice and the
dinner rotation category. Sunday requires choosing Grilled or Stew before a
suggestion can be generated. Accepting a
suggestion updates an existing assignment as well as a new one. **Another**
replaces the suggestion card rather than posting another card.

Navigation buttons on older bot messages remain useful and refresh the message
that contains them. Planning buttons for dates that have passed are rejected,
and accepted or replaced suggestion cards cannot be reactivated from an old
message.

Every panel's back button returns to the screen that opened it — the Sunday
plan message, Home, a legacy Meals/day view, or the date picker — because
each planning button carries the origin it was drawn from. Settling a dinner
from the Sunday message redraws that weekly plan instead of the home dashboard.
`docs/menu-state-machine.md` maps every screen and its back target.

**I'll cook…** also captures what the dish is made of, so the shopping list is
complete. A dish already stored with ingredients is planned straight away; for
anything else the model is asked for the full ingredient list. A dish it does
not recognise is **not** planned: the bot asks for the ingredients (one per
line) or for a different dish, and plans it only once they arrive. If the model
cannot be reached the dish is planned anyway and the ingredients are requested
the same way.

Breakfast, dinner, and weekend lunch are sized for two adults and one baby.
Weekday lunch is sized for two adults because the baby is not present.
Suggestions are vegetable-forward, non-spicy, low in added salt and sugar,
and include a dish-specific baby instruction only when the baby is eating.
Breakfast and lunch are always very simple (easy, at most 20 minutes, and no
more than eight ingredients). Dinner's visible rotation category is the main
planning theme; **Flexible Choice** deliberately opens the full eligible meal
library. Category notes, effort ranges, multi-category dish relations, and
compact recipe facts all participate in selection. The canonical category list
and rotation are kept in [`docs/meal-categories.md`](docs/meal-categories.md).
Ingredients and baby details live behind the card's **Details** button so photo
captions stay compact.

Opening a suggestion lazily requests one square, realistic, text-free food
image from OpenRouter. The protected image and Telegram `file_id` are cached
per suggestion. The photo is embedded in Telegram's editable rich-message
suggestion view: **Another** replaces it, while accepting, opening details, or
navigating away edits the same message back to text and removes the photo. If
generation or upload fails, the text suggestion and all of its buttons remain
usable.

At 18:30, PocketBase sends one new check-in that puts tomorrow first: all three
meal decisions, the dinner category (or Sunday category choice), and a direct
**Plan tomorrow** button. Today's chosen meals remain underneath with a feedback
entry point when at least one dish can be rated. Its buttons edit that daily
message in place. It does not send separate meal cards or unsolicited summary
messages.

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

Production is a normal checkout of the `main` branch at
`/srv/meal-planner`. From a clean development checkout whose `main`
commit has already been pushed, run:

```bash
./deploy.sh
```

`deploy.sh` verifies the exact `origin/main` commit, runs tests and a production
build locally, and then updates the production checkout over SSH. The host
helper backs up the external `meal-planner-pb-data` volume, builds that exact
commit through `docker-compose.yml`, recreates the container, and checks both
the API and static app. If startup fails, it restores the previously running
image. The newest eight volume backups remain in `/srv/meal-planner/backups`.
After health passes it registers and verifies Telegram's four commands and
secure webhook using the production `.env`.

The deployed runtime uses:

```text
host: ovh-prod (ubuntu@vps-90c7df32.vps.ovh.net)
port: 8091
volume: meal-planner-pb-data -> /pb/pb_data
checkout: /srv/meal-planner (main)
configuration: /srv/meal-planner/.env (0600)
compose file: /srv/meal-planner/docker-compose.yml
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
