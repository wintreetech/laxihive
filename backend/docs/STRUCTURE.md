# Adding features

Game access/billing is implemented in `backend/src/services/game-access.service.ts`, with configuration models in Prisma and client recovery in `frontend/src/lib/gameSession.tsx`. Add payment providers as separate services/adapters that call the existing wallet ledger after trusted verification; do not give provider code a separate balance system. See [game pricing](GAME_PRICING.md), [session billing](SESSION_BILLING.md) and [wallet accounting](WALLET.md).

The root has two application directories: `frontend` and `backend`. Each has its own dependencies and lockfile. Root npm commands are optional shortcuts, not a workspace. Install dependencies inside each app or run the root install shortcut. `backend/shared/` contains the single game engine/catalog/rules used by both apps. Keep both folders together for frontend builds. The backend build needs only backend files.

## Add a page

1. Create `frontend/src/pages/YourPage.tsx`.
2. Register its route in `frontend/src/App.tsx`.
3. Put reusable UI in `frontend/src/components/` and API calls alongside the existing client in `frontend/src/lib/`.
4. Add navigation in `frontend/src/components/Layout.tsx` if needed.

## Add an API feature

1. Add MongoDB models to `backend/prisma/schema.prisma` if needed.
2. From the root, run `npm.cmd run db:generate` and `npm.cmd run db:migrate`.
3. Create `backend/src/routes/feature.routes.ts` with an Express Router.
4. Put reusable business logic in `backend/src/services/feature.service.ts`. For larger HTTP handlers, use `backend/src/controllers/feature.controller.ts`. Small handlers can stay alongside their routes, as the existing auth and profile routes do.
5. Register the router in `backend/src/app.ts`. Follow existing authentication and CSRF middleware placement for protected changes.
6. Add meaningful API checks in `backend/test/`.

Use `config/database.ts` for the shared database client and `atomic()` for related writes that must succeed together. Put scheduled/operator tasks in `jobs/`.

## Add a game

1. Add its catalog entry in `backend/shared/catalog.ts`.
2. Add its game rules to `backend/shared/engine.ts`, following the current replay format.
3. Add the game interface to `frontend/src/pages/Play.tsx` or extract a dedicated component when useful.
4. Update the engine checks and fixtures in `backend/shared/`.
5. Run `npm.cmd run db:seed` so MongoDB receives the catalog entry.

The same rules run in the browser and on the server for score validation. Avoid copying game rules into both apps.

## Add a dependency

Run these from the project root:

```powershell
npm.cmd --prefix frontend install package-name
npm.cmd --prefix backend install package-name
```

Use `-D` for development dependencies. Commit each application's `package-lock.json`. Root `package.json` contains only convenience commands and has no dependencies.

## Local infrastructure

`npm.cmd run dev` or `cd backend; npm.cmd run dev` automatically checks MongoDB. The default dedicated local replica set uses port 27018 and `backend/.local/mongo`. It runs in the background and keeps data between sessions. Atlas URLs are supported through `DATABASE_URL`; they are checked but not started by the helper.

Docker is optional. From backend, start its `docker-compose.yml` with `docker compose up -d` and set `DATABASE_URL=mongodb://127.0.0.1:27017/lexihive?replicaSet=rs0` in `backend/.env` before setup. Choose one database configuration deliberately; the default local command does not require Docker.

Browser tests and their Playwright configuration live under `frontend/e2e` and `frontend/playwright.config.ts`. Backend tests live under `backend/test`. Development/build helpers live under their owning app's `scripts` directory; documentation lives here in `backend/docs`. Private data is preserved in ignored `backend/.local`.

See [the main README](../../README.md) for daily commands.
