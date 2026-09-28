import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Member, Organization, ImportLog, UserProfileExtended, OrgMember } from '../types';
import { useToast } from '../context/ToastContext';
import { getWhatsAppUrl } from '../lib/whatsappUtils';
import { formatDecimal, formatCurrency } from '../lib/numberUtils';
import { supabaseService } from '../services/supabaseService';
import { geminiService } from '../services/geminiService';
import { analyzeLocalChapterQuery } from '../services/localAiEngine';
import { isAdminOrOwner } from '../lib/permissions';
import { ConfirmationModal } from './ConfirmationModal';
import { UniversalModal } from './UniversalModal';
import {
  Sparkles, Bot, User, Copy, Check, Share2, RotateCcw, Trash2,
  TrendingUp, AlertTriangle, Award, MessageSquare, Layers, FileSpreadsheet, ArrowRight,
  Send, Plus, History, Clock, RefreshCw
} from 'lucide-react';

// Lightweight markdown renderer: converts *bold* to <strong>, preserves line breaks
const renderFormattedText = (text: string): React.ReactNode => {
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    // Split on *bold* patterns and render <strong> tags
    const parts = line.split(/\*(.*?)\*/g);
    const rendered = parts.map((part, partIdx) => {
      // Odd indices are the captured groups (bold text)
      if (partIdx % 2 === 1) {
        return <strong key={partIdx} className="font-extrabold">{part}</strong>;
      }
      return part;
    });
    return (
      <span key={lineIdx}>
        {rendered}
        {lineIdx < lines.length - 1 && <br />}
      </span>
    );
  });
};

export interface ChatOption {
  id: string;
  label: string;
  action: string;
  payload?: any;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  options?: ChatOption[];
  timestamp: string;
  isCustomAnswer?: boolean;
  isRegenerated?: boolean;
}

interface ChatTabProps {
  members: Member[];
  org: Organization | null;
  importLogs?: ImportLog[];
  userProfile?: UserProfileExtended | null;
  orgMember?: OrgMember | null;
}

export const ChatTab: React.FC<ChatTabProps> = ({ members, org, importLogs = [], userProfile, orgMember }) => {
  const { showToast } = useToast();

  // Derive permission tier: owners and admins (President/VP) can see contact details.
  // Go Green committee members can see scores/zones/metrics but NOT phone numbers,
  // emails, or per-member TYFCB amounts.
  const canSeeContactDetails = isAdminOrOwner(orgMember?.role);
  const roleLabel = canSeeContactDetails
    ? (orgMember?.role === 'owner' ? 'President' : 'Vice President')
    : 'Go Green Committee Member';

  // Safe member property accessors (handles both PascalCase and snake_case from DB)
  const safeName = (m: any): string => m?.Name || m?.name || 'Member';
  const safePhone = (m: any): string => m?.Phone || m?.phone || 'N/A';
  const safeEmail = (m: any): string => m?.Email || m?.email || 'N/A';
  const safeScore = (m: any): number => m?.score || 0;
  const safeZone = (m: any): string => {
    const tl = m?.trafficLight?.label || m?.traffic_light || '';
    const s = String(tl).toLowerCase();
    if (s.includes('green')) return 'Green';
    if (s.includes('red')) return 'Red';
    return 'Amber';
  };
  const safeOneToOnes = (m: any): number => m?.OneToOnes || m?.one_to_ones || 0;
  const safeCEU = (m: any): number => m?.CEU || m?.ceu || 0;
  const safeRefs = (m: any): number => m?.ReferralsGivenRate ?? m?.RGT ?? m?.referrals_given ?? 0;
  const safeTYFCB = (m: any): number => m?.TYFCB || m?.tyfcb || 0;
  const safeBatch = (m: any): string => m?.batch_name || 'Latest';

  // Active Session Management (persisted in sessionStorage while app is open)
  const [sessionId, setSessionId] = useState<string>(() => {
    const existing = sessionStorage.getItem('bni_active_ai_session');
    if (existing) return existing;
    const newId = `sess_${Date.now()}`;
    sessionStorage.setItem('bni_active_ai_session', newId);
    return newId;
  });

  // Extract available report names
  const availableReportNames = useMemo(() => {
    const names = new Set<string>();
    importLogs.forEach(l => {
      if (l.batch_name && l.batch_name !== 'Master Roster') names.add(l.batch_name);
    });
    members.forEach(m => {
      if (m.batch_name && m.batch_name !== 'Master Roster') names.add(m.batch_name);
    });
    return Array.from(names);
  }, [members, importLogs]);

  // Main Menu Options
  const getMainMenuOptions = (): ChatOption[] => [
    { id: 'opt_reports', label: '📊 View Reports & Breakdown', action: 'LIST_REPORTS' },
    { id: 'opt_compare', label: '📈 Compare Two Reports', action: 'COMPARE_STEP_1' },
    { id: 'opt_exec', label: '📋 Chapter Executive Overview', action: 'QUERY_EXEC' },
  ];

  // Options for a specific report
  const getReportMenuOptions = (reportName: string): ChatOption[] => [
    { id: 'opt_rep_green', label: `🟢 Green Members in ${reportName}`, action: 'QUERY_GREEN_REPORT', payload: { reportName } },
    { id: 'opt_rep_red', label: `🔴 Red Support List in ${reportName}`, action: 'QUERY_RED_REPORT', payload: { reportName } },
    { id: 'opt_rep_amber', label: `🟡 Amber Members in ${reportName}`, action: 'QUERY_AMBER_REPORT', payload: { reportName } },
    { id: 'opt_rep_121', label: `🤝 Low 1-to-1s in ${reportName}`, action: 'QUERY_121_REPORT', payload: { reportName } },
    { id: 'opt_rep_tyfcb', label: `💰 TYFCB Leaders in ${reportName}`, action: 'QUERY_TYFCB_REPORT', payload: { reportName } },
    { id: 'opt_compare_this', label: `📈 Compare ${reportName} with another report`, action: 'COMPARE_STEP_1', payload: { baseReport: reportName } },
    { id: 'opt_all_reports', label: '📊 View All Reports List', action: 'LIST_REPORTS' },
    { id: 'opt_main', label: '🏠 Main Menu', action: 'MAIN_MENU' },
  ];

  const initialWelcomeMsg: ChatMessage = {
    id: 'welcome_1',
    sender: 'ai',
    text: `👋 *Welcome to ${org?.name || 'your'} Chapter AI, ${userProfile?.full_name ? userProfile.full_name.split(' ')[0] : 'Member'}!*\n\nI analyze live report data, track member performance trends across reports, monitor traffic light zones (Green, Amber, Red), and answer any question about your chapter.\n\nAsk me anything below or select an option to begin:`,
    options: getMainMenuOptions(),
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  const [messages, setMessages] = useState<ChatMessage[]>([initialWelcomeMsg]);

  // ID of the latest (last) AI message in current chat session
  const latestAiMsgId = useMemo(() => {
    const aiMsgs = messages.filter(m => m.sender === 'ai');
    return aiMsgs.length > 0 ? aiMsgs[aiMsgs.length - 1].id : null;
  }, [messages]);

  const [customInput, setCustomInput] = useState('');
  const [isTyping, setIsTyping] = useState<boolean>(() => {
    return sessionStorage.getItem(`bni_ai_is_processing_${sessionId}`) === 'true';
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  // History & Confirmation Modal States
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [pastSessions, setPastSessions] = useState<Array<{ session_id: string; last_text: string; created_at: string; msg_count: number }>>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeletingHistory, setIsDeletingHistory] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load active session chat history & setup Realtime WebSocket Listener
  useEffect(() => {
    let isMounted = true;
    async function loadActiveHistory() {
      if (!org?.id) return;
      try {
        const history = await supabaseService.getAIChatHistory(org.id, sessionId);
        if (isMounted && history && history.length > 0) {
          const parsed: ChatMessage[] = history.map((item: any) => ({
            id: item.id || `hist_${Math.random()}`,
            sender: item.sender || 'ai',
            text: item.text || '',
            options: item.options ? (typeof item.options === 'string' ? JSON.parse(item.options) : item.options) : [],
            timestamp: new Date(item.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }));
          setMessages(parsed);

          // Check if AI processing was in progress when user switched tabs
          const isPending = sessionStorage.getItem(`bni_ai_is_processing_${sessionId}`) === 'true';
          const lastMsg = parsed[parsed.length - 1];
          if (isPending && lastMsg && lastMsg.sender === 'user') {
            setIsTyping(true);
          } else {
            setIsTyping(false);
            sessionStorage.removeItem(`bni_ai_is_processing_${sessionId}`);
          }
        } else if (isMounted) {
          setMessages([initialWelcomeMsg]);
        }
      } catch (err) {
        console.warn('Failed loading chat history:', err);
      }
    }
    loadActiveHistory();

    // Supabase Realtime WebSocket Subscription for 0ms latency background updates
    let sub: any = null;
    if (org?.id) {
      sub = supabaseService.subscribeToAIChatHistory(org.id, () => {
        // Only re-fetch if component is mounted and we aren't actively generating a response locally
        if (isMounted) {
          loadActiveHistory();
        }
      });
    }

    const handleWindowFocus = () => {
      // Only reload on focus if we are awaiting a background response
      const isPending = sessionStorage.getItem(`bni_ai_is_processing_${sessionId}`) === 'true';
      if (isPending) {
        loadActiveHistory();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleWindowFocus);
      if (sub && typeof sub.unsubscribe === 'function') {
        sub.unsubscribe();
      }
    };
  }, [org?.id, sessionId]);

  // Fallback Polling ONLY when AI reply is in progress across tab switches
  useEffect(() => {
    let interval: any = null;
    const isPending = sessionStorage.getItem(`bni_ai_is_processing_${sessionId}`) === 'true';

    // Only run interval when actively pending and typing
    if (isPending && isTyping && org?.id) {
      interval = setInterval(async () => {
        try {
          const history = await supabaseService.getAIChatHistory(org.id, sessionId);
          if (history && history.length > 0) {
            const lastItem = history[history.length - 1];
            if (lastItem.sender === 'ai') {
              const parsed: ChatMessage[] = history.map((item: any) => ({
                id: item.id || `hist_${Math.random()}`,
                sender: item.sender || 'ai',
                text: item.text || '',
                options: item.options ? (typeof item.options === 'string' ? JSON.parse(item.options) : item.options) : [],
                timestamp: new Date(item.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              }));
              setMessages(parsed);
              setIsTyping(false);
              sessionStorage.removeItem(`bni_ai_is_processing_${sessionId}`);
            }
          }
        } catch (_) {}
      }, 3000); // 3s interval instead of 1.5s to reduce unnecessary API pressure
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sessionId, org?.id, isTyping]);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Save Chat Message to DB
  const saveMessageToDB = async (sender: 'user' | 'ai', text: string, options: ChatOption[] = []) => {
    if (org?.id) {
      await supabaseService.saveAIChatMessage(org.id, sender, text, options, sessionId);
    }
  };

  // Start New Chat Conversation
  const handleStartNewChat = () => {
    const newSessId = `sess_${Date.now()}`;
    sessionStorage.setItem('bni_active_ai_session', newSessId);
    setSessionId(newSessId);

    const welcome: ChatMessage = {
      id: `welcome_${Date.now()}`,
      sender: 'ai',
      text: `✨ *New Conversation Started*\n\nAsk me anything about ${org?.name || 'your chapter'} data or choose an analysis option below:`,
      options: getMainMenuOptions(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages([welcome]);
    showToast('Started new AI conversation', 'info');
  };

  // Share Entire Conversation via WhatsApp
  const handleShareConversation = () => {
    if (messages.length === 0) {
      showToast('No conversation to share!', 'warning');
      return;
    }
    let shareText = `💬 *Chapter AI Conversation Log*\n*Chapter:* ${org?.name || 'Handychapter'}\n\n`;
    messages.forEach(m => {
      const role = m.sender === 'user' ? '👤 *User*' : '🤖 *Chapter AI*';
      shareText += `${role} (${m.timestamp}):\n${m.text.trim()}\n\n`;
    });
    const url = getWhatsAppUrl('', shareText.trim());
    window.open(url, '_blank');
  };

  // Load Past Sessions List for History Modal
  const handleOpenHistoryModal = async () => {
    setIsHistoryModalOpen(true);
    if (!org?.id) return;
    setIsLoadingHistory(true);
    try {
      const sessions = await supabaseService.getAIChatSessions(org.id);
      setPastSessions(sessions);
    } catch (err) {
      console.warn('Failed fetching sessions:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Load specific session from history
  const handleSelectPastSession = async (targetSessionId: string) => {
    sessionStorage.setItem('bni_active_ai_session', targetSessionId);
    setSessionId(targetSessionId);
    setIsHistoryModalOpen(false);
    showToast('Loaded chat session from history', 'success');
  };

  // Confirm Delete All Chat History
  const handleConfirmDeleteAllHistory = async () => {
    if (!org?.id) return;
    setIsDeletingHistory(true);
    try {
      await supabaseService.clearAIChatHistory(org.id);

      const newSessId = `sess_${Date.now()}`;
      sessionStorage.setItem('bni_active_ai_session', newSessId);
      setSessionId(newSessId);
      setMessages([initialWelcomeMsg]);
      setPastSessions([]);

      showToast('All chat history deleted successfully!', 'success');
    } catch (err) {
      showToast('Failed to delete history', 'error');
    } finally {
      setIsDeletingHistory(false);
      setIsDeleteConfirmOpen(false);
      setIsHistoryModalOpen(false);
    }
  };

  // Handle Free-Form Natural Language Custom Message
  const handleSendCustomMessage = async () => {
    const text = customInput.trim();
    if (!text || isTyping) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setCustomInput('');
    setIsTyping(true);
    sessionStorage.setItem(`bni_ai_is_processing_${sessionId}`, 'true');
    await saveMessageToDB('user', userMsg.text);

    try {
      // Fetch fresh real-time read-only Supabase snapshot (All tables & fields for this org_id)
      const snapshot = org?.id
        ? await supabaseService.getCompleteOrgSnapshot(org.id)
        : { organization: org, members: members, importLogs: [], templates: [] };

      // Fall back gracefully if snapshot is loading
      if (!snapshot.organization && org) snapshot.organization = org;
      if ((!snapshot.members || snapshot.members.length === 0) && members) snapshot.members = members;

      // Ask Gemini AI LLM with complete read-only database snapshot context and full conversation history
      const geminiReply = await geminiService.askGemini(
        text,
        snapshot,
        userProfile,
        messages,
        0.2,
        { canSeeContactDetails, roleLabel }
      );

      let replyText = '';
      let replyOptions: ChatOption[] = [
        { id: 'opt_main', label: '🏠 Main Menu', action: 'MAIN_MENU' }
      ];

      if (geminiReply && geminiReply.trim()) {
        replyText = geminiReply.trim();
      } else {
        // Smart Local AI Data Engine fallback with full read-time snapshot context, conversation history & counter-questions
        replyText = analyzeLocalChapterQuery(text, snapshot, userProfile, messages, { canSeeContactDetails, roleLabel });
      }

      const aiMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: 'ai',
        text: replyText,
        options: replyOptions,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isCustomAnswer: true,
      };

      setMessages(prev => [...prev, aiMsg]);
      await saveMessageToDB('ai', aiMsg.text, aiMsg.options);
    } catch (err) {
      console.error('Error handling AI message:', err);
      const fallbackSnapshot = { organization: org, members: members, importLogs: [], templates: [] };
      const localReply = analyzeLocalChapterQuery(text, fallbackSnapshot, userProfile, [], { canSeeContactDetails, roleLabel });
      const errorMsg: ChatMessage = {
        id: `ai_err_${Date.now()}`,
        sender: 'ai',
        text: localReply,
        options: [{ id: 'opt_main', label: '🏠 Main Menu', action: 'MAIN_MENU' }],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isCustomAnswer: true,
      };
      setMessages(prev => [...prev, errorMsg]);
      await saveMessageToDB('ai', errorMsg.text, errorMsg.options);
    } finally {
      setIsTyping(false);
      sessionStorage.removeItem(`bni_ai_is_processing_${sessionId}`);
    }
  };

  // Handle Single-Use Response Regeneration for Custom User Queries
  const handleRegenerateMessage = async (msgToRegenerate: ChatMessage) => {
    if (msgToRegenerate.isRegenerated || isTyping || regeneratingId) return;

    setRegeneratingId(msgToRegenerate.id);
    setIsTyping(true);

    try {
      const snapshot = org?.id
        ? await supabaseService.getCompleteOrgSnapshot(org.id)
        : { organization: org, members: members, importLogs: [], templates: [] };

      if (!snapshot.organization && org) snapshot.organization = org;
      if ((!snapshot.members || snapshot.members.length === 0) && members) snapshot.members = members;

      // Find the preceding user question
      const msgIndex = messages.findIndex(m => m.id === msgToRegenerate.id);
      let promptText = '';
      for (let i = msgIndex - 1; i >= 0; i--) {
        if (messages[i].sender === 'user') {
          promptText = messages[i].text;
          break;
        }
      }

      if (!promptText) promptText = 'give me executive summary';

      // Construct self-correction prompt analyzing why user regenerated
      const selfCorrectionPrompt = `${promptText}

[SYSTEM REGENERATION DIRECTIVE - CRITICAL SELF-CORRECTION REQUIRED]:
The user requested a REGENERATION of your previous response because the previous answer was incomplete, generic, or missing expected details.

PREVIOUS REJECTED RESPONSE:
"${msgToRegenerate.text}"

REGENERATION INSTRUCTIONS:
1. Identify why the previous response was unsatisfactory (e.g. missing names, incomplete list, generic advice, or lack of direct stats).
2. Provide a MUCH MORE COMPREHENSIVE, COMPLETE, AND DETAILED RESPONSE using the real-time Supabase snapshot data.
3. Ensure all member names, scores, phone contacts, 1-to-1s, and TYFCB revenue are fully detailed without truncating.
4. Conclude with a direct, specific follow-up action.`;

      // Re-query Gemini AI with self-correction context and higher temperature
      const geminiReply = await geminiService.askGemini(
        selfCorrectionPrompt,
        snapshot,
        userProfile,
        messages.slice(0, msgIndex),
        0.8,
        { canSeeContactDetails, roleLabel }
      );

      let newReplyText = '';
      if (geminiReply && geminiReply.trim()) {
        newReplyText = geminiReply.trim();
      } else {
        newReplyText = analyzeLocalChapterQuery(promptText, snapshot, userProfile, messages.slice(0, msgIndex), { canSeeContactDetails, roleLabel });
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === msgToRegenerate.id
            ? { ...m, text: newReplyText, isRegenerated: true }
            : m
        )
      );

      showToast('Response regenerated!', 'success');
    } catch (err) {
      console.error('Regeneration error:', err);
      showToast('Failed to regenerate response', 'error');
    } finally {
      setIsTyping(false);
      setRegeneratingId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendCustomMessage();
    }
  };

  // Option Action Handler
  const handleOptionSelect = async (option: ChatOption) => {
    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: option.label,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);
    await saveMessageToDB('user', userMsg.text);

    setTimeout(async () => {
      let replyText = '';
      let replyOptions: ChatOption[] = [];

      switch (option.action) {
        case 'MAIN_MENU':
          replyText = `🏠 *Main Menu*\n\nPlease select an analysis category below:`;
          replyOptions = getMainMenuOptions();
          break;

        case 'LIST_REPORTS':
          if (availableReportNames.length === 0) {
            replyText = `📊 *Available Reports*\n\nNo uploaded report records were found in your organization database. Import an Excel file in Organization settings to view and audit reports.`;
            replyOptions = [{ id: 'opt_main', label: '🏠 Back to Main Menu', action: 'MAIN_MENU' }];
          } else {
            replyText = `📊 *Available Reports Overview (${availableReportNames.length} Total Reports)*\n\nSelect a report to view its detailed performance breakdown:`;
            replyOptions = [
              ...availableReportNames.map((name, i) => ({
                id: `rep_${i}`,
                label: `📄 ${name}`,
                action: 'VIEW_SINGLE_REPORT',
                payload: { reportName: name },
              })),
              { id: 'opt_main', label: '🏠 Back to Main Menu', action: 'MAIN_MENU' }
            ];
          }
          break;

        case 'VIEW_SINGLE_REPORT': {
          const reportName = option.payload?.reportName;
          const reportMembers = members.filter(m => safeBatch(m) === reportName);

          const g = reportMembers.filter(m => safeZone(m) === 'Green').length;
          const a = reportMembers.filter(m => safeZone(m) === 'Amber').length;
          const r = reportMembers.filter(m => safeZone(m) === 'Red').length;
          const avg = reportMembers.length > 0
            ? reportMembers.reduce((sum, m) => sum + safeScore(m), 0) / reportMembers.length
            : 0;

          const gPct = reportMembers.length > 0 ? formatDecimal((g / reportMembers.length) * 100, 1) : 0;
          const aPct = reportMembers.length > 0 ? formatDecimal((a / reportMembers.length) * 100, 1) : 0;
          const rPct = reportMembers.length > 0 ? formatDecimal((r / reportMembers.length) * 100, 1) : 0;

          replyText = `📄 *Executive Report Audit: ${reportName}*\n\n` +
            `📊 *Key Summary:*\n` +
            `• Tracked Members: ${reportMembers.length} members\n` +
            `• PALMS Average: ${formatDecimal(avg, 1)} / 100 pts\n\n` +
            `🚦 *Zone Distribution:*\n` +
            `🟢 *Green Zone:* ${g} members (${gPct}%)\n` +
            `🟡 *Amber Zone:* ${a} members (${aPct}%)\n` +
            `🔴 *Red Zone:* ${r} members (${rPct}%)\n\n` +
            `💡 *AI Leadership Focus:*\n` +
            `Prioritize 1-to-1 support for Amber members to elevate them to Green status this week.`;

          replyOptions = getReportMenuOptions(reportName);
          break;
        }

        case 'QUERY_GREEN_REPORT': {
          const rName = option.payload?.reportName;
          const rMembers = members.filter(m => safeBatch(m) === rName && safeZone(m) === 'Green');

          if (rMembers.length === 0) {
            replyText = `🟢 *Green Zone Audit (${rName})*\n\nCurrently, no members are listed in the Green Zone for this report period.`;
          } else {
            replyText = `🟢 *Green Zone Leaders (${rMembers.length} Members)*\n` +
              `*Report:* ${rName}\n\n`;

            rMembers.forEach((m, idx) => {
              const refs = safeRefs(m);
              const contactLine = canSeeContactDetails ? ` (📱 ${safePhone(m)})` : '';
              const tyfcbLine = canSeeContactDetails ? `   • TYFCB: ${formatCurrency(safeTYFCB(m))}\n\n` : '\n';
              replyText += `${idx + 1}. *${safeName(m)}* — ${safeScore(m)} pts${contactLine}\n` +
                `   • 1-to-1s: ${formatDecimal(safeOneToOnes(m), 1)}/wk | CEU: ${formatDecimal(safeCEU(m), 1)}/wk | Referrals: ${formatDecimal(refs, 1)}/wk\n` +
                tyfcbLine;
            });

            replyText += `💡 *Leadership Action:*\nAcknowledge these top contributors in your next meeting!`;
          }

          replyOptions = [
            { id: 'opt_draft_green', label: `💬 Draft WhatsApp Message for Green Members`, action: 'DRAFT_DYNAMIC_MSG', payload: { reportName: rName, zone: 'Green' } },
            { id: 'opt_rep_back', label: `📄 Back to ${rName}`, action: 'VIEW_SINGLE_REPORT', payload: { reportName: rName } },
            { id: 'opt_main', label: '🏠 Main Menu', action: 'MAIN_MENU' },
          ];
          break;
        }

        case 'QUERY_RED_REPORT': {
          const rName = option.payload?.reportName;
          const rMembers = members.filter(m => safeBatch(m) === rName && safeZone(m) === 'Red');

          if (rMembers.length === 0) {
            replyText = `🎉 *Red Zone Alert (${rName})*\n\nGreat news! 0 members are in the Red Zone for this report period. All members are Amber or Green!`;
          } else {
            replyText = `🔴 *Red Zone Support List (${rMembers.length} Members)*\n` +
              `*Report:* ${rName}\n\n`;

            rMembers.forEach((m, idx) => {
              const refs = safeRefs(m);
              const contactLine = canSeeContactDetails ? ` (📱 ${safePhone(m)})` : '';
              replyText += `${idx + 1}. *${safeName(m)}* — ${safeScore(m)}/100 pts${contactLine}\n` +
                `   • 1-to-1s: ${formatDecimal(safeOneToOnes(m), 1)}/wk | CEU: ${formatDecimal(safeCEU(m), 1)}/wk | Referrals: ${formatDecimal(refs, 1)}/wk\n\n`;
            });

            replyText += `💡 *Action Plan:*\n` +
              `1. Schedule 1-to-1 catch-up calls this week.\n` +
              `2. Pair with a Green zone mentor for joint networking.\n` +
              `3. Review feature presentation scheduling.`;
          }

          replyOptions = [
            { id: 'opt_draft_red', label: `💬 Draft WhatsApp Support Nudge for Red Members`, action: 'DRAFT_DYNAMIC_MSG', payload: { reportName: rName, zone: 'Red' } },
            { id: 'opt_rep_back', label: `📄 Back to ${rName}`, action: 'VIEW_SINGLE_REPORT', payload: { reportName: rName } },
            { id: 'opt_main', label: '🏠 Main Menu', action: 'MAIN_MENU' },
          ];
          break;
        }

        case 'QUERY_AMBER_REPORT': {
          const rName = option.payload?.reportName;
          const rMembers = members.filter(m => safeBatch(m) === rName && safeZone(m) === 'Amber');

          if (rMembers.length === 0) {
            replyText = `🟡 *Amber Zone Audit (${rName})*\n\n0 members are currently in the Amber Zone for this report period.`;
          } else {
            replyText = `🟡 *Amber Zone Candidates (${rMembers.length} Members)*\n` +
              `*Report:* ${rName}\n\n`;

            rMembers.forEach((m, idx) => {
              const refs = safeRefs(m);
              const contactLine = canSeeContactDetails ? ` (📱 ${safePhone(m)})` : '';
              replyText += `${idx + 1}. *${safeName(m)}* — ${safeScore(m)}/100 pts${contactLine}\n` +
                `   • 1-to-1s: ${formatDecimal(safeOneToOnes(m), 1)}/wk | CEU: ${formatDecimal(safeCEU(m), 1)}/wk | Referrals: ${formatDecimal(refs, 1)}/wk\n\n`;
            });

            replyText += `💡 *Action:* 1 additional CEU module or 1-to-1 meeting elevates them to Green!`;
          }

          replyOptions = [
            { id: 'opt_draft_amber', label: `💬 Draft WhatsApp Nudge for Amber Members`, action: 'DRAFT_DYNAMIC_MSG', payload: { reportName: rName, zone: 'Amber' } },
            { id: 'opt_rep_back', label: `📄 Back to ${rName}`, action: 'VIEW_SINGLE_REPORT', payload: { reportName: rName } },
            { id: 'opt_main', label: '🏠 Main Menu', action: 'MAIN_MENU' },
          ];
          break;
        }

        case 'QUERY_121_REPORT': {
          const rName = option.payload?.reportName;
          const rMembers = members.filter(m => safeBatch(m) === rName && safeOneToOnes(m) < 2);

          if (rMembers.length === 0) {
            replyText = `🤝 *1-to-1 Meetings Audit (${rName})*\n\nAll members in this report period have completed 2 or more 1-to-1 meetings! Outstanding collaboration!`;
          } else {
            replyText = `🤝 *1-to-1 Meetings Needed (${rMembers.length} Members)*\n` +
              `*Report:* ${rName}\n\n`;

            rMembers.forEach((m, idx) => {
              const contactLine = canSeeContactDetails ? ` (📱 ${safePhone(m)})` : '';
              replyText += `${idx + 1}. *${safeName(m)}* — ${formatDecimal(safeOneToOnes(m), 1)} meetings/wk${contactLine}\n`;
            });

            replyText += `\n💡 *Action:* Pair these members during feature presentations!`;
          }

          replyOptions = [
            { id: 'opt_rep_back', label: `📄 Back to ${rName}`, action: 'VIEW_SINGLE_REPORT', payload: { reportName: rName } },
            { id: 'opt_main', label: '🏠 Main Menu', action: 'MAIN_MENU' },
          ];
          break;
        }

        case 'QUERY_TYFCB_REPORT': {
          const rName = option.payload?.reportName;
          const rMembers = members.filter(m => safeBatch(m) === rName);
          const sortedTYFCB = [...rMembers].sort((a, b) => safeTYFCB(b) - safeTYFCB(a));
          const totalTYFCB = rMembers.reduce((sum, m) => sum + safeTYFCB(m), 0);

          if (canSeeContactDetails) {
            replyText = `💰 *TYFCB Business Breakdown (${sortedTYFCB.length} Members)*\n` +
              `*Report:* ${rName}\n\n`;
            sortedTYFCB.forEach((m, idx) => {
              replyText += `${idx + 1}. *${safeName(m)}* — ${formatCurrency(safeTYFCB(m))}\n`;
            });
            replyText += `\n📈 *Total Closed in ${rName}:* ${formatCurrency(totalTYFCB)}`;
          } else {
            replyText = `💰 *TYFCB Business Summary for ${rName}*\n\n` +
              `📈 *Total Chapter Closed Business:* ${formatCurrency(totalTYFCB)}\n` +
              `👥 *Contributing Members:* ${sortedTYFCB.filter(m => safeTYFCB(m) > 0).length} of ${sortedTYFCB.length}\n\n` +
              `🔒 *Per-member TYFCB amounts are available to the President and Vice President only.*`;
          }

          replyOptions = [
            { id: 'opt_rep_back', label: `📄 Back to ${rName}`, action: 'VIEW_SINGLE_REPORT', payload: { reportName: rName } },
            { id: 'opt_main', label: '🏠 Main Menu', action: 'MAIN_MENU' },
          ];
          break;
        }

        case 'DRAFT_DYNAMIC_MSG': {
          const rName = option.payload?.reportName || 'latest report';
          const zone = option.payload?.zone || 'Amber';

          if (zone === 'Green') {
            replyText = `💬 *Dynamic WhatsApp Message for ${zone} Zone Members*\n\n` +
              `Hi {{member_name}} 🌟\n\n` +
              `Congratulations! You are leading in the *GREEN Zone* with *{{score}}/100* points in our ${rName} report! 🟢\n\n` +
              `Thank you for your outstanding contribution to our chapter! Keep up the momentum! 🚀`;
          } else if (zone === 'Red') {
            replyText = `💬 *Dynamic WhatsApp Support Message for ${zone} Zone Members*\n\n` +
              `Hi {{member_name}} 👋\n\n` +
              `We noticed you are currently at *{{score}}/100* points in our ${rName} report.\n\n` +
              `We are here to support your business growth! Let us schedule a quick 1-to-1 call this week to get you back into the Green Zone. 💪`;
          } else {
            replyText = `💬 *Dynamic WhatsApp Nudge for ${zone} Zone Members*\n\n` +
              `Hi {{member_name}} 👋\n\n` +
              `Great effort! You are currently in the *Amber Zone* with *{{score}}/100* points in our ${rName} report.\n\n` +
              `You are just a few points away from Green! 🚀 Completing 1 CEU module or booking 1 One-to-One meeting this week will elevate you to Green status. Let us reach Green together! 💪`;
          }

          replyOptions = [
            { id: 'opt_rep_back', label: `📄 Back to ${rName}`, action: 'VIEW_SINGLE_REPORT', payload: { reportName: rName } },
            { id: 'opt_main', label: '🏠 Main Menu', action: 'MAIN_MENU' },
          ];
          break;
        }

        case 'COMPARE_STEP_1':
          if (availableReportNames.length < 2) {
            replyText = `📈 *Report Comparison*\n\nYou need at least 2 uploaded reports in your organization database to compare trends! Currently available: ${availableReportNames.length} report.`;
            replyOptions = [{ id: 'opt_main', label: '🏠 Main Menu', action: 'MAIN_MENU' }];
          } else {
            replyText = `📈 *Report Comparison (Step 1 of 2)*\n\nI will audit score deltas, Green zone growth, and Red zone shifts between two reports.\n\nPlease select *Report A (Base Report)* below:`;
            replyOptions = [
              ...availableReportNames.map((name, i) => ({
                id: `cmp_a_${i}`,
                label: `📄 Report A: ${name}`,
                action: 'COMPARE_STEP_2',
                payload: { reportA: name },
              })),
              { id: 'opt_main', label: '🏠 Cancel / Main Menu', action: 'MAIN_MENU' }
            ];
          }
          break;

        case 'COMPARE_STEP_2': {
          const repA = option.payload?.reportA;
          const remainingReports = availableReportNames.filter(n => n !== repA);

          replyText = `📈 *Report Comparison (Step 2 of 2)*\n\n*Base Report A Selected:* ${repA}\n\nNow select *Report B (Target Report)* to compare against ${repA}:`;
          replyOptions = [
            ...remainingReports.map((name, i) => ({
              id: `cmp_b_${i}`,
              label: `📄 Report B: ${name}`,
              action: 'EXECUTE_COMPARISON',
              payload: { reportA: repA, reportB: name },
            })),
            { id: 'opt_cmp_restart', label: '🔄 Pick Different Base Report', action: 'COMPARE_STEP_1' },
            { id: 'opt_main', label: '🏠 Main Menu', action: 'MAIN_MENU' }
          ];
          break;
        }

        case 'EXECUTE_COMPARISON': {
          const rA = option.payload?.reportA;
          const rB = option.payload?.reportB;

          const mAList = members.filter(m => safeBatch(m) === rA);
          const mBList = members.filter(m => safeBatch(m) === rB);

          const avgA = mAList.length > 0 ? mAList.reduce((sum, m) => sum + safeScore(m), 0) / mAList.length : 0;
          const avgB = mBList.length > 0 ? mBList.reduce((sum, m) => sum + safeScore(m), 0) / mBList.length : 0;
          const delta = avgB - avgA;

          const greenA = mAList.filter(m => safeZone(m) === 'Green').length;
          const greenB = mBList.filter(m => safeZone(m) === 'Green').length;

          const redA = mAList.filter(m => safeZone(m) === 'Red').length;
          const redB = mBList.filter(m => safeZone(m) === 'Red').length;

          const tyfcbA = mAList.reduce((sum, m) => sum + safeTYFCB(m), 0);
          const tyfcbB = mBList.reduce((sum, m) => sum + safeTYFCB(m), 0);

          replyText = `📈 *Report Comparison: ${rA} ➔ ${rB}*\n\n` +
            `📊 *Chapter Movement:*\n` +
            `• *Avg Score:* ${formatDecimal(avgA, 1)} ➔ ${formatDecimal(avgB, 1)} pts (*${delta >= 0 ? '+' : ''}${formatDecimal(delta, 1)} pts*)\n` +
            `• *🟢 Green Zone:* ${greenA} ➔ ${greenB} members (*${greenB - greenA >= 0 ? '+' : ''}${greenB - greenA}*)\n` +
            `• *🔴 Red Zone:* ${redA} ➔ ${redB} members (*${redB - redA <= 0 ? '' : '+'}${redB - redA}*)\n` +
            `• *💰 Total TYFCB:* ${formatCurrency(tyfcbA)} ➔ ${formatCurrency(tyfcbB)}\n\n` +
            `💡 *AI Assessment:*\n` +
            (delta >= 0
              ? `Performance improved by +${formatDecimal(delta, 1)} pts from ${rA} to ${rB}. Excellent momentum!`
              : `Chapter average declined by ${formatDecimal(delta, 1)} pts from ${rA} to ${rB}. Review Amber nudges.`);

          replyOptions = [
            { id: 'opt_swap', label: `⇄ Swap ${rA} & ${rB}`, action: 'EXECUTE_COMPARISON', payload: { reportA: rB, reportB: rA } },
            { id: 'opt_new_cmp', label: '📈 Compare Different Reports', action: 'COMPARE_STEP_1' },
            { id: 'opt_main', label: '🏠 Main Menu', action: 'MAIN_MENU' }
          ];
          break;
        }

        case 'QUERY_EXEC': {
          const total = members.length;
          const g = members.filter(m => safeZone(m) === 'Green').length;
          const a = members.filter(m => safeZone(m) === 'Amber').length;
          const r = members.filter(m => safeZone(m) === 'Red').length;
          const avg = total > 0 ? members.reduce((sum, m) => sum + safeScore(m), 0) / total : 0;
          const tyfcb = members.reduce((sum, m) => sum + safeTYFCB(m), 0);

          replyText = `📋 *Chapter Executive Overview*\n\n` +
            `• *Total Reports:* ${availableReportNames.length} reports\n` +
            `• *Tracked Members:* ${total} members\n` +
            `• *Overall PALMS Average:* ${formatDecimal(avg, 1)} pts\n` +
            `• *Zone Breakdown:* 🟢 ${g} Green | 🟡 ${a} Amber | 🔴 ${r} Red\n` +
            `• *Total TYFCB Closed:* ${formatCurrency(tyfcb)}`;

          replyOptions = [
            { id: 'opt_reports', label: '📊 View Reports & Breakdown', action: 'LIST_REPORTS' },
            { id: 'opt_compare', label: '📈 Compare Two Reports', action: 'COMPARE_STEP_1' },
            { id: 'opt_main', label: '🏠 Main Menu', action: 'MAIN_MENU' }
          ];
          break;
        }

        default:
          replyText = `Select an option below:`;
          replyOptions = getMainMenuOptions();
          break;
      }

      const aiMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: 'ai',
        text: replyText,
        options: replyOptions,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
      await saveMessageToDB('ai', aiMsg.text, aiMsg.options);
    }, 400);
  };

  // Clean Text Extractor for Copy & WhatsApp Sharing
  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text.trim());
    setCopiedId(id);
    showToast('Copied message text!', 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleShareWhatsApp = (text: string) => {
    const url = getWhatsAppUrl('', text.trim());
    window.open(url, '_blank');
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-transparent">
      {/* Pinned Top Header Bar (Chapter AI Title, New Chat, History, Share Conversation) */}
      <div className="ai-chat-navbar shrink-0 px-3 sm:px-6 py-3 flex items-center justify-between z-10">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Bot className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Chapter AI</h2>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 sm:space-x-2">
          {/* Share Conversation Button */}
          <button
            onClick={handleShareConversation}
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs font-black flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95 shadow-sm"
            title="Share Entire Conversation via WhatsApp"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Share Log</span>
          </button>

          {/* New Chat Button */}
          <button
            onClick={handleStartNewChat}
            className="ai-chat-nav-btn-secondary p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 text-xs font-black flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95 shadow-sm"
            title="Start New Chat Session"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Chat</span>
          </button>

          {/* History Drawer Button */}
          <button
            onClick={handleOpenHistoryModal}
            className="ai-chat-nav-btn-secondary p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 text-xs font-black flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95 shadow-sm"
            title="View Chat History"
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">History</span>
          </button>
        </div>
      </div>

      {/* Edge-to-Edge Conversational Stream (Only this section scrolls) */}
      <div className="flex-1 min-h-0 px-2 sm:px-8 py-4 overflow-y-auto space-y-4 no-scrollbar overscroll-contain">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((msg) => {
            const isMenuMessage = msg.text.includes('Main Menu') || msg.text.includes('Welcome to');

            return (
              <div
                key={msg.id}
                className={`flex items-start space-x-2.5 animate-fadeIn ${
                  msg.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                }`}
              >
                {/* Avatar Icon */}
                {msg.sender === 'user' ? (
                  userProfile?.avatar_url ? (
                    <img
                      src={userProfile.avatar_url}
                      alt={userProfile.full_name || 'User Profile'}
                      className="w-7 h-7 rounded-full object-cover border border-emerald-400/60 shadow-md shrink-0 mt-0.5"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-500 text-slate-950 font-black flex items-center justify-center text-xs shrink-0 mt-0.5 shadow-md border border-emerald-400/40 uppercase">
                      {userProfile?.full_name ? userProfile.full_name.charAt(0) : <User className="w-4 h-4" />}
                    </div>
                  )
                ) : (
                  <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 shadow-md">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                {/* Message Bubble (Theme Adaptive) */}
                <div
                  className={`max-w-[92%] sm:max-w-[85%] rounded-2xl p-3.5 space-y-2.5 text-xs sm:text-sm leading-relaxed shadow-md ${
                    msg.sender === 'user'
                      ? 'ai-chat-user-bubble rounded-tr-none'
                      : 'ai-chat-ai-bubble rounded-tl-none'
                  }`}
                >
                  {/* Markdown Message Content */}
                  <div className="whitespace-pre-wrap font-sans leading-relaxed">{renderFormattedText(msg.text)}</div>

                  {/* Message Timestamp */}
                  <div className="text-[9px] opacity-50 text-right mt-1 font-mono">
                    {msg.timestamp}
                  </div>

                  {/* Interactive Step Options Inside AI Message Bubble */}
                  {msg.sender === 'ai' && msg.options && msg.options.length > 0 && (
                    <div className="pt-2 border-t border-slate-200/50 dark:border-white/10 space-y-1.5">
                      <div className="flex flex-col gap-1.5">
                        {msg.options.map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => handleOptionSelect(opt)}
                            disabled={isTyping}
                            className="w-full text-left px-3.5 py-2.5 rounded-xl ai-chat-option-btn text-xs font-bold transition-all active:scale-98 cursor-pointer flex items-center justify-between group shadow-sm disabled:opacity-50"
                          >
                            <span className="truncate">{opt.label}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Message Action Bar (Copy, WhatsApp & Single-Use Regenerate) - Hidden on Main Menu messages */}
                  {msg.sender === 'ai' && !isMenuMessage && (
                    <div className="pt-2 border-t border-slate-200/50 dark:border-white/10 flex items-center justify-end space-x-2 flex-wrap gap-y-1">
                      {/* Copy Message Button */}
                      <button
                        onClick={() => handleCopyText(msg.text, msg.id)}
                        className="px-2 py-1 rounded-lg ai-chat-action-btn text-[10px] font-bold flex items-center space-x-1 transition-all cursor-pointer"
                      >
                        {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-slate-400" />}
                        <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                      </button>

                      {/* WhatsApp Share Button */}
                      <button
                        onClick={() => handleShareWhatsApp(msg.text)}
                        className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-black flex items-center space-x-1 border border-emerald-500/30 transition-all cursor-pointer"
                      >
                        <Share2 className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                        <span>WhatsApp</span>
                      </button>

                      {/* Single-Use Regenerate Button: Shown ONLY on the LATEST AI reply to a custom message! */}
                      {msg.id === latestAiMsgId && (msg.isCustomAnswer || (!msg.options || msg.options.length === 0 || msg.options.every(o => o.action === 'MAIN_MENU'))) && (
                        <button
                          onClick={() => handleRegenerateMessage(msg)}
                          disabled={msg.isRegenerated || isTyping || regeneratingId === msg.id}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center space-x-1 transition-all border ${
                            msg.isRegenerated
                              ? 'bg-slate-500/10 text-slate-400 border-slate-500/20 cursor-not-allowed'
                              : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 border-indigo-500/30 cursor-pointer active:scale-95'
                          }`}
                        >
                          <RefreshCw className={`w-3 h-3 ${regeneratingId === msg.id ? 'animate-spin' : ''}`} />
                          <span>{msg.isRegenerated ? 'Regenerated ✓' : 'Regenerate (1 left)'}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400 text-xs italic pl-2 animate-pulse">
              <Bot className="w-4 h-4 text-emerald-500 dark:text-emerald-400 animate-spin" />
              <span>Chapter AI is analyzing database...</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Pinned Bottom Text Input Box & Send Button Bar (Mobile & Laptop Friendly) */}
      <div className="ai-chat-input-bar shrink-0 px-3 sm:px-6 pt-2.5 pb-[95px] lg:pb-3 z-10">
        <div className="ai-chat-input-wrap max-w-4xl mx-auto flex items-center space-x-2 p-1.5 sm:p-2 rounded-2xl shadow-sm">
          <input
            type="text"
            placeholder="Ask AI anything about members, scores, reports..."
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isTyping}
            className="ai-chat-input-field flex-1 bg-transparent px-3 py-1.5 text-xs sm:text-sm font-bold placeholder-slate-500 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSendCustomMessage}
            disabled={!customInput.trim() || isTyping}
            className="w-9 h-9 sm:w-auto sm:h-auto p-2 sm:px-4 sm:py-2 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-slate-950 font-extrabold text-xs flex items-center justify-center space-x-1.5 shadow-md hover:from-emerald-400 hover:to-teal-400 disabled:opacity-40 transition-all active:scale-95 cursor-pointer shrink-0"
            title="Send Message"
          >
            <span className="hidden sm:inline">Send</span>
            <Send className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </button>
        </div>
      </div>

      {/* Chat History Sessions Modal */}
      <UniversalModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        title="Chapter AI History"
        icon={<Clock className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />}
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
              Past Chat Conversations ({pastSessions.length})
            </span>

            {pastSessions.length > 0 && (
              <button
                onClick={() => setIsDeleteConfirmOpen(true)}
                className="px-2.5 py-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete All History</span>
              </button>
            )}
          </div>

          <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1 no-scrollbar">
            {isLoadingHistory ? (
              <div className="py-8 text-center text-xs text-slate-400 font-semibold animate-pulse">
                Loading chat history sessions...
              </div>
            ) : pastSessions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 font-semibold">
                No past chat history found. Start chatting to save sessions!
              </div>
            ) : (
              pastSessions.map((sess) => {
                const isCurrent = sess.session_id === sessionId;
                const formattedDate = new Date(sess.created_at || Date.now()).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={sess.session_id}
                    onClick={() => handleSelectPastSession(sess.session_id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isCurrent
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 shadow-sm'
                        : 'bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 border-slate-300/70 dark:border-white/10 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-extrabold truncate">{sess.last_text || 'Conversation'}</span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase shrink-0">
                            Active
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        {formattedDate} &bull; {sess.msg_count} messages
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </UniversalModal>

      {/* Delete Chat History Confirmation Modal */}
      <ConfirmationModal
        isOpen={isDeleteConfirmOpen}
        type="purge"
        title="Delete All AI Chat History"
        message="Are you sure you want to delete ALL past AI chat history for your organization? This will permanently erase all conversation logs from the database."
        confirmText="Delete All History"
        onConfirm={handleConfirmDeleteAllHistory}
        onClose={() => setIsDeleteConfirmOpen(false)}
        isLoading={isDeletingHistory}
      />
    </div>
  );
};
