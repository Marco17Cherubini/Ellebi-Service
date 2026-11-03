# CLAUDE.md

Guidance for Claude Code when working in this repository. Keep it limited to current facts: commands, conventions, constraints.

## Commands

```bash
npm install
npm run dev            # auto-reload (nodemon)
npm start              # http://localhost:3000
npm test               # node:test suite (real server, temporary SQLite file)
npm run lint           # ESLint
npm run format:check   # Prettier check (npm run format writes)
npm run seed           # demo data, only on a database without bookings
npm run backup         # copy DATABASE_PATH into BACKUP_DIR (keeps 4)
npm run start:prod     # PM2 (process name lb-service, one instance)
npm run build:3d       # rebuild frontend/js/garage3d.js from client-src/ (commit the output)
```

Run lint, format:check and test before committing; CI runs the same on Node 22 and 24.

## Environment

Copy `.env.example` to `.env`. `JWT_SECRET` is required (the placeholder is refused). `ADMIN_EMAIL`/`ADMIN_PASSWORD` create the admin on first start. Optional: `DATABASE_PATH`, `BACKUP_DIR`, `BASE_URL`, `TZ` (default Europe/Rome), `RETENTION_ENABLED` (default on only with `NODE_ENV=production`), `RESEND_API_KEY` (emails are skipped without it), `RATE_LIMIT_AUTH_MAX`, `RATE_LIMIT_GUEST_MAX`.

Never point development or tests at a real database; never enable email sending or retention in tests (`test/helpers.js` sets a temporary `DATABASE_PATH`, empty `RESEND_API_KEY`, `RETENTION_ENABLED=false`).

## Architecture

- `server/server.js` startup (config checks, `initDatabase`, retention if enabled, listen, exports `serverReady`); `server/app.js` builds the Express app.
- `server/routes/` HTTP only: `auth`, `bookings` (customer, guest, slots, public price list, vehicles), `admin` (calendar, clients, holidays, settings, reports), `catalog` (price list CRUD), `deposits`, `pages`. Admin routes use `[authenticateToken, requireAdmin]`.
- Services hold the rules and throw `HttpError` / `badRequest` from `server/errors.js` (one error handler; unexpected errors become a generic 500):
  - `bookingService` availability (`computeAvailableSlots`, interval-based), customer/guest/admin bookings, drop-offs with deposit, moves, cancellations, work-block scheduling, admin calendar view;
  - `depositService` capacity (`maxDeposits` setting), states `in_attesa | in_corso | standby | completato`, deposit board;
  - `catalogService` (price list, durations, seasonal filter), `holidayService`, `vehicleService`, `reportService`, `authService`, `emailService`, `retentionService`, `dates`.
- `server/database.js`: sql.js (SQLite in memory) with `SQLiteTable` (`readAll`, `findOne`, `findMany`, `insert` → id, `update`, `delete`) and a column whitelist per table. `saveDatabase()` writes atomically (temp file + rename); `withTransaction(fn)` for multi-row changes (fn must be synchronous). Schema migrations run at startup (`ALTER TABLE ... ADD COLUMN` in try/catch). Tables: users, admins, bookings, holidays, settings, vehicles, services, deposits, notifications (unused).
- Frontend: static pages in `frontend/`, one script per page in `frontend/js/`, shared helpers in `utils.js` (`apiRequest`, `escapeHTML`, `setupSidebar`, `makeKeyboardActivatable`, `parseLocalDate`). One booking flow for guests and customers (`prenota.html` + `booking-flow.js`, also served at `/guest-booking` and `/dashboard`); client area `home.html` (also `/bookings`); admin day view `admin-agenda.js` (loaded after `admin.js`, uses its globals). CSS layers: `styles/tokens → base → layout → components → pages`, imported by `styles.css`; dark theme is the default (`[data-theme='light']` overrides). Design system: the Bugatti `DESIGN.md` from awesome-design-md (pure black, uppercase letter-spaced Saira Condensed titles at weight 400, EB Garamond body, JetBrains Mono for buttons/labels/times, hairlines not shadows, pill buttons, no radius elsewhere; the logo's copper `#d97030` is the only accent, kept for the main action). Fonts are self-hosted in `frontend/fonts/`. The original logo file is shown untouched on a white plate (`.brand`); `images/motivo-battistrada.svg` is a trace of its circle and tread.
- 3D: source `client-src/garage3d.js` (ES module, Three.js), bundled by esbuild into `frontend/js/garage3d.js` (ignored by ESLint/Prettier). Only `landing.js` imports it, dynamically; the WebP stills in `frontend/images/` are rendered from the same model and must stay the default. The car is the home page menu: the five parts (`carrozzeria`, `cabina`, `motore`, `telaio`, `ruote`) open panels; label positions for the still image are the `data-x-…`/`data-y-…` attributes on `.hotspot` in `index.html` and must be regenerated (render script projecting `api.positions()`) whenever anchors, camera or poses in `garage3d.js` change. Never add it to booking or admin pages.
- `/api/auth/session` returns `{ user: null }` (200) for anonymous visitors; `/api/auth/me` requires a session. JWTs carry `sv` (session version), checked on every request.

## Business rules (see config/config.js)

- 15-minute grid. Mon–Fri 08:30–12:30 and 14:30–18:30, Saturday 08:30–12:00, Sunday closed. A booking must fit entirely inside one shift.
- Duration comes from the service (`services.durata_minuti`); drop-off services (`tipo_servizio = 'consegna'` or name containing "consegna") book a fixed 30-minute reception and create a deposit; each `extra_work` block is 15 minutes.
- One schedule: no overlap between bookings, work blocks and holidays, for the admin too.
- Customers and guests: business hours only. VIP customers and the admin: extended set (08:00 and evening slots) without the lunch-break barrier.
- No cancellation deadline. Holidays block single 15-minute slots.

## Conventions and constraints

- Code comments and UI text in Italian; README in English; Conventional Commits.
- No inline scripts or `on*=` attributes (CSP `script-src 'self'`, `script-src-attr 'none'`); escape every user value with `escapeHTML` before using `innerHTML`.
- Calendar dates: use `server/dates.js`, never `toISOString()` for a day.
- Do not change schema, field meaning or business rules silently; add a test for every bug fix (`test/*.test.js`).
- Do not run retention (`node server/retentionService.js --apply`) or any data-changing script against a real database without an explicit decision.
- The decisions and history of the 2026 refactoring are in `docs/refactoring-plan.md`.
