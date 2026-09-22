# Handychapter — PALMS Score Tracker & WhatsApp Outreach Web App

![Handychapter Web App](https://img.shields.io/badge/Handychapter-Chapter_Ops-22c55e?style=for-the-badge&logo=react)
![Supabase](https://img.shields.io/badge/Supabase-Database_&_Realtime-3ECF8E?style=for-the-badge&logo=supabase)
![Vite](https://img.shields.io/badge/Vite-Web_Framework-646CFF?style=for-the-badge&logo=vite)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript)

Handychapter is a multi-tenant, role-based web application designed for BNI Chapter Directors, Owners, Admins, and Members to track weekly **PALMS** (Present, Absent, Substitute, Medical, Referrals, Visitors, TYFCB) statistics, compute 100-point Traffic Light scores, and manage organization team permissions
--- 
## 🌟 Key Features

* **🖥️ Responsive 240px Sidebar & Mobile Drawer**:
  * Desktop ($\ge 1024\text{px}$): Fixed 240px Liquid Glass sidebar.
  * Mobile ($< 1024\text{px}$): Sticky top header with animated menu drawer.

* **🏢 6-Digit Code Organization System**:
  * **Create Organization**: Generate unique 6-digit invite code (e.g. `789210`). Creator auto-assigned `owner` role.
  * **Join Organization**: Enter 6-digit code to join chapter as `member`.
  * **Role-Based Access Control (RBAC)**: `owner`, `admin`, `member` hierarchy

* **👤 User Profile Onboarding**:
  * Automatic post-login check: prompts user once to fill Full Name, WhatsApp, Chapter Role, Category & Bio.

* **📊 Dynamic 100-Point Traffic Light Scoring Engine**:
  * **🟢 Green**: $\ge 70$ pts
  * **🟡 Amber**: $50 - 69$ pts
  * **🔴 Red**: $30 - 49$ pts
  * **⚪ Grey**: $< 30$ pts

---

## 🗄️ Supabase Complete Database Schema.

Run this SQL in your **Supabase Dashboard $\rightarrow$ SQL Editor**:

```sql
-- 1. Organizations Table
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    chapter_name TEXT,
    city TEXT,
    code VARCHAR(6) UNIQUE NOT NULL,
    created_by TEXT NOT NULL,
    green_threshold INT DEFAULT 70,
    amber_threshold INT DEFAULT 50,
    red_threshold INT DEFAULT 30,
    custom_signature TEXT DEFAULT 'Keep the momentum going!',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Organization Members & RBAC Table
CREATE TABLE IF NOT EXISTS public.org_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    user_email TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_org_user UNIQUE (org_id, user_id)
);

-- 3. User Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    user_id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone TEXT,
    chapter_role TEXT,
    business_category TEXT,
    bio TEXT,
    is_profile_completed BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Members Table (Scoped by Org)
CREATE TABLE IF NOT EXISTS public.members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
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
    CONSTRAINT unique_org_member_name UNIQUE (org_id, name)
);

-- 5. Outreach Logs Table
CREATE TABLE IF NOT EXISTS public.outreach_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    member_name TEXT NOT NULL,
    phone TEXT,
    status TEXT NOT NULL,
    message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Security Policies
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public full access organizations" ON public.organizations FOR ALL USING (true);
CREATE POLICY "Public full access org_members" ON public.org_members FOR ALL USING (true);
CREATE POLICY "Public full access profiles" ON public.profiles FOR ALL USING (true);
CREATE POLICY "Public full access members" ON public.members FOR ALL USING (true);
CREATE POLICY "Public full access outreach_logs" ON public.outreach_logs FOR ALL USING (true);
```

---

## 🚀 Quick Start (Local Development)

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Development Server**:
   ```bash
   npm run dev
   ```

3. **Build Production Bundle**:
   ```bash
   npm run build
   ```

Developed by **HandySolver Team**.

Going to create the PR from handysolverteam account and merget with it
