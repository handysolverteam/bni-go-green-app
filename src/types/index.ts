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
  Name: string;
  Phone?: string;
  Email?: string;
  P?: number; // Present
  A?: number; // Absent
  S?: number; // Substitute
  M?: number; // Medical / Leave
  RGT?: number; // Referrals Given Total
  RGR?: number; // Referrals Received Total
  V?: number; // Visitors
  TYFCB?: number; // Thank You For Closed Business
  CEU?: number; // Chapter Education Units
  OneToOnes?: number; // 1-2-1 Meetings
  Sponsors?: number; // Members Sponsored
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
