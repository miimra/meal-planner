# Meal Planner

A small household meal planner built with Next.js 16, Tailwind CSS, and
PocketBase. PocketBase serves both the statically exported application and its
data API.

The public application is read-only. It currently shows the active meal
rotation and the current week; meal administration is handled outside the
public frontend.

## Development

```bash
npm install

curl -Lo /tmp/pb.zip \
  https://github.com/pocketbase/pocketbase/releases/download/v0.39.10/pocketbase_0.39.10_linux_amd64.zip
unzip -o /tmp/pb.zip pocketbase -d /tmp/pb
/tmp/pb/pocketbase serve --http=127.0.0.1:8090 &

NEXT_PUBLIC_PB_URL=http://127.0.0.1:8090 npm run dev
```

Run the checks with:

```bash
npm test
npm run build
```

## Production

```bash
docker build -t meal-planner .
docker run -p 8090:8090 \
  -v meal-planner-pb-data:/pb/pb_data \
  meal-planner
```

The container builds the Next.js static export, copies it into PocketBase's
`pb_public` directory, and serves everything on port 8090.

## Meal rotation

The two-week dinner rotation is defined in `app/lib/rotation.ts`:

| | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Week 1 | International chicken/meat | Bandari & eggs | Fish & shrimp | Layered rice | Pasta | Eat out | Family choice |
| Week 2 | Pizza | Cold & simple | Salad as a meal | Pastries | Burgers & sushi | Eat out | Family choice |

The calendar is anchored to Monday, 1 January 2024, and advances without stored
weekly state.

## Storage

PocketBase migrations create and seed:

- meal categories and dishes;
- household members;
- dated breakfast, lunch, and dinner assignments;
- cooked occurrences and protected photos;
- per-member feedback;
- meal suggestion history.

The public frontend can read categories and dishes. Meal-domain collections
remain server-managed.

## Project structure

```text
app/             Next.js static application
pb_hooks/        PocketBase server hooks
pb_migrations/   PocketBase schema and seed data
public/          PWA icons and static assets
test/            integration tests
```
