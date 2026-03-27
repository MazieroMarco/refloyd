# Re:Floyd

Re:Floyd is a lightweight rehearsal tracker for bands. It lets you manage songs, count rehearsals, leave improvement notes, mention band profiles, and track which mentioned notes are still open or already done.

The project is split into a small vanilla JavaScript frontend and an Express + Postgres backend.

## Features

- Track songs with optional cover artwork
- Increase or decrease rehearsal count for each song
- Leave song-specific improvement notes
- Mention profiles inside comments with `@Profile Name`
- Force profile selection before using the app
- Optional OIDC access control before entering the app
- Open a dedicated profile detail page to see all mentions
- Mark mentioned notes as `DONE` per profile
- Rename, add, switch, and delete profiles
- Persist rehearsal data in Postgres

## Stack

- Frontend: Vanilla JavaScript, Vite, plain CSS
- Backend: Node.js, Express
- Database: PostgreSQL via `pg`
- Uploads: `multer`

## Project Structure

```text
.
├── client/                  # Vite frontend
│   ├── public/              # Manifest, icons, service worker
│   ├── src/
│   │   ├── components/      # Shared UI pieces
│   │   ├── pages/           # Route-level screens
│   │   ├── styles/          # Global CSS
│   │   ├── api.js           # Frontend API client
│   │   └── main.js          # Router and app bootstrap
│   └── vite.config.js
├── server/                  # Express API and Postgres setup
│   ├── routes/              # Songs, comments, profiles
│   ├── services/            # Mention synchronization helpers
│   ├── db.js                # Postgres connection and schema bootstrap
│   └── index.js             # Server entrypoint
└── README.md
```

## Requirements

- Node.js 18+ recommended
- npm

## Local Development

Install dependencies in both workspaces:

```bash
cd server
npm install

cd ../client
npm install
```

Before starting the backend, set a Postgres connection string. `server/.env` is the intended place for local development:

```bash
cd server
cp .env.example .env
```

Set `DATABASE_URL` in `server/.env` to your hosted Postgres database, then run the backend:

```bash
cd server
npm run dev
```

Run the frontend in a second terminal:

```bash
cd client
npm run dev
```

Open the app at:

```text
http://localhost:5173
```

The Vite dev server proxies `/api` and `/uploads` to the backend on `http://localhost:3001`.

For production, the frontend also loads a separate runtime config file at `client/public/app-config.js`. You can point the built app at a different backend URL there without rebuilding the JavaScript bundle.

## Database Configuration

The backend now requires Postgres. Set these values on the server:

- `DATABASE_URL` — required Postgres connection string
- `DATABASE_SSL` — optional override for SSL (`true` or `false`)
- `DATABASE_SSL_REJECT_UNAUTHORIZED` — optional SSL certificate validation toggle, defaults to `false` when SSL is enabled

If `DATABASE_SSL` is left unset, Re:Floyd enables SSL automatically for non-local Postgres hosts and leaves it off for `localhost`.

## OIDC Access Control

Re:Floyd can require OIDC sign-in before someone can access the app. That sign-in is only used as an access gate. After login, the person still chooses any in-app profile exactly like before.

OIDC stays disabled until you configure it. Once enabled, the backend protects `/api` and `/uploads`, and the frontend shows a login screen until the browser has a valid session.

The backend now loads `server/.env` automatically on startup. A root `.env` also works as a fallback, but `server/.env` is the intended location for the backend settings.

If your frontend and backend are hosted on different public origins in production, also set `BACKEND_ORIGIN` on the server and `backendUrl` in `client/public/app-config.js`.

### Required server environment

- `DATABASE_URL` — the Postgres connection string used by the backend
- `APP_ORIGIN` — the public browser origin for the app. In local development this should be `http://localhost:5173`
- `BACKEND_ORIGIN` — optional public origin for the backend when it is hosted separately from the frontend
- `OIDC_ISSUER_URL` or `OIDC_DISCOVERY_URL` — your provider issuer or full discovery URL
- `OIDC_CLIENT_ID` — the OIDC client ID registered for Re:Floyd

### Optional server environment

- `OIDC_ENABLED=true` — force-enable OIDC even if some values are injected later by your runtime
- `OIDC_CLIENT_SECRET` — required for confidential clients
- `OIDC_CLIENT_AUTH_METHOD` — `client_secret_basic`, `client_secret_post`, or `none`
- `OIDC_SCOPE` — defaults to `openid profile email`
- `OIDC_PROVIDER_NAME` — label shown in the login UI
- `OIDC_SESSION_TTL_HOURS` — local session lifetime, defaults to `12`
- `OIDC_SESSION_COOKIE_SAME_SITE` — cookie SameSite policy, defaults to `Lax`
- `OIDC_AUTHORIZATION_EXTRA_PARAMS` — extra auth request params as a query string, for example `prompt=login&audience=https%3A%2F%2Fapi.example.com`

### Local development callback

Register this callback URL with your identity provider:

```text
http://localhost:5173/api/auth/callback
```

That path is handled by the Express backend through the Vite dev proxy, which keeps the session cookie on the frontend origin during local development.

## Available Scripts

### Frontend (`client/`)

- `npm run dev` starts the Vite dev server on port `5173`
- `npm run build` creates a production build in `client/dist`
- `npm run preview` previews the production build locally

### Backend (`server/`)

- `npm run dev` starts the Express API with `nodemon`
- `npm start` starts the Express API with Node
- `npm run migrate:sqlite` copies data from `server/data.db` into an empty Postgres database

## Data and Storage

Re:Floyd stores its application data in Postgres. Uploaded song and profile images still live on the server filesystem in:

- `server/uploads/` for uploaded song cover images

If you already have local SQLite data in `server/data.db`, you can move it into an empty Postgres database with:

```bash
cd server
npm run migrate:sqlite
```

You can also point the migration at a different SQLite file with `SQLITE_PATH=/absolute/path/to/file.db npm run migrate:sqlite`.

The migration intentionally stops if the Postgres database already contains app data.

On startup, the backend also synchronizes stored comment mentions so profile mention status stays consistent after profile renames or schema updates.

## Default Ports

- Frontend: `5173`
- Backend: `3001` by default, configurable through `PORT`

## Main Concepts

### Songs

Songs can have:

- a name
- an optional cover image
- a rehearsal counter
- a list of comments / improvement notes

### Profiles

Profiles represent band members or personas inside the app. A profile must be selected before using the UI.

These profiles are intentionally separate from OIDC identities. Authentication only decides who may enter Re:Floyd; it does not map a signed-in account to a specific profile.

Each profile can:

- be mentioned in comments
- be renamed
- view all comments where it was mentioned
- mark those mentions as open or done

### Comments and Mentions

Comments are attached to songs. A comment can mention one or more profiles using `@Name`.

The backend maintains a `comment_mentions` relation so:

- mentions survive profile renames
- each profile can manage its own done/open state independently
- profile detail pages can show relevant notes without re-parsing everything in the browser

## API Overview

### Songs

- `GET /api/songs`
- `GET /api/songs/:id`
- `POST /api/songs`
- `PATCH /api/songs/:id/rehearsal-count`
- `DELETE /api/songs/:id`

### Comments

- `GET /api/songs/:songId/comments`
- `POST /api/songs/:songId/comments`
- `PATCH /api/comments/:id/status`
- `DELETE /api/comments/:id`

### Profiles

- `GET /api/members`
- `GET /api/members/:id/comments`
- `POST /api/members`
- `PATCH /api/members/:id`
- `DELETE /api/members/:id`

## Git Notes

This repository ignores:

- dependencies
- build output
- local editor files
- legacy SQLite database files
- uploaded images
- environment files

That makes it safe to publish the source without leaking local runtime state.

## Publishing Checklist

Before pushing the repository to GitHub, it is worth checking:

1. `client/node_modules` and `server/node_modules` are not tracked
2. `server/uploads/` and any legacy `server/data.db*` files are not tracked
3. `client/dist/` is not tracked unless you explicitly want built assets in Git
4. you add a `LICENSE` file if you want the repo to be open source

## License

No license file is included yet. Add one before publishing if you want to grant reuse permissions.
