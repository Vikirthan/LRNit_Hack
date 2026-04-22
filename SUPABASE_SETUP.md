# Supabase Setup Guide for TicketScan

## Storage Buckets Required
**Only metadata is needed** — The current app does NOT require any file storage buckets. All data (teams, scores, logs, scans) is stored in database tables.

- ❌ No QR code storage needed (QR codes are generated on-the-fly)
- ❌ No CSV upload storage needed (parsed in-memory)
- ❌ No image storage buckets needed

---

## Complete Supabase Setup Checklist

### 1. **Create Project**
- Go to [supabase.com](https://supabase.com)
- Click "New Project"
- Fill in:
  - **Name**: TicketScan
  - **Database Password**: (save this securely!)
  - **Region**: Choose closest to your location
- Click "Create new project" (wait ~3 minutes for setup)

### 2. **Execute Database Schema**
1. Open your project → Click **"SQL Editor"** (left sidebar)
2. Click **"New Query"**
3. Copy entire contents of [supabase/schema.sql](supabase/schema.sql)
4. Paste into the SQL editor
5. Click **"Run"** (top right)
6. Wait for success message ✅

**Result**: 9 tables created
- `profiles` — User roles (admin, teacher, volunteer)
- `settings` — Break time & penalty rules
- `teams` — Team data from CSV import
- `team_emails` — Email list per team
- `break_sessions` — OUT/IN breaks with penalties
- `scan_logs` — QR scanner activity
- `penalty_adjustments` — Manual penalty changes
- `teacher_scores` — Evaluation scores (100-point rubric)

### 3. **Get API Keys**
1. Click **"Settings"** (left sidebar, bottom)
2. Click **"API"**
3. Copy these two keys:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **Anon Key** → `VITE_SUPABASE_ANON_KEY`

### 4. **Create `.env` File**
Create file: `ticketscan-app/.env`
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc... (your anon key)
```

### 5. **Configure Authentication (Optional for Production)**
If you want real Supabase Auth instead of demo mode:

**5a. Enable Email Auth**
1. Click **"Authentication"** → **"Providers"**
2. Enable **"Email"**
3. Under "Email Auth" → ensure "Confirm email" is toggled

**5b. Create Test Users** (Admin Panel)
1. Click **"Authentication"** → **"Users"**
2. Click **"Invite user"**
3. Add:
   - Email: `admin@demo.local` → Password: `Demo@123`
   - Email: `teacher@demo.local` → Password: `Demo@123`
   - Email: `volunteer@demo.local` → Password: `Demo@123`

**5c. Assign Roles via SQL**
Run in SQL Editor:
```sql
-- Insert profiles for each user
-- First, find user IDs from auth.users table, then:

insert into public.profiles (id, role, full_name, email)
values
  ('admin-user-id-here', 'admin', 'Admin User', 'admin@demo.local'),
  ('teacher-user-id-here', 'teacher', 'Teacher User', 'teacher@demo.local'),
  ('volunteer-user-id-here', 'volunteer', 'Volunteer User', 'volunteer@demo.local')
on conflict (id) do update
set role = excluded.role;
```

### 6. **Row-Level Security (RLS)**
Already included in schema.sql. Policies default to:
- ✓ Public read on most tables (for viewing)
- ✓ Authenticated write (for admin/teacher updates)
- ✓ Users can only modify their own data

### 7. **Test the Connection**
1. Update `.env` with your keys
2. Run locally:
   ```bash
   npm run dev
   ```
3. Try login with demo credentials:
   - Email: `admin@demo.local`
   - Password: `Demo@123`

---

## Data Structure After Setup

### Admin Flow
1. **Login** → `admin@demo.local`
2. **Upload CSV** with columns: `team_name, team_id, members_count, emails, room_number`
3. **Teams stored** in `public.teams` table
4. **View imported teams** via "View Imported Teams" button
5. **Set rules** (break time, grace time, penalties)
6. **Monitor live** scoreboard and activity log

### Teacher Flow
1. **Login** → `teacher@demo.local`
2. **Click "Refresh"** to load admin's imported teams
3. **Select team** → Score against 100-point rubric
4. **Click "Save Score"** → Stored in `public.teacher_scores` table
5. **Scores visible** in Admin → "Teacher Scores" tab

### Volunteer Flow
1. **Login** → `volunteer@demo.local`
2. **Scan QR** codes → Records in `public.scan_logs`
3. **Mark OUT/IN** → Breaks stored in `public.break_sessions`

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Cannot read property 'setUser'" | Check `.env` keys are correct |
| Teams not loading in Teacher page | Click "Refresh" button after admin import |
| Blank admin dashboard | Verify schema.sql executed successfully |
| "Invalid login credentials" | Ensure test users created in Auth panel |
| Emails not sent | Set `overdue_email_enabled: false` (Edge Functions not deployed yet) |

---

## Future Enhancements (Optional)

### Supabase Edge Functions (For Email Sending)
1. Click **"Functions"** (left sidebar)
2. Create new function: `send_qr_emails`
3. Deploy when needed for email alerts

### Brevo Webhook (Email Open/Click/Delivery Insights)
This project now includes:
- Edge Function: `brevo-webhook`
- Migration: `supabase/migrations/20260423_add_email_events_webhook.sql`

Setup steps:
1. Run the new migration in Supabase SQL Editor (or via your migration pipeline).
2. In Supabase project settings, add secret:
   - Key: `BREVO_WEBHOOK_SECRET`
   - Value: a strong random string
3. Deploy Edge Function:
   ```bash
   supabase functions deploy brevo-webhook
   ```
4. Use webhook URL in Brevo Transactional Webhooks:
   ```
   https://<your-project-ref>.supabase.co/functions/v1/brevo-webhook?token=<BREVO_WEBHOOK_SECRET>
   ```
5. In Brevo webhook event selection, enable at least:
   - `delivered`
   - `opened`
   - `clicked`
   - `hard_bounce`
   - `soft_bounce`
   - `blocked`
   - `spam`

Verification query:
```sql
select event_type, recipient_email, subject, event_time
from public.email_events
order by event_time desc
limit 50;
```

### Buckets (If Adding File Storage Later)
1. Click **"Storage"** → **"New bucket"**
2. Name: `qr-codes` (if saving QR as images)
3. Name: `reports` (if exporting PDFs)

---

## Quick Commands

```bash
# Test Supabase connection
npm run dev

# Build for production
npm run build

# View logs (if deployed)
supabase functions list
```

---

**Status**: Your app is ready to use with the provided Supabase credentials in `.env.example`. Just execute the schema.sql and you're good to go! 🚀
