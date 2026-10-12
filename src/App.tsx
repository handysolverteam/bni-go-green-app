import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import { LoginPage } from './components/LoginPage';
import { OrgOnboardingScreen } from './components/OrgOnboardingScreen';
import { ProfileOnboardingScreen } from './components/ProfileOnboardingScreen';
import { SidebarLayout, NavigationTab } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { ImportModal } from './components/ImportModal';
import { NudgeSender } from './components/NudgeSender';
import { OrganizationTab } from './components/OrganizationTab';
import { ProfilePage } from './components/ProfilePage';
import { SettingsPage } from './components/SettingsPage';
import { MemberDetailModal } from './components/MemberDetailModal';
import { TrendsTab } from './components/TrendsTab';
import { ChatTab } from './components/ChatTab';
// import { RenewalsTab } from './components/renewals/RenewalsTab'; // Renewals hidden -- see validTabs
import { ExistingAccountNotice, type ExistingAccountMatch } from './components/ExistingAccountNotice';
import { ConfirmationModal } from './components/ConfirmationModal';
import { UniversalModal } from './components/UniversalModal';
import { PlatformAdminPanel } from './components/PlatformAdminPanel';
import { Crown } from 'lucide-react';
import { Member, Organization, OrgMember, UserProfileExtended, ImportLog } from './types';
import { isAdminOrOwner, hasFullRosterAccess } from './lib/permissions';
import { AccessRequired } from './components/AccessRequired';
import { supabaseService } from './services/supabaseService';
import { setScoringConfig, scoreMember } from './lib/scoringEngine';
import { captureInviteCode, clearPendingInviteCode, clearInviteCodeFromUrl } from './lib/inviteCode';
import { issueSsoHandoff, consumeSsoCallback, tryNextSsoPartner, hasPendingSsoReturn, completePendingSsoHandoff } from './lib/sso';

const parseHash = () => {
  const raw = decodeURIComponent(window.location.hash.replace('#', ''));
  if (!raw) return { tab: 'dashboard' as NavigationTab, report: null };
  const parts = raw.split('/');
  const mainTab = parts[0] as NavigationTab;
  const subReport = parts.slice(1).join('/');

  let reportName: string | null = null;
  if (subReport) {
    reportName = subReport.startsWith('report/') ? subReport.replace('report/', '') : subReport;
  }

  // Renewals is hidden for now (not yet role-enforced server-side); add 'renewals' back to re-enable.
  const validTabs: NavigationTab[] = ['dashboard', 'trends', 'import', 'nudges', 'chat', 'org', 'profile', 'settings'];
  if (validTabs.includes(mainTab)) {
    return { tab: mainTab, report: ['dashboard', 'nudges', 'renewals'].includes(mainTab) ? (reportName || null) : null };
  }
  return { tab: 'dashboard' as NavigationTab, report: null };
};

/** Full-screen boot splash, shown while auth or chapter data is still resolving. */
const BootSplash: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
  const isLight = localStorage.getItem('bni_theme_mode') === 'light' || document.body.classList.contains('light-mode');
  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-4 text-center space-y-4 transition-colors ${
      isLight ? 'bg-[#f1f5f9] text-slate-900' : 'bg-[#001D39] text-white'
    }`}>
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] animate-pulse shadow-lg shadow-emerald-500/20">
          <div className={`w-full h-full rounded-[14px] flex items-center justify-center ${
            isLight ? 'bg-white' : 'bg-[#001D39]'
          }`}>
            <img src="/icons/icon.svg" alt="Handychapter Logo" className="w-10 h-10 rounded-xl object-cover" />
          </div>
        </div>
        <span className="w-3.5 h-3.5 rounded-full bg-emerald-400 animate-ping absolute -top-1 -right-1" />
      </div>
      <div className="space-y-1">
        <h3 className={`text-base font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>{title}</h3>
        <p className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>{subtitle}</p>
      </div>
    </div>
  );
};

export const AppContent: React.FC = () => {
  const { user, loading: authLoading, logout } = useAuth();
  const { showToast } = useToast();
  const hasVerifiedRef = React.useRef(false);

  // Cross-app SSO with bni-rrc: this app plays three roles depending on the `sso` query param
  // (see src/lib/sso.ts for the full protocol). `ssoBusy` gates rendering while any of them is
  // in flight, since none of them should flash the normal login/dashboard UI mid-handoff.
  const ssoHandledRef = React.useRef(false);
  const [ssoBusy, setSsoBusy] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).has('sso');
  });

  // A satellite asked this hub to authenticate the user before `user` existed yet (they had to
  // go through the login screen below first). Once sign-in completes, finish that handoff and
  // bounce them back -- checked ahead of org/profile onboarding, since someone only passing
  // through to sign in elsewhere shouldn't be forced through either just to get back out. The
  // lazy initializer only catches a pending return left over from BEFORE this mount (e.g. a
  // reload mid-login); the effect below sets it explicitly when storing one just now.
  const [completingHandoff, setCompletingHandoff] = useState(() => hasPendingSsoReturn());

  useEffect(() => {
    if (ssoHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const ssoParam = params.get('sso');
    if (!ssoParam) return;

    if (ssoParam === 'logout') {
      ssoHandledRef.current = true;
      window.history.replaceState({}, '', window.location.pathname);
      logout().finally(() => setSsoBusy(false));
      return;
    }

    if (ssoParam === 'callback') {
      ssoHandledRef.current = true;
      const code = params.get('ssoCode');
      const redirectHash = params.get('redirect') || '#dashboard';
      const partnerIndex = Number(params.get('partnerIndex') || '0');
      window.history.replaceState({}, '', window.location.pathname);

      if (!code || code === 'none') {
        if (!tryNextSsoPartner(redirectHash, partnerIndex)) {
          setSsoBusy(false);
        }
        return;
      }

      consumeSsoCallback(code).then((ok) => {
        if (ok) {
          window.location.hash = redirectHash;
          setSsoBusy(false);
        } else if (!tryNextSsoPartner(redirectHash, partnerIndex)) {
          setSsoBusy(false);
        }
      });
      return;
    }

    if (ssoParam === 'issue') {
      // Wait for Firebase to finish restoring any persisted session before answering --
      // firebaseAuth.currentUser is unreliable until the first onAuthStateChanged fires.
      if (authLoading) return;
      ssoHandledRef.current = true;
      const returnUrl = params.get('return');
      window.history.replaceState({}, '', window.location.pathname);

      if (!returnUrl) {
        setSsoBusy(false);
        return;
      }

      if (user) {
        // Already signed in: mint a code and bounce back immediately. Stay "busy" (splash)
        // rather than clearing it, so the dashboard never flashes before the redirect fires.
        void issueSsoHandoff(returnUrl);
        return;
      }

      // Not signed in: issueSsoHandoff() just remembers the return URL. Clear ssoBusy so the
      // normal gating below renders our own real login screen, and flip completingHandoff so
      // the effect watching `user` knows to finish the job once sign-in succeeds -- its lazy
      // initializer only catches a return URL left over from BEFORE this mount (e.g. a reload
      // mid-login), not one this same effect is storing just now.
      void issueSsoHandoff(returnUrl);
      setCompletingHandoff(true);
      setSsoBusy(false);
      return;
    }

    ssoHandledRef.current = true;
    setSsoBusy(false);
  }, [authLoading, logout]);

  useEffect(() => {
    if (!user || !completingHandoff) return;
    void completePendingSsoHandoff().finally(() => setCompletingHandoff(false));
  }, [user, completingHandoff]);

  // App & Org State (Persisted in URL Hash & localStorage)
  const initialNav = parseHash();
  const [activeTab, setActiveTabState] = useState<NavigationTab>(initialNav.tab);
  const [selectedNudgeReport, setSelectedNudgeReportState] = useState<string | null>(initialNav.report);

  const navigateTo = (tab: NavigationTab, reportName: string | null = null) => {
    let newHash = `#${tab}`;
    if (reportName && ['dashboard', 'nudges', 'renewals'].includes(tab)) {
      newHash = `#${tab}/report/${encodeURIComponent(reportName)}`;
    }
    if (window.location.hash !== newHash) {
      window.history.pushState({ tab, report: reportName }, '', newHash);
    }
    setActiveTabState(tab);
    setSelectedNudgeReportState(reportName);
    localStorage.setItem('bni_active_tab', tab);
    if (reportName) {
      localStorage.setItem('bni_active_report', reportName);
    } else {
      localStorage.removeItem('bni_active_report');
    }
  };

  const setActiveTab = (tab: NavigationTab, subPath?: string) => {
    navigateTo(tab, subPath ?? null);
  };

  // Listen to mobile swipe-back gesture and browser back/forward buttons & hash changes
  useEffect(() => {
    const handleSyncFromHash = () => {
      const { tab, report } = parseHash();
      setActiveTabState(tab);
      setSelectedNudgeReportState(report);
    };

    window.addEventListener('popstate', handleSyncFromHash);
    window.addEventListener('hashchange', handleSyncFromHash);
    return () => {
      window.removeEventListener('popstate', handleSyncFromHash);
      window.removeEventListener('hashchange', handleSyncFromHash);
    };
  }, []);
  
  const [org, setOrg] = useState<Organization | null>(() => {
    try {
      const cached = localStorage.getItem('bni_cached_org');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  // Platform Admin: true only for the handful of accounts granted this via SQL (migration 009).
  // Lets them jump into ANY organization -- see enterOrgAsAdmin/exitAdminView below. Deliberately
  // NOT persisted to localStorage: reloading always starts from the admin's own personal chapter
  // (or none), never wherever they last browsed to.
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [showOrgBrowser, setShowOrgBrowser] = useState(false);
  const [personalOrgSnapshot, setPersonalOrgSnapshot] = useState<{ org: Organization | null; orgMember: OrgMember | null } | null>(null);

  const [orgMember, setOrgMember] = useState<OrgMember | null>(() => {
    try {
      const cached = localStorage.getItem('bni_cached_org_member');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const canSeeFullRoster = hasFullRosterAccess(orgMember?.role, orgMember?.committees);

  const [userProfile, setUserProfile] = useState<UserProfileExtended | null>(() => {
    try {
      const cached = localStorage.getItem('bni_cached_profile');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  // Returning users already hold org, profile, members and reports in localStorage (the
  // useState initialisers above read them). Blocking on the network anyway meant staring at
  // "Verifying Organization..." on every single load while perfectly good data sat unused.
  // With a cached session, render immediately and revalidate in the background.
  const hasCachedSession = React.useRef(
    Boolean(localStorage.getItem('bni_cached_org') && localStorage.getItem('bni_cached_profile'))
  ).current;

  const [isInitializing, setIsInitializing] = useState(!hasCachedSession);

  // Members, Import Logs & Selected Member (Hydrated instantly from SWR localStorage)
  const [members, setMembersState] = useState<Member[]>(() => {
    try {
      const cached = localStorage.getItem('bni_cached_members');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [importLogs, setImportLogsState] = useState<ImportLog[]>(() => {
    try {
      const cached = localStorage.getItem('bni_cached_import_logs');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const setMembers = (mems: Member[] | ((prev: Member[]) => Member[])) => {
    setMembersState((prev) => {
      const next = typeof mems === 'function' ? mems(prev) : mems;
      try { localStorage.setItem('bni_cached_members', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Chapter AI for a plain Member is self-scoped: RLS only ever hands them their own roster
  // rows, so `members` being non-empty for a non-full-roster user means an Admin has linked
  // their account. Until that link exists they'd have nothing to ask about, so the tab stays
  // hidden rather than opening onto an empty assistant (decision 2026-10-10).
  const canUseChapterAI = canSeeFullRoster || members.length > 0;

  const setImportLogs = (logs: ImportLog[] | ((prev: ImportLog[]) => ImportLog[])) => {
    setImportLogsState((prev) => {
      const next = typeof logs === 'function' ? logs(prev) : logs;
      try { localStorage.setItem('bni_cached_import_logs', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(hasCachedSession);

  // Set when a phone sign-in lands on a number that already belongs to another account.
  const [duplicateAccount, setDuplicateAccount] = useState<ExistingAccountMatch | null>(null);

  // True only while the auto-join-from-invite-link network call is actually in flight, so the
  // boot splash can say "Joining Chapter..." instead of the generic verifying message.
  const [isJoiningViaInvite, setIsJoiningViaInvite] = useState(false);

  // True once the auto-join attempt has concluded (success OR failure) — or immediately, for
  // anyone with no invite code, since there's nothing to wait on. isInitializing/isDataLoaded
  // settle as soon as initUserData() resolves, which is BEFORE the auto-join effect even gets
  // a chance to run (effects fire after the commit they're declared in has painted) — without
  // this, the render gate below would briefly let OrgOnboardingScreen flash on screen in that
  // gap, exactly the bug this whole redesign set out to fix.
  const [inviteJoinSettled, setInviteJoinSettled] = useState(false);

  // Shown instead of silently auto-joining when the signed-in email has previously gone
  // through account deletion (supabaseService.wasAccountPreviouslyDeleted) — an old invite
  // link would otherwise let a deleted account rejoin its chapter instantly, with no
  // confirmation, which made deletion feel like it hadn't done anything.
  const [showRejoinConfirm, setShowRejoinConfirm] = useState(false);
  const [isRejoining, setIsRejoining] = useState(false);
  const pendingRejoinCodeRef = useRef<string | null>(null);

  // Holds the teardown for the active members realtime channel. Without this, leaving an
  // org keeps the old subscription alive and it overwrites the roster with the old chapter's data.
  const unsubscribeMembersRef = React.useRef<(() => void) | null>(null);

  const subscribeToOrgMembers = (orgId: string) => {
    unsubscribeMembersRef.current?.();
    unsubscribeMembersRef.current = supabaseService.subscribeToMembers(orgId, async () => {
      const fresh = await supabaseService.fetchMembers(orgId);
      setMembers(fresh);
    });
  };

  React.useEffect(() => () => unsubscribeMembersRef.current?.(), []);

  /**
   * Invite-code capture — the single source of truth for the rest of this component.
   *
   * Three earlier bugs (the code persisting after leaving/logout, a React.StrictMode race
   * losing the auto-join, and a third still-unexplained failure) all traced back to the same
   * design flaw: the code lived in mutable global state (the URL + localStorage) that several
   * independent effects each read-and-cleared destructively, so whichever one happened to run
   * first "won" and the others silently found nothing. That's fundamentally racy in React,
   * doubly so under StrictMode's deliberate double-invoking of effects.
   *
   * Fix: capture it ONCE, here, into a ref — stable for the rest of this component instance's
   * life. Every consumer below reads this SAME value instead of re-reading the mutable source.
   * There is nothing left to race over.
   *
   * useLayoutEffect (not useEffect) specifically: layout effects across the whole tree run
   * before ANY passive effect fires, so this is guaranteed to complete before the auto-join
   * effect, the "already in a chapter" effect, and initUserData's effect below — all regular
   * useEffects in this same component. The `hasCapturedInviteRef` guard makes the capture
   * itself idempotent, so StrictMode's dev-only double-invoke of this effect is harmless.
   */
  const inviteCodeRef = useRef<string | null>(null);
  const hasCapturedInviteRef = useRef(false);
  useLayoutEffect(() => {
    if (hasCapturedInviteRef.current) return;
    hasCapturedInviteRef.current = true;
    inviteCodeRef.current = captureInviteCode();
  }, []);

  // Handles an invite link visited by someone who ALREADY belongs to a chapter. The auto-join
  // effect below only ever attempts a join when org is null, so without this, a code visited
  // by an existing member would just sit captured-but-unused with nothing telling the user why
  // clicking their invite link appeared to do nothing.
  const hasHandledExistingOrgInviteRef = useRef(false);
  useEffect(() => {
    if (isInitializing || !isDataLoaded || !user || !org) return;
    const code = inviteCodeRef.current;
    if (!code || hasHandledExistingOrgInviteRef.current) return;
    hasHandledExistingOrgInviteRef.current = true;

    if (code === org.code) {
      showToast(`You're already a member of ${org.name}.`, 'info');
    } else {
      showToast(
        `You're already in ${org.name}. Leave it from Profile → Danger Zone before joining another chapter.`,
        'info'
      );
    }
  }, [isInitializing, isDataLoaded, user, org]);

  /** Loads scoring config, roster and report logs for an org, and (re)opens its realtime channel. */
  const hydrateOrgData = async (targetOrg: Organization, userId: string) => {
    const [settingsRes, dbMembers, dbLogs] = await Promise.all([
      supabaseService.fetchOrgSettings(targetOrg.id, userId),
      supabaseService.fetchMembers(targetOrg.id),
      supabaseService.fetchImportLogs(targetOrg.id),
    ]);

    if (settingsRes && settingsRes.scoringConfig) {
      setScoringConfig(settingsRes.scoringConfig);
    } else {
      setScoringConfig({
        trafficLight: {
          green: targetOrg.green_threshold || 70,
          amber: targetOrg.amber_threshold || 50,
          red: targetOrg.red_threshold || 30,
        }
      });
    }

    subscribeToOrgMembers(targetOrg.id);

    // Re-score fetched members with active custom org scoring configuration
    return { members: dbMembers.map(m => scoreMember(m)), logs: dbLogs };
  };

  // 1. On Auth Load: Fetch Org & Profile with background revalidation & localStorage sync
  useEffect(() => {
    if (!user?.uid) {
      setIsInitializing(false);
      setIsDataLoaded(true);
      return;
    }

    // Only block the UI when there is nothing cached to show. A cached session revalidates
    // silently underneath the already-rendered app.
    if (!hasVerifiedRef.current && !hasCachedSession) {
      setIsInitializing(true);
      setIsDataLoaded(false);
    }

    // Guards against a stale invocation applying its results after a newer one has already
    // started. This effect previously had no cleanup, so React.StrictMode's dev-only
    // double-invoke ran initUserData() twice concurrently: the first call would consume the
    // invite code and start a real (slow) join API request, while the second found the code
    // already gone, skipped the join entirely, and committed org=null faster than the first
    // call's join could finish — landing the user on the manual Create/Join screen despite
    // the join succeeding moments later in the background. Every await below re-checks this
    // before touching state, so only the LAST invocation's outcome is ever applied.
    let cancelled = false;

    const initUserData = async () => {
      try {
        // Fetch Org, User Profile and Platform Admin status concurrently
        const [orgRes, profRes, isPlatformAdminRes] = await Promise.all([
          supabaseService.fetchUserOrganization(user.uid, user.email),
          supabaseService.fetchUserProfile(user.uid, user.email),
          supabaseService.checkIsPlatformAdmin(),
        ]);
        if (cancelled) return;
        setIsPlatformAdmin(isPlatformAdminRes);

        let fetchedMembers: Member[] = [];
        let fetchedLogs: ImportLog[] = [];

        if (orgRes) {
          localStorage.setItem('bni_cached_org', JSON.stringify(orgRes.org));
          localStorage.setItem('bni_cached_org_member', JSON.stringify(orgRes.member));

          const hydrated = await hydrateOrgData(orgRes.org, user.uid);
          if (cancelled) return;
          fetchedMembers = hydrated.members;
          fetchedLogs = hydrated.logs;
        }

        let finalProfile = profRes;
        if (!finalProfile) {
          const cachedStr = localStorage.getItem('bni_cached_profile');
          if (cachedStr) {
            try {
              const cached = JSON.parse(cachedStr);
              if (cached && (cached.full_name || cached.phone || cached.is_profile_completed)) {
                finalProfile = { ...cached, is_profile_completed: true };
              }
            } catch (_) {}
          }
        }

        if (finalProfile) {
          localStorage.setItem('bni_cached_profile', JSON.stringify(finalProfile));
          setUserProfile(finalProfile);
        } else if (user?.displayName || user?.email) {
          const cachedStr = localStorage.getItem('bni_cached_profile');
          // Phone sign-in already verified this number, so pre-fill it for onboarding.
          let existingPhone = user.phoneNumber || '';
          if (cachedStr) {
            try {
              const cached = JSON.parse(cachedStr);
              if (cached && cached.phone) existingPhone = cached.phone;
            } catch (_) {}
          }

          const fallback: UserProfileExtended = {
            user_id: user.uid,
            full_name: user.displayName || user.email?.split('@')[0] || 'Member',
            phone: existingPhone,
            business_category: '',
            bio: '',
            avatar_url: user.photoURL || '',
            is_profile_completed: true,
          };
          localStorage.setItem('bni_cached_profile', JSON.stringify(fallback));
          setUserProfile(fallback);
        }

        // A chapter a Platform Admin has removed (archived -- migration 013) must stop working
        // for its members, otherwise "removed" only hides it from the admin's own list. Treated
        // as having no chapter, which lands them on the join/create screen. This deliberately
        // does NOT affect enterOrgAsAdmin(), so a Platform Admin can still open an archived
        // chapter from the platform panel to inspect or restore it.
        if (orgRes && orgRes.org?.archived_at) {
          localStorage.removeItem('bni_cached_org');
          localStorage.removeItem('bni_cached_org_member');
          setOrg(null);
          setOrgMember(null);
          showToast('This chapter has been removed by an administrator.', 'warning');
        } else if (orgRes) {
          setOrg(orgRes.org);
          setOrgMember(orgRes.member);
        } else {
          localStorage.removeItem('bni_cached_org');
          localStorage.removeItem('bni_cached_org_member');
          setOrg(null);
          setOrgMember(null);

          // A phone sign-in with no chapter is either a genuinely new user or someone who
          // already has an account under Google — Firebase issues a different uid per
          // method, so the second one arrives looking like a stranger. Check before letting
          // them build a parallel chapter under the duplicate.
          if (user.provider === 'phone' && user.phoneNumber && !profRes) {
            const match = await supabaseService.findProfileByPhone(user.phoneNumber, user.uid);
            if (cancelled) return;
            if (match) setDuplicateAccount({ full_name: match.full_name, email: match.email });
          }
        }

        if (cancelled) return;
        setMembers(fetchedMembers);
        setImportLogs(fetchedLogs);
      } catch (err) {
        if (cancelled) return;
        console.error('Initialization error:', err);
      } finally {
        // A `return` inside the try block above still runs this finally — without this guard,
        // a cancelled invocation would flip isInitializing/isDataLoaded off regardless, which
        // is exactly what let a stale invocation win the render race in the first place.
        if (!cancelled) {
          hasVerifiedRef.current = true;
          setIsInitializing(false);
          setIsDataLoaded(true);
        }
      }
    };

    initUserData();
    return () => {
      cancelled = true;
    };
  }, [user]);

  /**
   * Auto-joins the chapter from a captured invite link once we know the user has no chapter
   * of their own — a referral link should take a new or org-less user straight to the
   * dashboard, not park them on the manual create-or-join screen with the code merely
   * pre-filled. Separated from initUserData's effect (rather than woven into it, as a first
   * attempt at this did): that entanglement was what made the earlier StrictMode race so easy
   * to introduce. This effect owns exactly one concern — attempt the join at most once, when
   * the moment is right — and reacts naturally to org settling to null once initUserData
   * above has finished, rather than trying to manually sequence everything inline.
   *
   * hasAttemptedJoinRef makes a second invocation (StrictMode's double-invoke, or any other
   * duplicate effect run) a true no-op rather than merely a "loses the race" risk — after a
   * successful join, org becomes non-null, this effect's own guard (`|| org`) then skips any
   * further run anyway, but the ref protects the network call itself regardless of ordering.
   */
  /**
   * Actually performs the join network call — shared by the silent auto-join path (first-time
   * invitees) and the explicit-confirm path (see showRejoinConfirm above). Only ever called
   * with a real, non-null user in scope, since both callers already guard on that.
   */
  const performInviteJoin = async (code: string, joiningUser: NonNullable<typeof user>) => {
    setIsJoiningViaInvite(true);
    try {
      const joinResult: any = await supabaseService.joinOrganization(code, joiningUser.uid, joiningUser.email || undefined);
      if (joinResult && 'org' in joinResult) {
        const hydrated = await hydrateOrgData(joinResult.org, joiningUser.uid);
        localStorage.setItem('bni_cached_org', JSON.stringify(joinResult.org));
        localStorage.setItem('bni_cached_org_member', JSON.stringify(joinResult.member));
        setOrg(joinResult.org);
        setOrgMember(joinResult.member);
        setMembers(hydrated.members);
        setImportLogs(hydrated.logs);
        showToast(`Joined ${joinResult.org.name} via invite link!`, 'success');
      } else {
        // Invalid/expired code: leave org null so OrgOnboardingScreen mounts normally, with
        // this same code passed through as its prefill (see the render below) so the user
        // sees what was tried and can retry or correct it, rather than a blank form.
        showToast(joinResult?.error || 'That invite link is no longer valid.', 'error');
      }
    } catch (err) {
      console.error('Auto-join via invite link failed:', err);
      showToast('Something went wrong joining that chapter. Please try again manually.', 'error');
    } finally {
      setIsJoiningViaInvite(false);
      setInviteJoinSettled(true);
      clearPendingInviteCode();
    }
  };

  const hasAttemptedJoinRef = useRef(false);
  useEffect(() => {
    if (isInitializing || !isDataLoaded || !user || org) return;
    const code = inviteCodeRef.current;
    if (!code || hasAttemptedJoinRef.current) return;
    hasAttemptedJoinRef.current = true;

    (async () => {
      // A deleted account has no profile/org_members row left to signal "you were here
      // before" — this is the only remaining signal. Ask first instead of silently
      // rejoining; inviteJoinSettled stays false so the boot gate holds until the user
      // actually decides (see the render gate below).
      const previouslyDeleted = await supabaseService.wasAccountPreviouslyDeleted(user.email);
      if (previouslyDeleted) {
        pendingRejoinCodeRef.current = code;
        setShowRejoinConfirm(true);
        return;
      }
      await performInviteJoin(code, user);
    })();
  }, [isInitializing, isDataLoaded, user, org]);

  const handleConfirmRejoin = async () => {
    const code = pendingRejoinCodeRef.current;
    setShowRejoinConfirm(false);
    if (!code || !user) return;
    setIsRejoining(true);
    await performInviteJoin(code, user);
    setIsRejoining(false);
  };

  const handleDeclineRejoin = () => {
    setShowRejoinConfirm(false);
    pendingRejoinCodeRef.current = null;
    // Releases the boot-splash gate below (inviteJoinPending) without joining anything —
    // OrgOnboardingScreen mounts normally next, same as an invalid/expired code would.
    setInviteJoinSettled(true);
    clearPendingInviteCode();
  };

  // Handle Org Created / Joined
  const handleOrgJoined = async (data: { org: Organization; member: OrgMember }) => {
    localStorage.setItem('bni_cached_org', JSON.stringify(data.org));
    localStorage.setItem('bni_cached_org_member', JSON.stringify(data.member));
    setOrg(data.org);
    setOrgMember(data.member);
    showToast(`Joined ${data.org.name}! Org Code: ${data.org.code}`, 'success');

    // Auth state has not changed, so the init effect will not re-run — load the new
    // chapter's data here so switching chapters does not land on an empty dashboard.
    if (!user?.uid) return;
    setIsSyncing(true);
    try {
      const hydrated = await hydrateOrgData(data.org, user.uid);
      setMembers(hydrated.members);
      setImportLogs(hydrated.logs);
    } catch (err) {
      console.error('Failed to load joined organization data:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Platform Admin only: switches the app into another chapter without a real membership row.
   * `orgMember` is synthesized client-side purely to drive the existing per-chapter UI's role
   * checks (isAdminOrOwner etc.) -- it is not a security boundary. The real one is server-side:
   * every query still goes through RLS, which independently grants a Platform Admin full access
   * via caller_admin_org_ids()/caller_full_roster_org_ids() (migration 009). The personal org is
   * snapshotted so exitAdminView() can restore it exactly, and never touches localStorage, so a
   * reload always comes back to the admin's own chapter (or none), not wherever they browsed to.
   */
  const enterOrgAsAdmin = async (target: Organization) => {
    if (!user?.uid) return;
    setPersonalOrgSnapshot({ org, orgMember });
    setShowOrgBrowser(false);
    setOrg(target);
    setOrgMember({
      id: `platform-admin-view-${target.id}`,
      org_id: target.id,
      user_id: user.uid,
      user_email: user.email || '',
      role: 'owner',
      created_at: new Date().toISOString(),
    });
    navigateTo('dashboard');

    setIsSyncing(true);
    try {
      const hydrated = await hydrateOrgData(target, user.uid);
      setMembers(hydrated.members);
      setImportLogs(hydrated.logs);
    } catch (err) {
      console.error('Failed to load organization for admin view:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  /** Returns from admin-viewing another chapter back to the Platform Admin's own context. */
  const exitAdminView = async () => {
    if (!personalOrgSnapshot || !user?.uid) return;
    const { org: ownOrg, orgMember: ownMember } = personalOrgSnapshot;
    setOrg(ownOrg);
    setOrgMember(ownMember);
    setPersonalOrgSnapshot(null);
    navigateTo('dashboard');

    if (!ownOrg) return;
    setIsSyncing(true);
    try {
      const hydrated = await hydrateOrgData(ownOrg, user.uid);
      setMembers(hydrated.members);
      setImportLogs(hydrated.logs);
    } catch (err) {
      console.error('Failed to restore personal organization:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Leaves the current chapter and drops the user back to the onboarding screen,
   * where they can create or join another one.
   */
  const handleLeaveOrganization = async (): Promise<{ ok: boolean; error?: string }> => {
    if (!org?.id || !user?.uid) return { ok: false, error: 'No active chapter.' };

    const result = await supabaseService.leaveOrganization(org.id, user.uid, user.email);
    if (!result.ok) return result;

    // Stop the old chapter's realtime channel before clearing its data
    unsubscribeMembersRef.current?.();
    unsubscribeMembersRef.current = null;

    ['bni_cached_org', 'bni_cached_org_member', 'bni_cached_members', 'bni_cached_import_logs', 'bni_active_report']
      .forEach(key => { try { localStorage.removeItem(key); } catch {} });

    // Drop any invite code still in storage or the address bar, so the chapter they just
    // left is not handed straight back to them on the onboarding screen.
    clearPendingInviteCode();
    clearInviteCodeFromUrl();

    setMembers([]);
    setImportLogs([]);
    setSelectedMember(null);
    setOrgMember(null);
    setOrg(null);
    navigateTo('dashboard');
    showToast('You have left the chapter. Create or join another to continue.', 'info');
    return { ok: true };
  };

  // Handle Profile Completed
  const handleProfileCompleted = (profile: UserProfileExtended) => {
    localStorage.setItem('bni_cached_profile', JSON.stringify(profile));
    setUserProfile(profile);
    showToast('Profile completed successfully!', 'success');
  };

  // Member & Batch CRUD Handlers
  const handleSaveMember = async (memberToSave: Member) => {
    if (!org?.id || !user?.uid) return;
    setIsSyncing(true);
    const saved = await supabaseService.saveSingleMember(memberToSave, org.id, user.uid);
    if (saved) {
      const dbMembers = await supabaseService.fetchMembers(org.id);
      setMembers(dbMembers);
      showToast(`Member "${memberToSave.Name}" saved!`, 'success');
    } else {
      showToast('Failed to save member to database', 'error');
    }
    setIsSyncing(false);
  };

  const handleImportMembers = async (batchName: string, imported: Member[], fileName: string, fileData?: string) => {
    setActiveTab('dashboard'); // Auto-close import modal immediately!
    if (org?.id && user?.uid) {
      // 1. INSTANT OPTIMISTIC UI RENDER (0ms LATENCY! Report card shows immediately without refresh!)
      const newLog: ImportLog = {
        id: `log_${Date.now()}`,
        org_id: org.id,
        user_id: user.uid,
        file_name: fileName,
        batch_name: batchName,
        total_records: imported.length,
        green_count: imported.filter(m => m.trafficLight?.label === 'Green').length,
        amber_count: imported.filter(m => m.trafficLight?.label === 'Amber').length,
        red_count: imported.filter(m => m.trafficLight?.label === 'Red').length,
        grey_count: imported.filter(m => m.trafficLight?.label === 'Grey').length,
        avg_score: imported.length > 0 ? Math.round(imported.reduce((acc, m) => acc + (m.score || 0), 0) / imported.length) : 0,
        file_data: fileData || '',
        created_at: new Date().toISOString(),
      };

      // Build lookup map of existing member phone numbers & join dates by name
      const existingMap = new Map<string, { phone: string; joinDate: string }>();
      members.forEach(m => {
        if (m.Name) {
          existingMap.set(m.Name.trim().toLowerCase(), {
            phone: m.Phone || '',
            joinDate: m.JoinDate || (m as any).join_date || '',
          });
        }
      });

      const taggedMembers = imported.map((m, idx) => {
        const norm = (m.Name || '').trim().toLowerCase();
        const prev = existingMap.get(norm);
        return scoreMember({
          ...m,
          Phone: m.Phone || prev?.phone || '',
          JoinDate: m.JoinDate || prev?.joinDate || '',
          id: m.id || `temp_${Date.now()}_${idx}`,
          batch_name: batchName,
          org_id: org.id,
        });
      });

      // Render new report card & members ON SCREEN IMMEDIATELY
      setImportLogs(prev => [newLog, ...prev.filter(l => l.batch_name !== batchName)]);
      setMembers(prev => [...prev.filter(m => m.batch_name !== batchName), ...taggedMembers]);

      showToast(`Successfully imported report "${batchName}" with ${imported.length} members!`, 'success');

      // 2. Background database save & sync
      setIsSyncing(true);
      const success = await supabaseService.upsertMembers(taggedMembers, org.id, user.uid, fileName, batchName, fileData);

      // Revalidate with fresh DB IDs
      const [dbMembers, dbLogs] = await Promise.all([
        supabaseService.fetchMembers(org.id),
        supabaseService.fetchImportLogs(org.id),
      ]);

      if (dbMembers && dbMembers.length > 0) setMembers(dbMembers);
      if (dbLogs && dbLogs.length > 0) setImportLogs(dbLogs);

      setIsSyncing(false);
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!org?.id) return;
    setIsSyncing(true);
    setMembers(prev => prev.filter(m => m.id !== memberId));
    await supabaseService.deleteMember(memberId, org.id);
    showToast('Member successfully removed from database', 'info');
    setIsSyncing(false);
  };

  const handleDeleteBatch = async (batchName: string, logId?: string) => {
    if (!org?.id) return;
    setIsSyncing(true);
    await supabaseService.deleteImportBatch(org.id, batchName, logId);
    const [dbMembers, dbLogs] = await Promise.all([
      supabaseService.fetchMembers(org.id),
      supabaseService.fetchImportLogs(org.id),
    ]);
    setMembers(dbMembers);
    setImportLogs(dbLogs);
    showToast(`Batch "${batchName}" and its members removed from database!`, 'warning');
    setIsSyncing(false);
  };

  const handlePurgeAll = async () => {
    if (!org?.id) return;
    setIsSyncing(true);
    setMembers([]);
    setImportLogs([]);
    await supabaseService.purgeAllMembers(org.id);
    showToast('All chapter member data purged from database', 'warning');
    setIsSyncing(false);
  };

  // 0. A cross-app SSO handoff (see src/lib/sso.ts) is in flight -- don't flash the normal
  //    login/dashboard UI mid-redirect.
  if (ssoBusy) {
    return <BootSplash title="Signing you in..." subtitle="Connecting your Handychapter account" />;
  }

  // 1. Auth state is still being restored. Firebase/Supabase resolve a persisted session
  //    asynchronously, so `user` is briefly null on EVERY load — returning LoginPage here
  //    flashed the sign-in screen at users who were already signed in.
  if (authLoading) {
    return <BootSplash title="Signing you in..." subtitle="Restoring your session" />;
  }

  // 2. Genuinely unauthenticated -> this app IS the auth hub, so just show the real login
  //    screen (there's no other app to silently check a session on any more).
  if (!user) {
    return <LoginPage />;
  }

  // 2.5. A satellite sent the user here to authenticate and is waiting on the result. Finish
  //    that handoff before anything else -- see the effect above watching `user`.
  if (completingHandoff) {
    return <BootSplash title="Signing you in..." subtitle="Returning you to the app you came from" />;
  }

  // 3. User is Logged In (user != null) but Org Verification is in progress -> Verifying Splash
  //
  // inviteJoinPending extends this gate past the moment initUserData() alone would have
  // released it: when there's a captured invite code and no org yet, the auto-join effect
  // still needs to run (effects fire after this render has already painted) — without waiting
  // for it too, OrgOnboardingScreen would flash on screen for that gap before the join
  // resolves. Anyone with no invite code is unaffected, since this is false for them from the
  // very first render.
  const inviteJoinPending = Boolean(inviteCodeRef.current) && !org && !inviteJoinSettled;
  if (isInitializing || !isDataLoaded || inviteJoinPending) {
    return (
      <>
        {isJoiningViaInvite || (inviteJoinPending && !showRejoinConfirm) ? (
          <BootSplash title="Joining Chapter..." subtitle="Connecting you to your invited chapter" />
        ) : showRejoinConfirm ? (
          <BootSplash title="One moment..." subtitle="This account has deleted Handychapter before" />
        ) : (
          <BootSplash title="Verifying Organization..." subtitle="Checking chapter membership & credentials" />
        )}
        <ConfirmationModal
          isOpen={showRejoinConfirm}
          type="rejoinAfterDelete"
          onConfirm={handleConfirmRejoin}
          onClose={handleDeclineRejoin}
          isLoading={isRejoining}
        />
      </>
    );
  }

  // 3a. Signed in by phone, but this number already belongs to another account. Steer them
  //     back before they build a parallel chapter under the duplicate uid.
  if (duplicateAccount) {
    return (
      <ExistingAccountNotice
        match={duplicateAccount}
        phoneNumber={user.phoneNumber}
        onContinueAnyway={() => setDuplicateAccount(null)}
      />
    );
  }

  // 3b. Authenticated & Verified, but NO Organization -> Org Onboarding Screen
  //     (A Platform Admin with no personal chapter gets the org browser instead, with a way
  //     back to the normal create/join flow -- they are not "stuck" the way a regular new
  //     user without an org would be.)
  if (!org) {
    if (isPlatformAdmin && showOrgBrowser) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
          <div className="max-w-3xl mx-auto pt-6 px-4">
            <button
              onClick={() => setShowOrgBrowser(false)}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white"
            >
              &larr; Back to create/join a chapter
            </button>
          </div>
          <PlatformAdminPanel onManageOrg={enterOrgAsAdmin} />
        </div>
      );
    }
    return (
      <>
        <OrgOnboardingScreen onOrgJoined={handleOrgJoined} prefillCode={inviteCodeRef.current} />
        {isPlatformAdmin && (
          <button
            onClick={() => setShowOrgBrowser(true)}
            className="fixed bottom-4 right-4 px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black shadow-lg flex items-center gap-1.5 z-50"
          >
            <Crown className="w-3.5 h-3.5" />
            <span>Platform Admin: Browse all organizations</span>
          </button>
        )}
      </>
    );
  }

  // 4. Authenticated & Verified, Has Org, but Profile NOT Completed -> Profile Onboarding Screen
  if (!userProfile || !userProfile.is_profile_completed) {
    return <ProfileOnboardingScreen onProfileCompleted={handleProfileCompleted} />;
  }

  // 4. Fully Authenticated & Onboarded -> App with Sidebar Layout
  return (
    <>
      {/* Platform Admin currently viewing someone else's chapter: always visible, always one click back. */}
      {personalOrgSnapshot && (
        <div className="fixed top-0 inset-x-0 z-[60] bg-amber-500 text-slate-950 text-xs font-black px-4 py-2 flex items-center justify-center gap-2 shadow-lg">
          <Crown className="w-3.5 h-3.5" />
          <span>Viewing {org.chapter_name || org.name} as Platform Admin</span>
          <button onClick={exitAdminView} className="ml-2 underline underline-offset-2 hover:opacity-80">
            Exit
          </button>
        </div>
      )}

      {isPlatformAdmin && !personalOrgSnapshot && (
        <button
          onClick={() => setShowOrgBrowser(true)}
          title="Platform Admin: browse all organizations"
          className="fixed bottom-4 right-4 z-50 p-3 rounded-full bg-amber-500 text-slate-950 shadow-lg hover:scale-105 transition-all"
        >
          <Crown className="w-4 h-4" />
        </button>
      )}

      {showOrgBrowser && (
        <UniversalModal isOpen={showOrgBrowser} onClose={() => setShowOrgBrowser(false)} maxWidth="max-w-4xl">
          <PlatformAdminPanel onManageOrg={enterOrgAsAdmin} />
        </UniversalModal>
      )}

      <SidebarLayout
        activeTab={activeTab}
        activeSubPath={selectedNudgeReport}
        setActiveTab={(tab, subPath) => navigateTo(tab, subPath ?? null)}
        memberCount={members.length}
        reportCount={importLogs.length}
        org={org}
        orgMember={orgMember}
        userProfile={userProfile}
        canUseChapterAI={canUseChapterAI}
      >
      {/* Animated Tab Page Wrapper — key forces remount on tab change, triggering smooth enter animation */}
      <div key={activeTab} className={activeTab === 'chat' ? 'tab-page-instant h-full flex flex-col' : 'tab-page'}>
        {activeTab === 'dashboard' && (
          <Dashboard
            members={members}
            importLogs={importLogs}
            selectedReportName={selectedNudgeReport}
            onSelectReportName={(repName) => navigateTo('dashboard', repName)}
            onSelectMember={(m) => setSelectedMember(m)}
            onOpenImport={() => navigateTo('import')}
            onOpenNudges={canSeeFullRoster ? (reportName) => navigateTo('nudges', reportName) : undefined}
            canEdit={isAdminOrOwner(orgMember?.role)}
            canSeeContactDetails={canSeeFullRoster}
            onSaveMember={handleSaveMember}
            onDeleteMember={handleDeleteMember}
            onDeleteBatch={handleDeleteBatch}
            onPurgeAll={handlePurgeAll}
            isSyncing={isSyncing}
            isInitialLoading={isInitializing}
            isDataLoaded={isDataLoaded}
            userProfile={userProfile}
            currentUserEmail={user?.email}
          />
        )}

        {activeTab === 'import' && (
          <ImportModal
            isOpen={activeTab === 'import'}
            existingBatchNames={importLogs.map(l => l.batch_name).filter((b): b is string => Boolean(b))}
            onImportComplete={handleImportMembers}
            onClose={() => setActiveTab('dashboard')}
          />
        )}

        {activeTab === 'trends' && (
          <TrendsTab
            members={members}
            importLogs={importLogs}
            onNavigateToDashboard={(reportName) => navigateTo('dashboard', reportName)}
          />
        )}

        {activeTab === 'nudges' && (
          canSeeFullRoster ? (
            <NudgeSender
              members={members}
              importLogs={importLogs}
              initialReportName={selectedNudgeReport}
              onSelectReportName={(repName) => navigateTo('nudges', repName)}
              customSignature={org.custom_signature}
              orgId={org.id}
            />
          ) : (
            <AccessRequired
              title="Go Green Access Required"
              message="Messages are sent by chapter Admins and the Go Green committee. Ask one of your chapter's Admins if you should be on it."
            />
          )
        )}

        {activeTab === 'chat' && (
          canUseChapterAI ? (
            <ChatTab
              members={members}
              org={org}
              importLogs={importLogs}
              userProfile={userProfile}
              orgMember={orgMember}
              selfScopedOnly={!canSeeFullRoster}
            />
          ) : (
            <AccessRequired
              title="Not Linked Yet"
              message="Chapter AI can show you your own PALMS performance once your chapter's President or Vice President links your account to your roster entry. Ask them to link you from the Chapter tab."
            />
          )
        )}

        {/* Renewals hidden -- see validTabs.
        {activeTab === 'renewals' && (
          <RenewalsTab initialView={selectedNudgeReport === 'import' ? 'import' : undefined} />
        )} */}

        {activeTab === 'org' && (
          <OrganizationTab
            org={org}
            orgMember={orgMember}
            rosterMembers={members}
            onUpdateMembers={setMembers}
            userProfile={userProfile}
            currentUserEmail={user?.email}
          />
        )}

        {activeTab === 'profile' && (
          <ProfilePage
            profile={userProfile}
            org={org}
            orgMember={orgMember}
            onProfileUpdated={(updated) => setUserProfile(updated)}
            onLeaveOrganization={handleLeaveOrganization}
            onNavigateToChapter={() => navigateTo('org')}
          />
        )}

        {activeTab === 'settings' && (
          isAdminOrOwner(orgMember?.role) ? (
            <SettingsPage
              orgId={org.id}
              members={members}
              onSettingsSaved={() => {
                setMembers(prev => prev.map(m => scoreMember(m)));
              }}
            />
          ) : (
            // The Sidebar only hides the link; direct #settings navigation lands here.
            <AccessRequired
              title="Admin Access Required"
              message="Only chapter Admins can view chapter settings. Contact one of your chapter's Admins if you need something changed here."
            />
          )
        )}
      </div>

      {/* Member Detail Modal */}
      {selectedMember && (
        <MemberDetailModal
          isOpen={!!selectedMember}
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}
      </SidebarLayout>
    </>
  );
};

export default function App() {
  return <AppContent />;
}
