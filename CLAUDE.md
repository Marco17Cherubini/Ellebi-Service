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
npm run build:3d       # bundle client-src/garage3d.js into client-src/build/ (ignored, not published)
npm run render:stills  # car still of the entry page from the 3D model (Playwright)
npm run test:e2e       # browser e2e (Playwright + Chromium, local only)
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
- Frontend: static pages in `frontend/`, one script per page in `frontend/js/`, shared helpers in `utils.js` (`apiRequest`, `escapeHTML`, `setupSidebar`, `makeKeyboardActivatable`, `parseLocalDate`). One booking flow for guests and customers (`prenota.html` + `booking-flow.js`, also served at `/guest-booking` and `/dashboard`); client area `home.html` (also `/bookings`); admin day view `admin-agenda.js` (loaded after `admin.js`, uses its globals). CSS layers: `styles/tokens → base → layout → components → pages`, imported by `styles.css`; dark theme is the default (`[data-theme='light']` overrides). Design system: `DESIGN.md` at the root (direction B "L'insegna": dark stage for presenting, light `.sheet` for booking/sign-in/client area via token remapping, admin dark and sober; Ellebi orange for actions, blue for structure and light; Saira Condensed 600 titles, Barlow text). Fonts are self-hosted in `frontend/fonts/`. The logo is `images/logo-ellebi.svg` (vector trace of the original raster, which stays for the legal pages); on the entry page it is the round sign (`.sign`) behind the car.
- Entry page `index.html` (as in the original app): sign with the logo, car still `images/auto-assemblata.webp`, and only Accedi / Registrati / Prenota come ospite. Same page with or without a session; no public page links to `/admin` (`test/entry.test.js`). No price list, menus or session-dependent links on it.
- 3D: `client-src/garage3d.js` (Three.js) is not published; it only renders the entry car still (`npm run build:3d && npm run render:stills`). Never add 3D to pages.
- Mobile first in percentages: widths of pages, columns, cards, dialogs and menus are `%` (or `fr`), the side margin `--gutter` is `5vw`; px only for small elements (icons, checkboxes, switches) and 44–48 px touch minimums; breakpoints in `em` (`test/css-units.test.js`). No page wider than the screen at 360–430 px in any role (`test/e2e/mobile-layout.e2e.js`); tables become cards on phones; horizontal scroll only for the booking day strip.
- Admin pages (also as `.html`) require an admin session and the client area a customer session (`pageGuard` in `routes/pages.js`, before the static files); APIs are protected separately.
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
