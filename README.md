# CT Lotto Lab

CT Lotto Lab is a local-first CT Lotto! tracker, analytics workspace, and number picker. It imports official CT Lottery results, keeps them up to date automatically, tracks picker-mode backtests over time, and generates rules-valid tickets for entertainment-only use.

The app does not claim to predict future winning numbers.

## What It Does

- Imports historical CT Lotto! results from HTML or text exports
- Automatically syncs new CT Lotto! draw results from the official CT Lottery site
- Refreshes latest draw, next draw, estimated jackpot, and estimated cash value on startup and during the sync cycle
- Shows whether the latest draw had a jackpot-winning ticket
- Tracks repeated winning combinations and number frequency trends
- Stores daily backtest tickets for each picker mode and evaluates them against the next official draw
- Includes a `Low-Split Random` strategy that avoids common human-picked patterns
- Lets you surface favorite strategy picks directly on the dashboard

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + TypeScript
- Database: SQLite
- Parser: cheerio
- Validation: zod
- Charts: Recharts
- Testing: Vitest
- Docker: Docker + Docker Compose

## Project Structure

- `client/`: React frontend
- `server/`: Express API, sync logic, parsing, SQLite access, tests
- `shared/`: shared TypeScript types and game configuration
- `scripts/`: Windows helper scripts for Docker workflows

## Local Development

Install dependencies:

```bash
npm install
```

Start the app in development mode:

```bash
npm run dev
```

Default local ports:

- API: `http://localhost:4000`
- Vite client: `http://localhost:5173`

## Docker

Start local Docker mode:

```bash
docker compose up -d
```

Stop local Docker mode:

```bash
docker compose down
```

The default Docker-served app URL is:

- `http://localhost:5181`

Docker development mode mounts the source tree for live editing and keeps `node_modules` inside Docker where possible.

## Production Docker

Start production-style containers:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Stop production-style containers:

```bash
docker compose -f docker-compose.prod.yml down
```

Production mode builds the client into static assets, serves them through nginx, runs the API separately, and uses `restart: unless-stopped`.

## Environment Variables

Copy `.env.example` to `.env` if you want to customize local values.

- `APP_PORT`: Docker-exposed app port
- `API_PORT`: backend port
- `DATABASE_PATH`: SQLite file path

## Data Import

The repo includes sample/history source files such as:

- `lottoresults.txt`
- `ctlottery-backfill-2000-2020.html`

Seed local history into SQLite:

```bash
npm run db:seed
```

You can also use the app's Import page to upload a CT Lotto! results file manually.

Duplicate draw dates are skipped safely instead of being inserted twice.

## Picker Modes

- `Random`: fully random valid ticket
- `Hot`: leans toward historically frequent numbers
- `Cold`: leans toward historically less frequent numbers
- `Low-Split Random`: avoids common human-picked patterns like birthdays, sequences, and neat-looking combinations
- `Balanced`: mixes hot, neutral, and cold numbers
- `Weighted`: random with historical frequency weighting
- `Smart`: weighted scoring with additional shape and balance rules

## Dashboard And Insights

### Dashboard

The dashboard is optimized for quick daily use:

- latest draw numbers
- jackpot-winner status for the latest draw
- next draw
- estimated jackpot
- estimated cash value
- favorite quick-pick strategy cards for the next draw

### Insights

The Insights section contains the heavier analysis:

- repeated winning combinations
- hot and cold number summaries
- picker-mode backtests
- human-likeness tracking
- frequency charting

### Number Table

The Number Table page provides the detailed per-number stats grid.

## Automatic Sync

On startup, the backend:

1. refreshes current Lotto game details from the official CT Lottery Lotto page
2. syncs missing draw results when needed
3. evaluates and stores daily picker backtest runs

After startup, the app keeps polling on its scheduled sync cycle. If a same-day sync attempt fails, it will retry later that same day until a successful sync occurs.

## Tests

Run the server test suite:

```bash
npm test
```

Build the full project:

```bash
npm run build
```

## Windows Helper Scripts

- `scripts/start.bat`
- `scripts/stop.bat`
- `scripts/restart.bat`
- `scripts/logs.bat`
- `scripts/open.bat`

## App Master

This project supports App Master integration through a local `app-master.json` file, but that file is intentionally ignored from Git because it contains machine-specific local paths.

## Troubleshooting

- If Docker Desktop is not running, start it before using any compose command.
- If the configured app port is already in use, change `APP_PORT` in `.env`.
- If dependency changes are not reflected in Docker, rebuild with:

```bash
docker compose up -d --build
```

## Disclaimer

Lottery drawings are random. Historical results and picker heuristics do not guarantee future outcomes. CT Lotto Lab is intended for analysis, experimentation, and entertainment only.
