# TicketScan PWA

Progressive Web App for 24-hour hackathon attendance and break tracking.

## Stack

- React + Vite + vite-plugin-pwa
- Supabase Auth + Postgres + Edge Functions
- html5-qrcode for camera scanning
- IndexedDB (idb) for offline queueing

## Roles

- admin
- volunteer

Roles are stored in the `profiles` table and enforced with Supabase RLS.

## Features Implemented

- Role-based login and route protection
- Team CSV/XLSX import (`team_name, team_id, members_count, emails, room_number`)
- Secure JWT QR generation and verification via Supabase Edge Functions
- Volunteer scanner flow with camera + manual search fallback
- OUT / IN tracking with partial exits
- Break penalty logic:
  - `overage = max(0, duration - max_break_time - grace_time)`
  - `penalty = overage * penalty_per_minute`
- Constraints:
  - Prevent OUT without IN completion
  - Prevent IN without active OUT
  - One active OUT session per team
- Admin controls for break rules
- Manual penalty add/remove + reset score
- Dashboard with currently OUT teams and overdue highlighting
- Optional overdue email alerts
- Offline queue in IndexedDB and auto-sync on reconnect
- CSV export (`Team Name, Team Number, Negative Points`)
- PWA installability + service worker auto-update

## Project Structure

- `src/pages/AdminPage.jsx`
- `src/pages/VolunteerPage.jsx`
- `src/pages/LoginPage.jsx`
- `src/services/teamService.js`
- `src/services/scanService.js`
- `src/services/offlineQueue.js`
- `src/services/csvService.js`
- `src/services/exportService.js`
- `src/services/supabaseFunctions.js`
- `supabase/schema.sql`

## Setup

1. Install app dependencies:
   - `npm install`
2. Create `.env` from `.env.example` and fill Supabase project values.
3. Open the Supabase SQL editor and run `supabase/schema.sql`.
4. Create Supabase Auth users for Admin and Volunteer.
5. Insert matching rows into `profiles` with the correct `role`.
6. Deploy Supabase Edge Functions for QR token generation, verification, and email.
7. Configure any SMTP or email provider secrets used by the Edge Functions.
8. Run the app locally:
   - `npm run dev`
9. Build for production:
   - `npm run build`

## Notes

- QR signing and verification must happen server-side in Supabase Edge Functions.
- RLS is enforced from the `profiles.role` field.
- If Supabase env values are missing, the app now shows a setup message instead of crashing.
