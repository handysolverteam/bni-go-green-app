# BNI Go Green — PALMS Score Tracker & WhatsApp Outreach Web App

![BNI Go Green Web App](https://img.shields.io/badge/BNI-Go_Green-22c55e?style=for-the-badge&logo=react)
![Supabase](https://img.shields.io/badge/Supabase-Database_&_Realtime-3ECF8E?style=for-the-badge&logo=supabase)
![Vite](https://img.shields.io/badge/Vite-Web_Framework-646CFF?style=for-the-badge&logo=vite)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript)

BNI Go Green is a web application designed for BNI Chapter Directors to track weekly member **PALMS** (Present, Absent, Substitute, Medical, Referrals, Visitors, TYFCB) statistics, compute 100-point Traffic Light scores, and send personalized WhatsApp nudges directly to members.

---

## 🌟 Key Features

* **🔐 Multi-Provider Authentication**:
  * Seamless Google Single Sign-On (Google OAuth 2.0 via Firebase & Supabase Auth).
  * 256-bit SSL encrypted director portal.

* **📊 100-Point Traffic Light Scoring Engine**:
  * **🟢 Green**: $\ge 70$ points (Top Performers)
  * **🟡 Amber**: $50 - 69$ points (Moderate)
  * **🔴 Red**: $30 - 49$ points (Needs Improvement)
  * **⚪ Grey**: $< 30$ points (Critical Attention)
  * Calculates points across 7 official categories: Attendance, CEUs, 1-2-1s, Referrals Given, TYFCB Closed Business, Visitors Brought, and Members Sponsored.

* **📈 Automated Level-Up Recommendations**:
  * Smart algorithm identifies exact numerical targets needed to elevate a member from Red $\rightarrow$ Amber or Amber $\rightarrow$ Green.

* **📥 1-Click Excel / CSV Import Engine**:
  * Built-in SheetJS parser for weekly BNI PALMS Excel reports (`.xlsx`, `.csv`).
  * Automatic column mapping, instant validation preview, and sample template generator.

* **💬 WhatsApp Outbound Outreach Manager**:
  * Pre-formatted performance nudge templates.
  * Direct 1-click **WhatsApp Web URL launcher** (`https://web.whatsapp.com/send?phone=...&text=...`).
  * Batch outreach queue with status tracking (Pending ⏳, Sent ✅, Failed ❌, Skipped ⏭️).

* **⚡ Supabase Real-Time Database**:
  * Live sync across all sessions without dummy or hardcoded mock data.
  * Instant Postgres change subscriptions (`postgres_changes`).

* **⚠️ Universal Confirmation Modals**:
  * Safeguards for destructive operations (Logout, Member Delete, Data Purge, Reset Defaults).

* **📱 Mobile-First Responsive Design**:
  * Liquid Glass design system.
  * Mobile navigation drawer and touch-optimized card layout.

---

## 🛠️ Technology Stack

* **Frontend**: React 19, Vite, TypeScript, TailwindCSS.
* **Database & Realtime**: Supabase Postgres & Realtime Engine (`oleckbfrkpmoikpkjcpa`).
* **Auth**: Firebase Auth & Supabase OAuth (Google Provider).
* **Excel Parsing**: SheetJS (`xlsx`).
* **Icons & UI**: Lucide React icons, Glassmorphism CSS.

---

## 🗄️ Supabase Database Schema

Run this SQL script in your **Supabase Dashboard $\rightarrow$ SQL Editor**:

```sql
-- 1. Members Table
CREATE TABLE IF NOT EXISTS public.members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    present INT DEFAULT 0,
    absent INT DEFAULT 0,
    substitute INT DEFAULT 0,
    medical INT DEFAULT 0,
    referrals_given INT DEFAULT 0,
    visitors INT DEFAULT 0,
    tyfcb NUMERIC DEFAULT 0,
    ceu NUMERIC DEFAULT 0,
    one_to_ones NUMERIC DEFAULT 0,
    sponsors INT DEFAULT 0,
    score INT DEFAULT 0,
    traffic_light TEXT DEFAULT 'Grey',
    join_date TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_user_member_name UNIQUE (user_id, name)
);

-- 2. Chapter Settings Table
CREATE TABLE IF NOT EXISTS public.chapter_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL UNIQUE,
    green_threshold INT DEFAULT 70,
    amber_threshold INT DEFAULT 50,
    red_threshold INT DEFAULT 30,
    custom_signature TEXT DEFAULT 'Keep the momentum going! 💪',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Outreach Logs Table
CREATE TABLE IF NOT EXISTS public.outreach_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    member_name TEXT NOT NULL,
    phone TEXT,
    status TEXT NOT NULL,
    message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Row Level Security
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public full access members" ON public.members FOR ALL USING (true);
CREATE POLICY "Public full access settings" ON public.chapter_settings FOR ALL USING (true);
CREATE POLICY "Public full access logs" ON public.outreach_logs FOR ALL USING (true);
```

---

## 🚀 Quick Start (Local Development)

1. **Clone Repository**:
   ```bash
   git clone git@github.com:handysolverteam/bni-go-green-app.git
   cd bni-go-green-app
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables** (`.env`):
   ```env
   VITE_FIREBASE_API_KEY=AIzaSyAO0wKilYOs8dbxwW1DmgqdRWLLCRk3_cQ
   VITE_FIREBASE_AUTH_DOMAIN=handydash-75858.firebaseapp.com
   VITE_FIREBASE_DATABASE_URL=https://handydash-75858-b95d2.asia-southeast1.firebasedatabase.app
   VITE_FIREBASE_PROJECT_ID=handydash-75858-b95d2
   VITE_GOOGLE_WEB_CLIENT_ID=18967278229-rq5dr7gs5l34mqdg1435g1iuttuvhj5q.apps.googleusercontent.com

   VITE_SUPABASE_URL=https://oleckbfrkpmoikpkjcpa.supabase.co
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Run Development Server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

5. **Build Production Bundle**:
   ```bash
   npm run build
   ```

---

## 📄 License & Credits

Developed by **HandySolver Team** for BNI Chapter Leaders worldwide.
