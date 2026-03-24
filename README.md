# ClockMate

A mobile-first Progressive Web App (PWA) for small business workforce management. Replaces paid tools like When I Work with employee shift scheduling, kiosk-based clock in/out, time off management, and payroll summaries — all in one app, hosted for $0.

## Features

- **Shift Scheduling** — When I Work-inspired week grid with drag-copy, publish flow, and conflict detection
- **Kiosk Mode** — Dedicated tablet screen for employee clock in/out with PIN entry and GPS capture
- **Timesheets** — View and manually edit clock records with auto/forgot clock-out flags
- **Payroll Summary** — Hours × rate per employee, configurable pay periods, CSV export
- **Time Off** — Employee requests with admin approve/deny workflow
- **Role System** — Admin, Granted Admin, Employee, and Kiosk roles with permission controls
- **PWA** — Installable on iPhone via Safari, no App Store needed

## Tech Stack

- **Frontend:** React + Tailwind CSS + Vite
- **Database:** Supabase (PostgreSQL + Row Level Security)
- **Hosting:** Vercel (free tier)
- **Icons:** Lucide React
- **Font:** Inter (Google Fonts)

## Getting Started

1. **Create a Supabase project** at [supabase.com](https://supabase.com)
2. **Run the migration** — paste `supabase/migration.sql` into the Supabase SQL Editor and run it
3. **Configure environment** — copy `.env.example` to `.env` and fill in your Supabase URL and anon key
4. **Install and run:**
   ```bash
   npm install
   npm run dev
   ```
5. **Default accounts:** Admin PIN `0000`, Kiosk PIN `9999` (change after first login)

## Deployment

Push to GitHub and connect the repo to [Vercel](https://vercel.com). Add the two `VITE_SUPABASE_*` env variables in Vercel project settings. Every push auto-deploys.

**Total cost: $0/month** (Supabase + Vercel + GitHub free tiers).
