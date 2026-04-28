# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
npm run start:prod   # via PM2

# PM2 management
npm run stop
npm run restart
npm run logs
npm run status

# Code quality
npm run lint         # ESLint
npm run format       # Prettier

# Database backup
npm run backup
```

## Environment Setup

Copy `.env.example` to `.env` before starting. Required variables:
- `JWT_SECRET` — must be set or server refuses to start
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — creates admin account on first run
- `RESEND_API_KEY` — optional; email notifications are silently skipped if absent
- `DATABASE_PATH` — optional; defaults to `database/database.sqlite` (set to a mounted volume path on Railway)
- `BASE_URL` — optional; used for password reset links (defaults to `http://localhost:3000`)

## Architecture

### Backend (`server/`)

Node.js/Express server with a flat architecture — all routes are defined inline in [server/server.js](server/server.js).

**Data layer** (`server/database.js`): Uses `sql.js` (SQLite compiled to WASM) with the entire database held in memory and written to disk on every mutation. The `SQLiteTable` class wraps raw SQL with a simple in-memory CRUD API (`readAll`, `findOne`, `findMany`, `insert`, `update`, `delete`). Four tables: `users`, `bookings`, `admins`, `holidays`. Schema migrations run automatically at startup via `ALTER TABLE ... ADD COLUMN` inside try/catch blocks.

**Auth** (`server/authService.js`): JWT tokens stored as HTTP-only cookies (7-day expiry). Two separate user stores: `admins` table (bcrypt hashed) and `users` table. Login checks admin table first, then regular users. Password reset uses JWT with `purpose: 'password-reset'` claim (1-hour expiry).

**Bookings** (`server/bookingService.js`): Slots are computed from config arrays in `config/config.js` (`businessHours.weekday` and `businessHours.saturday`). VIP/admin users get extra early and late slots. Group bookings (up to 3 people) consume consecutive slots. Each booking group shares a single hex token for self-service management. The 24-hour cancellation policy is enforced server-side.

**Email** (`server/emailService.js`): Uses the Resend API. Confirmation emails are fire-and-forget (do not block API response). SMTP config in `.env` is present for legacy reasons but the active integration is Resend.

**Middleware** (`server/middleware.js`): Single `authenticateToken` middleware reads JWT from cookie, attaches `req.user` with `isAdmin` flag.

### Frontend (`frontend/`)

Vanilla HTML/CSS/JS — no build step, no framework. Pages are served directly as static files.

**JS utilities** (`frontend/js/utils.js`): Shared `apiRequest()` wrapper for all fetch calls, date formatting helpers, `getCurrentUser()`, and redirect helpers. All API calls go through `/api` prefix.

**Theme** (`frontend/js/theme.js`): Manages `[data-theme="dark"]` attribute on `<html>` with localStorage persistence.

**Styles architecture**: Layered CSS using design tokens:
- `frontend/styles/tokens/global.css` — CSS custom properties for the entire design system (colors, spacing 8pt grid, typography, shadows, radii). Brand accent color is `--brand-accent: #FF6B00`.
- `frontend/styles/tokens/admin.css` — admin-specific tokens
- `frontend/styles/base/` — reset and typography
- `frontend/styles/components/` — reusable UI components
- `frontend/styles/layout/` — layout containers
- `frontend/styles/pages/` — page-specific overrides

### User Roles

Three tiers:
1. **Admin** — credentials in `admins` table, identified by `isAdmin: true` in JWT. Admin routes require `req.user.isAdmin` check.
2. **VIP** — regular users with `vip = 1` in `users` table. Get extra time slots visible on the booking calendar.
3. **Guest** — booking without account (`isGuest = 1`). No password, cannot log in, booking created via `POST /api/bookings/guest`.

### Business Logic Notes

- Available days are configured in `config.businessHours.daysOpen` (currently Mon–Sat, 0=Sunday). Time slots arrays in `businessHours.weekday.morning.slots` etc. are the source of truth for when appointments can be booked.
- `appointmentDuration` in config is set to 60 minutes but slot spacing is determined by the slot arrays, not this value.
- Holidays block individual slots (not entire days) and are stored in the `holidays` table.
- The `database/` directory is gitignored for the actual SQLite file but not for the directory itself.
