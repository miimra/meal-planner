# Recipe link imports

## Outcome

Authorized household members can send a public recipe, YouTube, or Instagram URL to the Telegram bot. The bot answers with a new analysis message and edits only that response while the user reviews it. A recipe enters the household library only after the user taps **Save to want to try**.

Confirmed recipes participate in normal meal suggestions. Dinner category remains a hard constraint; household preferences, prior feedback, recency, effort, and an exploration boost for untried saved recipes influence selection. Cooking and feedback continue through the existing assignment and occurrence flows.

## Reliable-first source policy

1. Parse Schema.org `Recipe` JSON-LD from public web pages.
2. Fall back to bounded readable metadata/page text and strict AI extraction.
3. For YouTube, use official API metadata and description when `YOUTUBE_API_KEY` is configured, then inspect a public recipe link in the description.
4. Treat Instagram HTML metadata as best-effort only.
5. When source material is inaccessible or exists only inside video/audio, ask for a forwarded upload, screenshots, caption, transcript, or pasted recipe text. Do not use unofficial login bypasses or scraping services.

## Interaction contract

- A new link message creates a new bot response.
- Analysis, category selection, save, retry, and cancel buttons edit that response.
- No imported recipe is saved as a dish before explicit button confirmation.
- Navigation away from media-rich content removes its embedded media.
- Group messages retain the existing mention/reply requirement.
- Unauthorized users remain silent.

## Components

### Ingestion and safety

- Extract and canonicalize one HTTP(S) URL.
- Reject credentials in URLs, non-public hosts/IPs, unsafe ports, excessive redirects, non-HTML responses, and oversized/slow responses.
- Revalidate the destination after every redirect.
- Treat fetched content as untrusted data and never place it in system instructions.
- Deduplicate by canonical URL hash and normalized dish name.

### Extraction

- Normalize: title, ingredients, instructions, prep/cook time, servings, cuisine, category, dietary notes, source, confidence, and missing fields.
- Prefer deterministic structured data over model output.
- Validate model JSON strictly and cap all stored strings/arrays.
- Keep source attribution and paraphrase instructions instead of storing an entire article.

### Storage

- A private `recipe_imports` collection tracks the request, source, status, extraction, confidence, errors, model, requesting member, Telegram response message, and confirmed dish.
- Dishes gain lifecycle/source metadata. Confirmed imports use lifecycle `want_to_try`; ordinary existing dishes remain `regular`.
- Import records and raw extraction metadata are not public.

### Recommendations

- Include active confirmed `want_to_try` dishes in the AI context with ingredients, time, lifecycle, and source.
- Require an exact existing dish ID when recommending a saved recipe.
- Preserve category and exclusion validation, apply feedback and repetition signals, and give never-tried saved dishes a bounded exploration preference.
- Accepting a suggestion uses the existing assignment path; feedback then influences later suggestions.

## Delivery phases

1. Schema and reversible migration.
2. URL safety, source adapters, normalized extraction, and tests.
3. Telegram analysis/preview/confirmation flow.
4. Recommendation integration.
5. PocketBase integration coverage and regression tests.
6. Documentation, production build, push, deploy, and health verification.

## Acceptance checks

- Recipe JSON-LD imports without requiring AI when complete.
- YouTube description and linked-page import works with official metadata.
- Instagram/inaccessible/video-only sources return a useful fallback, not a fabricated recipe.
- Duplicate URLs reuse the existing import/dish.
- Save and cancel are button-confirmed and message-scoped.
- Imported dinner recipes are eligible only for compatible categories.
- Existing command, authorization, feedback/photo, daily delivery, suggestion image, and public-read behavior remain intact.
- All unit/integration tests, `npm run build`, deployment-script syntax, production health, migration, persistence, and restart policy checks pass.
