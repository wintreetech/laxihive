# Backend

Express/TypeScript API using MongoDB through Prisma. Run commands from this folder:

```powershell
npm.cmd install
npm.cmd run dev
```

The API uses http://localhost:4000. Health: http://localhost:4000/api/health. Development checks the configured MongoDB replica set and automatically starts the dedicated local database when selected. Existing healthy LexiHive API processes are reused.

The development watcher compares source and `.env` contents before restarting. Database/log writes under `.local` and unchanged Windows file events do not restart the API.

On a fresh installation, configure `.env` and run `npm.cmd run setup` once before development. The current installation is already set up; no schema reset or new seed is required just to run it.

- `src/`: routes, controllers, services, middleware, config and operator jobs.
- `prisma/`: MongoDB schema, additional indexes and seed data.
- `shared/`: pure game engines/catalog/rules also imported by frontend.
- `scripts/`: startup, setup, database, backup and validation tools.
- `test/`: unit and isolated database integration tests.
- `docs/`: architecture, operating and deployment guides.
- `.local/`: ignored local MongoDB files, preserved old PostgreSQL files, backups and screenshots.
- `.env`: private database, payment and email configuration. Never commit it.

`APP_ORIGIN` in `.env` controls both the frontend URL and allowed browser origin. Vite reads the same setting. `PORT` controls this API. No second port setting is required.

Useful commands: `npm.cmd test`, `npm.cmd run test:integration`, `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd start`, `npm.cmd run db:check`, `npm.cmd run db:backup` and `npm.cmd run payments:check`.

Build output starts at `dist/src/index.js`. Stop this project's API before changing the Prisma schema and regenerating the client on Windows. Use `db:generate`, `db:migrate` and `db:seed` deliberately after schema/catalog changes; they are not ordinary restart steps.

First administrator: register and verify `support@lexihive.com` through the app, then run `npm.cmd run admin:provision -- --email support@lexihive.com` here. Refresh `/admin` using the same account and password.

Docker uses the repository as build context: `docker build -f backend/Dockerfile .` from the root. Docker Compose for an optional local database is in this folder. Atlas does not require Docker.

See [administrator setup](docs/ADMIN.md), [adding features](docs/STRUCTURE.md), [payments](docs/TRANSACTWORLD.md) and [the root guide](../README.md).
