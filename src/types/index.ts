export type UserRole = 'owner' | 'admin' | 'member';
export type SidebarMode = 'full' | 'icons' | 'hover';

export interface Organization {
  id: string;
  name: string;
  chapter_name?: string;
  city?: string;
  code: string;
  created_by: string;
  green_threshold: number;
  amber_threshold: number;
  red_threshold: number;
  custom_signature: string;
  custom_scoring?: Partial<ScoringConfig>;
  created_at?: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  user_email?: string;
  role: UserRole;
  created_at?: string;
  profile?: UserProfileExtended;
}

export interface UserProfileExtended {
  user_id: string;
  full_name: string;
  phone?: string;
  avatar_url?: string;
  business_category?: string;
  bio?: string;
  is_profile_completed?: boolean;
  updated_at?: string;
}

export interface ThresholdTier {
  t: number;
  pts: number;
}

export interface CategoryConfig {
  thresholds: ThresholdTier[];
}

export interface ScoringConfig {
  attendance: CategoryConfig;
  ceu: CategoryConfig;
  oneToOnes: CategoryConfig;
  referrals: CategoryConfig;
  tyfcb: CategoryConfig;
  visitors: CategoryConfig;
  sponsors: CategoryConfig;
  trafficLight: {
    green: number;
    amber: number;
    red: number;
  };
}

export interface MetricSnapshot {
  weeks: number;
  effectiveWeeks: number;
  reportWeeks: number;
  observedWeeks: number;
  attendanceRate: number;
  ceuRate: number;
  oneToOneRate: number;
  referralsRate: number;
  tyfcb: number;
  visitors: number;
  sponsors: number;
}

export interface CategoryBreakdown {
  points: number;
  max: number;
  value: number;
}

export interface Nudge {
  category: string;
  action: string;
  gain: number;
}

export interface TrafficLightStatus {
  label: 'Green' | 'Amber' | 'Red' | 'Grey';
  emoji: string;
  color: string;
}

export interface Member {
  id?: string;
  org_id?: string;
  Name: string;
  Phone?: string;
  Email?: string;
  P?: number;
  A?: number;
  S?: number;
  M?: number;
  RGT?: number;
  V?: number;
  TYFCB?: number;
  CEU?: number;
  OneToOnes?: number;
  Sponsors?: number;
  AttendanceRate?: number;
  reportFromDate?: string;
  reportToDate?: string;
  JoinDate?: string;
  score?: number;
  trafficLight?: TrafficLightStatus;
  breakdown?: Record<string, CategoryBreakdown>;
  metrics?: MetricSnapshot;
  nudges?: Nudge[];
  activeWeeks?: number;
  isProrated?: boolean;
  observedWeeks?: number;
  updatedAt?: string;
}

export interface LevelUpPlan {
  from: string;
  to: string | null;
  pointsNeeded: number;
  nudgesForLevel: Nudge[];
  accumulated?: number;
  stayGreen?: boolean;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  provider: 'google' | 'email' | 'supabase';
}
