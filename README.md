# 🗓 ShiftSync — Multi-Location Staff Scheduling Platform

## Overview

ShiftSync is a web-based staff scheduling platform for **Coastal Eats**, a fictional restaurant group with **4 locations** across **2 time zones**. It helps managers and staff manage shifts, reduce overtime, and distribute desirable shifts fairly.

This project is a **Priority Soft Full-Stack Developer Assessment take-home project**.

---

## 🛠 Tech Stack

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS, Shadcn, Lucide React, sonner
- **Backend:** Next.js Server Actions & Server Components, Prisma ORM, Supabase, Supabase Realtime
- **Authentication:** Auth.js (role-based: Admin, Manager, Staff)
- **Hosting:** Vercel
- **Other:** Environment variables for secrets, Next.js best practices (folder structure, caching, middleware guards)

---

## Features

### User Management & Roles

- Roles: **Admin**, **Manager**, **Staff**
- Middleware and route guards enforce role-based access
- Staff can have multiple skills and certifications
- Staff availability (recurring + exceptions)
- Admins see everything; managers see assigned locations only

### Shift Scheduling

- Create shifts: location, date/time, required skill, headcount
- Assign staff manually
- Publish/unpublish with cutoff (default 48h)
- Enforces: no double-booking, 10h gap between shifts, skill/location restrictions, availability windows
- Provides constraint violations feedback and alternative suggestions

### Shift Swapping & Coverage

- Staff can request swaps or drop shifts
- Manager approval workflow
- Pending swap/drop auto-cancel if shift edited
- Max 3 pending requests per staff
- Drop requests expire 24h before shift

### Overtime & Labor Compliance

- Daily/weekly/consecutive day warnings
- Overtime dashboard
- What-if analysis

### Fairness Analytics

- Hours distribution per staff
- Premium shift tracking
- Fairness scores

### Real-Time Updates

- Live schedule updates
- Notifications for swaps, drops, overtime
- Conflict detection for simultaneous assignments
- On-duty dashboard per location

### Calendar & Time Handling

- Correct timezone display per location
- Overnight shifts handled
- Recurring availability supports DST

### Audit Trail

- Logs all schedule changes (who, when, before/after)
- Managers can view shift history
- Admins can export logs for any date/location

---

## Login & Seed Data

- Seed file: `/prisma/seed.ts` (edge cases included)
- Default accounts:

| Role               | Email                                            | Password    |
| ------------------ | ------------------------------------------------ | ----------- |
| Admin              | admin@coastaleats.com                            | password123 |
| Manager LA         | manager.la@coastaleats.com                       | password123 |
| Manager SD         | manager.sd@coastaleats.com                       | password123 |
| Manager Miami      | manager.miami@coastaleats.com                    | password123 |
| Manager Charleston | manager.charleston@coastaleats.com               | password123 |
| Staff 1–20         | staff1@coastaleats.com … staff20@coastaleats.com | password123 |

> Login simplified: click role buttons to prefill email/password

---

## Known Limitations

- Staff handling, adding locations, and skills partially implemented
- Basic responsive design; limited mobile polish/animations
- No unit/integration/e2e tests
- Some edge requirements skipped due to time
- Focused on backend correctness and real-time features

---

## Intentional Ambiguity Decisions

1. Existing shifts remain if staff de-certified
2. Desired hours guide fairness; do not override availability
3. Any shift counts for consecutive days calculation
4. Swaps auto-canceled if shift edited before occurrence
5. Timezone boundary handled using location’s primary timezone

---

## Folder Structure & Middleware

```text
/app
  (auth)
    /login
    /unauthorized
  (root)
    (admin)
      /analytics
      /audit
    /dashboard
    /notifications
    /schedule
    /swaps
/components   → Reusable UI components
/lib          → Utilities, Prisma client, Supabase helpers
/prisma       → Schema + seed.ts
/lib/actions  → Server actions & logic
/styles       → Tailwind config + global CSS
```

### Middleware

- Protected routes: require login
- Admin/Manager only routes: /audit, /analytics
- Public routes: /login, /unauthorized
- Logic: redirects to /login or /unauthorized based on JWT session & role

```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function proxy(request: NextRequest) { ... }
export const matcher = ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|login|unauthorized).*)'];
```

---

## Deployment

- Hosted on Vercel
- Requires environment variables (Supabase keys, JWT secret, etc.)

---

## Evaluation Scenarios

1. Sunday Night Chaos: drop request → notifications → replacement
2. Overtime Trap: warnings at 35h, blocks over 12h/day or 7 days
3. Timezone Tangle: multiple timezones, shifts show correctly
4. Simultaneous Assignment: conflict notification prevents double booking
5. Fairness Complaint: distribution report & fairness score
6. Regret Swap: canceled on staff reversal → notifications

---

## Notes

- AI tools used to clarify requirements & speed workflow
- Focus on backend, edge cases, and real-time functionality
- Prioritized functionality over polish

---

## Links

- Deployed App: [Vercel Link]
- Repository: [GitHub Repository Link]

---

## Scripts

```bash
npm install
npm run dev
npx prisma db seed
npm run build
npm start
```
