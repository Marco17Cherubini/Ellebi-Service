# LB Service — Project Context

## Overview

LB Service is a web-based CRM and booking management system built for a **mechanic workshop** (officina meccanica). The project originated as a fork and adaptation of **Lev Space**, an open-source barbershop CRM, and has been progressively refactored to fit the operational model of an automotive service centre rather than a hair salon.

The system is built on a **Node.js / Express** backend with a **vanilla HTML/CSS/JS** frontend (no framework, no build step). Data is persisted in a **SQLite database** (via `sql.js`, loaded entirely in memory at startup and flushed to disk on every write). Email notifications are handled via the **Resend** API.

---

## Starting Point

The baseline inherited from Lev Space includes:

- **Appointment calendar** — weekly admin grid (Mon–Sat) with configurable time slots, holiday blocking, and drag-and-drop rescheduling
- **User accounts** — registration, login, JWT auth (HTTP-only cookies), password reset via email
- **Guest booking** — multi-step flow (group size → date/time → contact details → confirmation) without requiring an account
- **Admin area** — calendar management, client list, VIP flag toggle, banned users, weekly reports
- **Booking service field** — a dropdown on the admin booking form with initial services: Tagliando, Revisione, Cambio gomme
- **Email notifications** — booking confirmations sent via Resend (fire-and-forget)
- **Role system** — three tiers: Admin (full access), VIP (extra early/late slots), Guest (no account required)
- **Responsive UI** — mobile-first design with sidebar hamburger menu, dark mode support, Apple-inspired design tokens

Cosmetic and UX improvements already applied during this session:
- Logo moved from the header into the hamburger sidebar
- Admin calendar header cells now display day of week and DD/MM date on separate lines
- Cell height reduced for better mobile density
- Legend band extended to full calendar width with no gap between legend and grid
- Navigation arrows visually lightened
- Column widths balanced for mobile

---

## Destination — Target CRM

The goal is to evolve LB Service into a **full-featured mechanic workshop CRM**. The following capabilities are planned, in rough priority order:

### 1. Vehicle Registry
Each customer should have one or more vehicles on file. A vehicle record contains:
- License plate (targa) — primary identifier
- Make, model, year
- Engine displacement (cilindrata) — used by the invoice calculator
- Fuel type
- Current mileage (updated at each visit)
- MOT / revision expiry date

Vehicles are linked to a customer and appear in the customer profile. Bookings should optionally reference a specific vehicle.

### 2. Intervention History per Vehicle
Every completed appointment should be archived as a permanent **intervention record** linked to the vehicle (not just left as a calendar slot). Each record stores: date, mileage at time of service, services performed, parts used (free text for now), technician notes, and amount paid. This history must be browsable from the admin client view and eventually from a customer-facing dashboard.

### 3. Payment History per Customer
A dedicated section in the customer profile listing all past interventions with their costs, allowing the admin to see total spend per customer and filter by date range or service type.

### 4. Service Catalogue with Duration and Price Tiers
Services should have structured definitions including:
- Name and description
- Estimated duration in minutes (so the calendar can block the correct number of consecutive slots)
- Base price (or price range by engine displacement / vehicle category)
- Whether the service triggers an automatic reminder (see §5)

Initial services: Tagliando, Revisione, Cambio gomme. More to be added over time.

### 5. Automatic Reminder System
For services that require periodic renewal (e.g. Tagliando, Revisione), the system should automatically send a reminder email to the customer a configurable number of days before the next expected service date. The trigger date is calculated from the last intervention date plus the service interval. This feature is opt-in per service type and can be toggled per customer.

The existing Resend email integration will handle delivery. A background scheduler (e.g. a daily cron via PM2 or a lightweight node-cron job) will check pending reminders each morning.

### 6. Invoice / Price Estimator
An admin-only tool (initially) that generates a cost estimate for a job based on:
- Selected services
- Vehicle engine displacement (cilindrata)
- Any additional labour or parts entered manually

The estimator produces a **printable PDF estimate** — no online payment is involved; all transactions are physical. In a later phase, customers will be able to request an estimate from their dashboard, giving them a ballpark cost before booking.

### 7. Customer-Facing Dashboard Enhancements
The existing user dashboard currently only shows a booking calendar. It should be extended to show:
- Upcoming appointments
- Past intervention history for their vehicles
- Vehicle list with next reminder dates
- Ability to request a price estimate

### 8. Reporting and Financial Dashboard
Extending the existing "Resoconto Clientela" admin report with:
- Revenue by period (day / week / month / year)
- Most requested services
- Most valuable customers (by total spend)
- Upcoming reminders scheduled for the next N days

---

## Out of Scope (for now)

- **Spare parts inventory / warehouse management** — explicitly excluded from the current roadmap
- **Online payments** — all transactions are in-person; the system provides estimates only
- **Multi-technician scheduling** — single workshop assumed for now

---

## Tech Stack Reference

| Layer | Technology |
|---|---|
| Runtime | Node.js (v22) |
| Framework | Express |
| Database | SQLite via sql.js (in-memory + file flush) |
| Auth | JWT in HTTP-only cookies (bcryptjs) |
| Email | Resend API |
| Frontend | Vanilla HTML / CSS / JS |
| Process manager | PM2 (`lb-service` app name) |
| Deployment target | Railway (volume mount for DB persistence) |

---

## Key File Map

| Path | Purpose |
|---|---|
| `server/server.js` | All API routes (flat architecture) |
| `server/database.js` | SQLiteTable class, schema, in-memory DB init |
| `server/bookingService.js` | Booking business logic |
| `server/authService.js` | Auth, login, JWT, user management |
| `server/emailService.js` | Resend email templates and dispatch |
| `config/config.js` | Business hours, slot arrays, studio info |
| `frontend/admin.html` | Admin calendar page |
| `frontend/styles/pages/admin.css` | Admin calendar styles |
| `frontend/styles/tokens/global.css` | Design tokens (colours, spacing, typography) |
| `frontend/js/admin.js` | Admin calendar logic, drag-and-drop, modals |
| `frontend/js/utils.js` | Shared `apiRequest()`, date helpers |
| `database/database.sqlite` | Persistent SQLite file (gitignored content) |
| `.env` | Runtime secrets (JWT, Resend key, admin credentials) |
