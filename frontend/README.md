# Frontend

React/Vite customer and administrator application. From this folder:

```powershell
npm.cmd install
npm.cmd run dev
```

Open http://localhost:5174 and run the backend in a separate terminal. The launcher reuses an existing healthy LexiHive frontend instead of crashing on a second start. An unrelated service occupying the configured port produces an actionable error; the launcher never silently changes ports.

- `src/pages/`: application screens and routes.
- `src/components/`: reusable interface components.
- `src/lib/`: API client, authentication and checkout helpers.
- `public/`: static assets.
- `e2e/`: browser tests.
- `scripts/`: development, deployment and browser-test helpers.
- `vite.config.js`: reads the frontend URL/API port from `../backend/.env` for development.
- `.env`: public `VITE_` settings only; keep `VITE_API_URL=/api`.

Game rules are imported from `../backend/shared`; keep both folders together when building. Backend secrets are read only by Node-based development configuration and never exposed as VITE_ variables.

Commands: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run preview`, `npm.cmd run test:e2e`. The browser suite uses the backend's separate local fixture database on ports 4011/5185 and needs backend dependencies installed.

Netlify configuration lives in `netlify.toml`. Select frontend as the build base and ensure backend/shared remains available in the repository checkout. Set API_PROXY_TARGET to the public HTTPS API origin so deployment uses same-origin API requests and cookies. Build output is `dist`.

See [running both apps](../README.md) and [adding features](../backend/docs/STRUCTURE.md).
