import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Member, Organization, ImportLog, UserProfileExtended } from '../types';
import { useToast } from '../context/ToastContext';
import { getWhatsAppUrl } from '../lib/whatsappUtils';
import { formatDecimal, formatCurrency } from '../lib/numberUtils';
import { supabaseService } from '../services/supabaseService';
import { ConfirmationModal } from './ConfirmationModal';
import {
  Sparkles, Bot, User, Copy, Check, Share2, RotateCcw, Trash2,
  TrendingUp, AlertTriangle, Award, MessageSquare, Layers, FileSpreadsheet, ArrowRight
} from 'lucide-react';

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
}

interface ChatTabProps {
  members: Member[];
  org: Organization | null;
  importLogs?: ImportLog[];
  userProfile?: UserProfileExtended | null;
}

export const ChatTab: React.FC<ChatTabProps> = ({ members, org, importLogs = [], userProfile }) => {
  const { showToast } = useToast();

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

  // Main Menu Options (Clean Report-Based Entry)
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
    text: `👋 Welcome to ${org?.name || 'your'} Executive AI Assistant!\n\nI analyze live report data, track member performance trends across reports, monitor traffic light zones (Green, Amber, Red), and generate targeted WhatsApp outreach plans for your chapter leadership team.\n\nPlease select an option below to begin:`,
    options: getMainMenuOptions(),
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  const [messages, setMessages] = useState<ChatMessage[]>([initialWelcomeMsg]);
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load chat history from Supabase on mount
  useEffect(() => {
    let isMounted = true;
    async function loadHistory() {
      if (!org?.id) return;
      try {
        const history = await supabaseService.getAIChatHistory(org.id);
        if (isMounted && history && history.length > 0) {
          const parsed: ChatMessage[] = history.map((item: any) => ({
            id: item.id || `hist_${Math.random()}`,
            sender: item.sender || 'ai',
            text: item.text || '',
            options: item.options ? (typeof item.options === 'string' ? JSON.parse(item.options) : item.options) : [],
            timestamp: new Date(item.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }));
          setMessages(parsed);
        }
      } catch (err) {
        console.warn('Failed loading chat history:', err);
      }
    }
    loadHistory();
    return () => { isMounted = false; };
  }, [org?.id]);

  // Always scroll to bottom when messages update
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Save Chat Message to DB
  const saveMessageToDB = async (sender: 'user' | 'ai', text: string, options: ChatOption[] = []) => {
    if (org?.id) {
      await supabaseService.saveAIChatMessage(org.id, sender, text, options);
    }
  };

  // Confirm Clear AI Chat History
  const handleConfirmClearHistory = async () => {
    setIsClearingHistory(true);
    try {
      if (org?.id) {
        await supabaseService.clearAIChatHistory(org.id);
      }
      const welcome: ChatMessage = {
        id: `welcome_${Date.now()}`,
        sender: 'ai',
        text: `👋 Welcome to ${org?.name || 'your'} Executive AI Assistant!\n\nI analyze live report data, track member performance trends across reports, monitor traffic light zones (Green, Amber, Red), and generate targeted WhatsApp outreach plans for your chapter leadership team.\n\nPlease select an option below to begin:`,
        options: getMainMenuOptions(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages([welcome]);
      if (org?.id) {
        await saveMessageToDB('ai', welcome.text, welcome.options);
      }
      showToast('AI chat history deleted successfully!', 'success');
    } catch (err) {
      showToast('Failed to clear chat history', 'error');
    } finally {
      setIsClearingHistory(false);
      setIsResetModalOpen(false);
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
          replyText = `🏠 Main Menu\n\nPlease select an analysis category below:`;
          replyOptions = getMainMenuOptions();
          break;

        case 'LIST_REPORTS':
          if (availableReportNames.length === 0) {
            replyText = `📊 Available Reports Analysis\n\nNo uploaded report records were found in your organization database. Import an Excel file in Organization settings to view and audit reports.`;
            replyOptions = [{ id: 'opt_main', label: '🏠 Back to Main Menu', action: 'MAIN_MENU' }];
          } else {
            replyText = `📊 Available Reports Overview (${availableReportNames.length} Total Reports)\n\nI have retrieved all uploaded PALMS reports stored for ${org?.name || 'your chapter'}.\n\nPlease select a report below to inspect its detailed performance breakdown and zone movement:`;
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
          const reportMembers = members.filter(m => m.batch_name === reportName);

          const g = reportMembers.filter(m => m.trafficLight?.label === 'Green').length;
          const a = reportMembers.filter(m => m.trafficLight?.label === 'Amber').length;
          const r = reportMembers.filter(m => m.trafficLight?.label === 'Red').length;
          const avg = reportMembers.length > 0
            ? reportMembers.reduce((sum, m) => sum + (m.score || 0), 0) / reportMembers.length
            : 0;

          const gPct = reportMembers.length > 0 ? formatDecimal((g / reportMembers.length) * 100, 1) : 0;
          const aPct = reportMembers.length > 0 ? formatDecimal((a / reportMembers.length) * 100, 1) : 0;
          const rPct = reportMembers.length > 0 ? formatDecimal((r / reportMembers.length) * 100, 1) : 0;

          replyText = `📄 Executive Report Audit: ${reportName}\n\n` +
            `📊 Key Report Summary:\n` +
            `• Tracked Member Count: ${reportMembers.length} members\n` +
            `• Chapter PALMS Score Average: ${formatDecimal(avg, 1)} / 100 pts\n\n` +
            `🚦 Traffic Light Zone Distribution for ${reportName}:\n` +
            `🟢 Green Zone (High Performers): ${g} members (${gPct}%)\n` +
            `🟡 Amber Zone (Growth Candidates): ${a} members (${aPct}%)\n` +
            `🔴 Red Zone (Needs Immediate Support): ${r} members (${rPct}%)\n\n` +
            `💡 AI Leadership Recommendation:\n` +
            `Focus leadership outreach on elevating the ${a} Amber zone members to Green status this week.`;

          replyOptions = getReportMenuOptions(reportName);
          break;
        }

        case 'QUERY_GREEN_REPORT': {
          const rName = option.payload?.reportName;
          const rMembers = members.filter(m => m.batch_name === rName && m.trafficLight?.label === 'Green');

          if (rMembers.length === 0) {
            replyText = `🟢 Green Zone Audit for ${rName}\n\nCurrently, no members are listed in the Green Zone for this report period.`;
          } else {
            replyText = `🟢 Green Zone Leaders in ${rName} (${rMembers.length} Members Total):\n\n` +
              `These high-performing members are currently maintaining Green status with top PALMS scores:\n\n`;

            rMembers.slice(0, 10).forEach((m, idx) => {
              replyText += `${idx + 1}. ${m.Name} — ${m.score} pts (Phone: ${m.Phone || 'N/A'})\n`;
            });

            replyText += `\n💡 AI Leadership Note:\nAcknowledge these top contributors during your next chapter meeting to maintain chapter momentum!`;
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
          const rMembers = members.filter(m => m.batch_name === rName && m.trafficLight?.label === 'Red');

          if (rMembers.length === 0) {
            replyText = `🎉 Red Zone Alert Audit for ${rName}\n\nGreat news! 0 members are in the Red Zone for this report period. All chapter members are performing at Amber or Green level!`;
          } else {
            replyText = `🔴 Red Zone Support List for ${rName} (${rMembers.length} Members Requiring Outreach):\n\n` +
              `The following members need immediate 1-to-1 support and mentorship from chapter leadership:\n\n`;

            rMembers.slice(0, 10).forEach((m, idx) => {
              replyText += `${idx + 1}. ${m.Name} — ${m.score}/100 pts\n` +
                `   • Phone: ${m.Phone || 'N/A'}\n` +
                `   • 1-to-1 Meetings: ${m.OneToOnes || 0} | CEU Credits: ${m.CEU || 0}\n\n`;
            });

            replyText += `💡 AI Action Plan:\n` +
              `1. Schedule a friendly 1-to-1 catch-up call with each member this week.\n` +
              `2. Pair them with a strong Green zone member for joint networking.\n` +
              `3. Review feature presentation scheduling to boost referral visibility.`;
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
          const rMembers = members.filter(m => m.batch_name === rName && m.trafficLight?.label === 'Amber');

          if (rMembers.length === 0) {
            replyText = `🟡 Amber Zone Audit for ${rName}\n\n0 members are currently in the Amber Zone for this report period.`;
          } else {
            replyText = `🟡 Amber Zone Growth Candidates in ${rName} (${rMembers.length} Members Total):\n\n` +
              `These members are just a few points away from elevating into the Green Zone:\n\n`;

            rMembers.slice(0, 10).forEach((m, idx) => {
              replyText += `${idx + 1}. ${m.Name} — ${m.score}/100 pts (Phone: ${m.Phone || 'N/A'})\n`;
            });

            replyText += `\n💡 AI Action Item:\nEncourage completing 1 CEU training module or booking 1 additional 1-to-1 meeting to reach Green status.`;
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
          const rMembers = members.filter(m => m.batch_name === rName && (m.OneToOnes || 0) < 2);

          if (rMembers.length === 0) {
            replyText = `🤝 1-to-1 Meetings Audit for ${rName}\n\nAll members in this report period have completed 2 or more 1-to-1 meetings! Outstanding collaboration!`;
          } else {
            replyText = `🤝 Members Needing 1-to-1 Meetings in ${rName} (${rMembers.length} Members):\n\n`;

            rMembers.slice(0, 10).forEach((m, idx) => {
              replyText += `${idx + 1}. ${m.Name} — ${m.OneToOnes || 0} meetings completed\n`;
            });

            replyText += `\n💡 AI Recommendation:\nPair these members during feature presentations to facilitate high-value 1-to-1 sessions!`;
          }

          replyOptions = [
            { id: 'opt_rep_back', label: `📄 Back to ${rName}`, action: 'VIEW_SINGLE_REPORT', payload: { reportName: rName } },
            { id: 'opt_main', label: '🏠 Main Menu', action: 'MAIN_MENU' },
          ];
          break;
        }

        case 'QUERY_TYFCB_REPORT': {
          const rName = option.payload?.reportName;
          const rMembers = members.filter(m => m.batch_name === rName);
          const topTYFCB = [...rMembers].sort((a, b) => (b.TYFCB || 0) - (a.TYFCB || 0)).slice(0, 5);
          const totalTYFCB = rMembers.reduce((sum, m) => sum + (m.TYFCB || 0), 0);

          replyText = `💰 Top Business Generators (TYFCB) in ${rName}:\n\n`;

          topTYFCB.forEach((m, idx) => {
            replyText += `${idx + 1}. ${m.Name} — ${formatCurrency(m.TYFCB || 0)}\n`;
          });

          replyText += `\n📈 Total TYFCB Closed in ${rName}: ${formatCurrency(totalTYFCB)}`;

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
            replyText = `💬 Dynamic WhatsApp Message for ${zone} Zone Members:\n\n` +
              `Hi {{member_name}} 🌟\n\n` +
              `Congratulations! You are leading in the GREEN Zone with {{score}}/100 points in our ${rName} report! 🟢\n\n` +
              `Thank you for your outstanding contribution to our chapter! Keep up the momentum! 🚀`;
          } else if (zone === 'Red') {
            replyText = `💬 Dynamic WhatsApp Support Message for ${zone} Zone Members:\n\n` +
              `Hi {{member_name}} 👋\n\n` +
              `We noticed you are currently at {{score}}/100 points in our ${rName} report.\n\n` +
              `We are here to support your business growth! Let us schedule a quick 1-to-1 call this week to get you back into the Green Zone. 💪`;
          } else {
            replyText = `💬 Dynamic WhatsApp Nudge for ${zone} Zone Members:\n\n` +
              `Hi {{member_name}} 👋\n\n` +
              `Great effort! You are currently in the Amber Zone with {{score}}/100 points in our ${rName} report.\n\n` +
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
            replyText = `📈 Side-by-Side Report Trend Comparison\n\nYou need at least 2 uploaded reports in your organization database to compare trends! Currently available: ${availableReportNames.length} report.`;
            replyOptions = [{ id: 'opt_main', label: '🏠 Main Menu', action: 'MAIN_MENU' }];
          } else {
            replyText = `📈 Side-by-Side Report Trend Comparison (Step 1 of 2)\n\nI will audit score deltas, Green zone growth, and Red zone shifts between two reports.\n\nPlease select Report A (Base Report) below:`;
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

          replyText = `📈 Side-by-Side Report Trend Comparison (Step 2 of 2)\n\nBase Report A Selected: ${repA}\n\nNow select Report B (Target Report) to compare against ${repA}:`;
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

          const mAList = members.filter(m => m.batch_name === rA);
          const mBList = members.filter(m => m.batch_name === rB);

          const avgA = mAList.length > 0 ? mAList.reduce((sum, m) => sum + (m.score || 0), 0) / mAList.length : 0;
          const avgB = mBList.length > 0 ? mBList.reduce((sum, m) => sum + (m.score || 0), 0) / mBList.length : 0;
          const delta = avgB - avgA;

          const greenA = mAList.filter(m => m.trafficLight?.label === 'Green').length;
          const greenB = mBList.filter(m => m.trafficLight?.label === 'Green').length;

          const redA = mAList.filter(m => m.trafficLight?.label === 'Red').length;
          const redB = mBList.filter(m => m.trafficLight?.label === 'Red').length;

          const tyfcbA = mAList.reduce((sum, m) => sum + (m.TYFCB || 0), 0);
          const tyfcbB = mBList.reduce((sum, m) => sum + (m.TYFCB || 0), 0);

          replyText = `📈 Comparative Trend Audit: ${rA} ➔ ${rB}\n\n` +
            `📊 Key Chapter Movement Metrics:\n` +
            `• Average PALMS Score: ${formatDecimal(avgA, 1)} pts ➔ ${formatDecimal(avgB, 1)} pts (Net Change: ${delta >= 0 ? '+' : ''}${formatDecimal(delta, 1)} pts)\n` +
            `• Green Zone Shift: ${greenA} ➔ ${greenB} members (Net Change: ${greenB - greenA >= 0 ? '+' : ''}${greenB - greenA})\n` +
            `• Red Zone Reduction: ${redA} ➔ ${redB} members (Net Change: ${redB - redA <= 0 ? '' : '+'}${redB - redA})\n` +
            `• Total TYFCB Closed Business: ${formatCurrency(tyfcbA)} ➔ ${formatCurrency(tyfcbB)}\n\n` +
            `💡 AI Trend Assessment:\n` +
            (delta >= 0
              ? `Overall chapter performance has improved by +${formatDecimal(delta, 1)} points from ${rA} to ${rB}. Excellent leadership momentum!`
              : `Chapter average score declined by ${formatDecimal(delta, 1)} points from ${rA} to ${rB}. Review Amber member nudges to restore scores.`);

          replyOptions = [
            { id: 'opt_swap', label: `⇄ Swap ${rA} & ${rB}`, action: 'EXECUTE_COMPARISON', payload: { reportA: rB, reportB: rA } },
            { id: 'opt_new_cmp', label: '📈 Compare Different Reports', action: 'COMPARE_STEP_1' },
            { id: 'opt_main', label: '🏠 Main Menu', action: 'MAIN_MENU' }
          ];
          break;
        }

        case 'QUERY_EXEC': {
          const total = members.length;
          const g = members.filter(m => m.trafficLight?.label === 'Green').length;
          const a = members.filter(m => m.trafficLight?.label === 'Amber').length;
          const r = members.filter(m => m.trafficLight?.label === 'Red').length;
          const avg = total > 0 ? members.reduce((sum, m) => sum + (m.score || 0), 0) / total : 0;
          const tyfcb = members.reduce((sum, m) => sum + (m.TYFCB || 0), 0);

          replyText = `📋 Chapter Executive Overview\n\n` +
            `• Total Active Reports Stored: ${availableReportNames.length} reports\n` +
            `• Total Active Members Tracked: ${total} members\n` +
            `• Overall PALMS Score Average: ${formatDecimal(avg, 1)} pts\n` +
            `• Zone Breakdown: 🟢 ${g} Green | 🟡 ${a} Amber | 🔴 ${r} Red\n` +
            `• Cumulative TYFCB Business Closed: ${formatCurrency(tyfcb)}`;

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
    <div className="space-y-2.5 max-w-4xl mx-auto flex flex-col h-[calc(100vh-140px)] min-h-[480px]">
      {/* Top Header Bar with Reset / Main Menu Button */}
      <div className="flex items-center justify-between px-1 py-1 shrink-0 border-b border-slate-200/60 dark:border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4.5 h-4.5 text-emerald-500 dark:text-emerald-400 animate-pulse" />
          <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">AI Data Assistant</span>
        </div>

        <button
          onClick={() => setIsResetModalOpen(true)}
          className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-rose-500/20 text-slate-800 dark:text-slate-200 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-300 dark:border-white/10 text-xs font-black flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95 shadow-sm"
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
          <span>Reset Chat</span>
        </button>
      </div>

      {/* Edge-to-Edge Conversational Stream */}
      <div className="flex-1 px-1 sm:px-2 py-2 overflow-y-auto space-y-3.5 no-scrollbar">
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
                className={`max-w-[92%] sm:max-w-[82%] rounded-2xl p-3.5 space-y-3 text-xs leading-relaxed shadow-md ${
                  msg.sender === 'user'
                    ? 'ai-chat-user-bubble rounded-tr-none'
                    : 'ai-chat-ai-bubble rounded-tl-none'
                }`}
              >
                {/* Markdown Message Content */}
                <div className="whitespace-pre-wrap font-sans leading-relaxed">{msg.text}</div>

                {/* Interactive Step Options Inside AI Message Bubble */}
                {msg.sender === 'ai' && msg.options && msg.options.length > 0 && (
                  <div className="pt-2.5 border-t border-slate-200/50 dark:border-white/10 space-y-1.5">
                    <div className="flex flex-col gap-1.5">
                      {msg.options.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => handleOptionSelect(opt)}
                          disabled={isTyping}
                          className="w-full text-left px-3 py-2 rounded-xl ai-chat-option-btn text-xs font-bold transition-all active:scale-98 cursor-pointer flex items-center justify-between group shadow-sm disabled:opacity-50"
                        >
                          <span className="truncate">{opt.label}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Message Action Bar (Copy & WhatsApp) - Hidden on Main Menu messages */}
                {msg.sender === 'ai' && !isMenuMessage && (
                  <div className="pt-2 border-t border-slate-200/50 dark:border-white/10 flex items-center justify-end space-x-2">
                    <button
                      onClick={() => handleCopyText(msg.text, msg.id)}
                      className="px-2 py-1 rounded-lg ai-chat-action-btn text-[10px] font-bold flex items-center space-x-1 transition-all cursor-pointer"
                    >
                      {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-slate-400" />}
                      <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                    </button>

                    <button
                      onClick={() => handleShareWhatsApp(msg.text)}
                      className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-black flex items-center space-x-1 border border-emerald-500/30 transition-all cursor-pointer"
                    >
                      <Share2 className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400 text-xs italic pl-2 animate-pulse">
            <Bot className="w-4 h-4 text-emerald-500 dark:text-emerald-400 animate-spin" />
            <span>AI Executive Assistant is analyzing chapter database...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Delete Chat History Confirmation Modal */}
      <ConfirmationModal
        isOpen={isResetModalOpen}
        type="purge"
        title="Delete AI Chat History"
        message="Are you sure you want to delete all AI chat history for your organization? This will permanently erase past conversation logs from the database and restart the AI assistant."
        confirmText="Delete History"
        onConfirm={handleConfirmClearHistory}
        onClose={() => setIsResetModalOpen(false)}
        isLoading={isClearingHistory}
      />
    </div>
  );
};
