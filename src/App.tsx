import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertCircle,
  ArrowUp,
  BookOpen,
  FileText,
  Menu,
  MessageSquarePlus,
  X,
} from 'lucide-react';
import type {
  ActiveView,
  ChatMessage,
  KnowledgeStatusResponse,
  LeadTriggerEvaluation,
} from './types';
import { LeadCaptureForm } from './components/LeadCaptureForm';
import { KnowledgeBasePanel } from './components/KnowledgeBasePanel';

const MARK_IMAGE_URL = '/src/assets/images/corey_ai_mark_1795121707078.jpg';

const STARTER_PROMPTS = [
  {
    title: 'Diagnose Shrinkage Creep',
    prompt:
      'Our interval Service Level is slipping even though our weekly staffing hours match budget. How do I diagnose planned vs. unplanned shrinkage and schedule adherence gaps?',
  },
  {
    title: 'Occupancy & Burnout Guardrails',
    prompt:
      'At what occupancy threshold does a high-complexity voice queue start driving AHT inflation and attrition, and how should we recalibrate Erlang-C capacity?',
  },
  {
    title: 'BPO Performance & SLA Governance',
    prompt:
      'We manage two BPO partners billing per logged-in hour, but interval abandonment keeps spiking. How should we structure BPO performance governance and shrinkage caps?',
  },
  {
    title: '30-60-90 Day WFM Audit',
    prompt:
      'What does a comprehensive WFM audit cover across forecasting accuracy, capacity planning, intraday real-time management, and vendor alignment?',
  },
];

const FRAMEWORK_PILLARS = [
  {
    index: '01.',
    title: 'Forecasting & Demand Intelligence',
    summary:
      'Separate structural volume drivers from transient spikes. Track weekly WAPE (<3%) and 30-minute interval MAPE (<5%) before tuning rosters.',
    prompt:
      'Walk me through your Forecasting & Demand Intelligence pillar and how to audit interval MAPE across volatile contact channels.',
  },
  {
    index: '02.',
    title: 'Capacity Planning & Shrinkage Architecture',
    summary:
      'Model planned vs. unplanned shrinkage by tenure cohort, site, and shift window rather than applying flat global percentages.',
    prompt:
      'How do I build an accurate shrinkage-adjusted capacity model with new-hire ramp curves?',
  },
  {
    index: '03.',
    title: 'Scheduling, Erlang-C & Intraday RTM',
    summary:
      'Run 15- or 30-minute Erlang-C intervals with clear real-time escalation triggers and a strict 85%–88% occupancy ceiling guardrail.',
    prompt:
      'Explain how to distinguish intraday execution failures from structural schedule-fit defects in Real-Time Management.',
  },
  {
    index: '04.',
    title: 'WFM Auditing & BPO Performance',
    summary:
      'Align internal and outsourced KPI definitions, shrinkage cap clauses, and productive-hour billing mechanics in every MBR and QBR.',
    prompt:
      'How should we audit BPO vendor performance and align shrinkage and adherence definitions across sites?',
  },
];

const BrandMark: React.FC<{ size?: 'sm' | 'lg' }> = ({ size = 'sm' }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const dim = size === 'lg' ? 'h-12 w-12 rounded-xl' : 'h-7 w-7 rounded-md';

  if (imgFailed) {
    return (
      <div
        className={`${dim} flex shrink-0 items-center justify-center bg-slate-900 font-display text-xs font-bold text-white`}
      >
        CW
      </div>
    );
  }

  return (
    <img
      src={MARK_IMAGE_URL}
      alt="Corey_AI — Outpost WFM"
      referrerPolicy="no-referrer"
      onError={() => setImgFailed(true)}
      className={`${dim} shrink-0 object-cover`}
    />
  );
};

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>('chat');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [leadTrigger, setLeadTrigger] = useState<LeadTriggerEvaluation | null>(
    null
  );
  const [leadDismissed, setLeadDismissed] = useState(false);
  const [leadCompleted, setLeadCompleted] = useState(false);

  const [knowledge, setKnowledge] = useState<KnowledgeStatusResponse>({
    storeName: null,
    hasApiKey: true,
    syncError: null,
    documents: [],
  });

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const fetchKnowledgeStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge');
      if (!res.ok) return;
      const data = (await res.json()) as KnowledgeStatusResponse;
      setKnowledge(data);
    } catch {
      // silent background check
    }
  }, []);

  useEffect(() => {
    void fetchKnowledgeStatus();
  }, [fetchKnowledgeStatus]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, leadTrigger]);

  const userQuestionCount = messages.filter((m) => m.role === 'user').length;

  const sendMessage = async (textOverride?: string) => {
    const trimmed = (textOverride ?? input).trim();
    if (!trimmed || sending) return;

    setActiveView('chat');
    setMobileMenuOpen(false);
    setChatError(null);

    const userTurn: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    const nextMessages = [...messages, userTurn];
    setMessages(nextMessages);
    if (!textOverride) {
      setInput('');
    }
    setSending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = (await response.json()) as {
        reply?: string;
        citations?: ChatMessage['citations'];
        leadTrigger?: LeadTriggerEvaluation;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get a response from Corey_AI.');
      }

      const assistantTurn: ChatMessage = {
        id: `msg_${Date.now()}_a`,
        role: 'assistant',
        content: data.reply || '',
        citations: data.citations ?? [],
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantTurn]);

      if (data.leadTrigger?.shouldPrompt) {
        setLeadTrigger(data.leadTrigger);
        // If a specific audit/training/BPO topic matched after a prior soft dismiss, resurface once only if not yet completed
        if (data.leadTrigger.reason === 'topic_match' && !leadCompleted) {
          setLeadDismissed(false);
        }
      }
    } catch (err) {
      setChatError(
        err instanceof Error
          ? err.message
          : 'Unable to reach Corey_AI right now.'
      );
    } finally {
      setSending(false);
      composerRef.current?.focus();
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    setChatError(null);
    setLeadTrigger(null);
    setLeadDismissed(false);
    setLeadCompleted(false);
    setActiveView('chat');
    setMobileMenuOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const showInlineLeadPrompt =
    Boolean(leadTrigger?.shouldPrompt) && !leadDismissed && !leadCompleted;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones, single row */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8 px-4 sm:px-6">
          {/* Zone 1: Single-line Brand Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle workspace menu"
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveView('chat')}
              className="flex items-center gap-2.5 whitespace-nowrap shrink-0 text-left"
            >
              <BrandMark size="sm" />
              <span className="font-display text-lg font-bold tracking-tight text-slate-900">
                Corey_AI
              </span>
            </button>
          </div>

          {/* Zone 2: 4 Clean Single-Line Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setActiveView('chat')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                activeView === 'chat'
                  ? 'text-slate-900 underline decoration-blue-600 decoration-2 underline-offset-8'
                  : ''
              }`}
            >
              Advisory Chat
            </button>
            <button
              type="button"
              onClick={() => setActiveView('frameworks')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                activeView === 'frameworks'
                  ? 'text-slate-900 underline decoration-blue-600 decoration-2 underline-offset-8'
                  : ''
              }`}
            >
              WFM Frameworks
            </button>
            <button
              type="button"
              onClick={() => setActiveView('knowledge')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                activeView === 'knowledge'
                  ? 'text-slate-900 underline decoration-blue-600 decoration-2 underline-offset-8'
                  : ''
              }`}
            >
              Knowledge Base
            </button>
            <button
              type="button"
              onClick={() => setActiveView('outpost')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                activeView === 'outpost'
                  ? 'text-slate-900 underline decoration-blue-600 decoration-2 underline-offset-8'
                  : ''
              }`}
            >
              Outpost WFM
            </button>
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setBookingModalOpen(true)}
              className="whitespace-nowrap shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
            >
              Book Discovery Call
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="mx-auto flex w-full max-w-[1440px] flex-1">
        {/* Sidebar */}
        <aside
          className={`${
            mobileMenuOpen ? 'fixed inset-y-16 left-0 z-20 block' : 'hidden'
          } w-72 shrink-0 border-r border-slate-200 bg-white lg:static lg:block`}
        >
          <div className="flex h-full flex-col justify-between p-5">
            <div className="space-y-6">
              <button
                type="button"
                onClick={handleNewConversation}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100"
              >
                <MessageSquarePlus className="h-4 w-4" />
                New Conversation
              </button>

              {/* Mobile Nav Switcher */}
              <div className="space-y-1 md:hidden">
                <div className="px-2 pb-1 text-xs font-semibold text-slate-500">
                  Navigation
                </div>
                {(
                  [
                    ['chat', 'Advisory Chat'],
                    ['frameworks', 'WFM Frameworks'],
                    ['knowledge', 'Knowledge Base'],
                    ['outpost', 'Outpost WFM'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setActiveView(key);
                      setMobileMenuOpen(false);
                    }}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium ${
                      activeView === key
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div>
                <h2 className="px-1 text-xs font-semibold text-slate-500">
                  WFM Advisory Topics
                </h2>
                <div className="mt-2 space-y-1">
                  {STARTER_PROMPTS.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => void sendMessage(item.prompt)}
                      className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-5">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xs font-semibold text-slate-500">
                    Indexed Sources
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('knowledge');
                      setMobileMenuOpen(false);
                    }}
                    className="text-xs font-medium text-blue-700 hover:underline"
                  >
                    Manage
                  </button>
                </div>

                <div className="mt-2.5 space-y-2">
                  {knowledge.documents.length === 0 ? (
                    <p className="px-1 text-xs text-slate-500">
                      No documents indexed yet.
                    </p>
                  ) : (
                    knowledge.documents.slice(0, 5).map((doc) => (
                      <div
                        key={doc.relativePath}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="truncate font-medium text-slate-700">
                            {doc.filename}
                          </span>
                        </div>
                        <span className="shrink-0 text-slate-500 capitalize">
                          {doc.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 text-xs text-slate-500">
              <div className="font-medium text-slate-700">Outpost WFM</div>
              <div className="mt-0.5 tabular-nums">
                Open advisory access · {userQuestionCount}{' '}
                {userQuestionCount === 1 ? 'question' : 'questions'} asked
              </div>
            </div>
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="flex min-w-0 flex-1 flex-col">
          {activeView === 'chat' && (
            <div className="flex flex-1 flex-col justify-between">
              <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-8">
                <div className="mx-auto max-w-3xl space-y-6">
                  {messages.length === 0 ? (
                    <div className="space-y-8 pt-6">
                      <div className="space-y-4">
                        <div className="flex items-center gap-3.5">
                          <BrandMark size="lg" />
                          <div>
                            <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                              Corey_AI Advisory
                            </h1>
                            <p className="mt-1 text-sm text-slate-600">
                              Workforce Management diagnostics, capacity modeling, and BPO governance grounded in Outpost WFM frameworks.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {STARTER_PROMPTS.map((item) => (
                          <button
                            key={item.title}
                            type="button"
                            onClick={() => void sendMessage(item.prompt)}
                            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50/80"
                          >
                            <div className="font-display text-sm font-semibold text-slate-900">
                              {item.title}
                            </div>
                            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600">
                              {item.prompt}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={
                          msg.role === 'user'
                            ? 'flex justify-end'
                            : 'flex justify-start'
                        }
                      >
                        {msg.role === 'user' ? (
                          <div className="max-w-[85%] rounded-2xl bg-slate-900 px-4 py-3 text-sm leading-relaxed text-white">
                            {msg.content}
                          </div>
                        ) : (
                          <div className="w-full rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
                            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500">
                              <span className="font-display font-semibold text-slate-900">
                                Corey_AI
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>Outpost WFM</span>
                            </div>

                            <div className="prose-wfm">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {msg.content}
                              </ReactMarkdown>
                            </div>

                            {msg.citations && msg.citations.length > 0 && (
                              <div className="mt-4 border-t border-slate-100 pt-3">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                                  <BookOpen className="h-3.5 w-3.5" />
                                  <span>Grounded in WFM Sources:</span>
                                  <span className="text-slate-700">
                                    {msg.citations.map((c) => c.title).join(' · ')}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {sending && (
                    <div className="w-full rounded-xl border border-slate-200 bg-white p-5">
                      <div className="mb-2 text-xs font-semibold text-slate-900">
                        Corey_AI
                      </div>
                      <div className="space-y-2">
                        <div className="h-3.5 w-3/4 animate-pulse rounded bg-slate-100" />
                        <div className="h-3.5 w-1/2 animate-pulse rounded bg-slate-100" />
                      </div>
                    </div>
                  )}

                  {chatError && (
                    <div
                      role="alert"
                      className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>{chatError}</div>
                    </div>
                  )}

                  {showInlineLeadPrompt && !sending && (
                    <LeadCaptureForm
                      variant="inline"
                      defaultInquiryType={
                        leadTrigger?.suggestedAction === 'audit'
                          ? 'wfm_audit'
                          : 'discovery_call'
                      }
                      contextTopic={leadTrigger?.matchedTopic}
                      triggerReason={leadTrigger?.reason}
                      onDismiss={() => setLeadDismissed(true)}
                      onSuccess={() => setLeadCompleted(true)}
                    />
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Sticky Composer */}
              <div className="border-t border-slate-200 bg-white px-4 py-4 sm:px-8">
                <div className="mx-auto max-w-3xl">
                  <div className="flex items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2 focus-within:border-blue-600 focus-within:bg-white">
                    <textarea
                      ref={composerRef}
                      rows={1}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask Corey_AI about Erlang-C, shrinkage governance, WFM auditing, or BPO performance..."
                      className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void sendMessage()}
                      disabled={!input.trim() || sending}
                      aria-label="Send question"
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Grounded via Gemini File Search across {knowledge.documents.length}{' '}
                      {knowledge.documents.length === 1 ? 'document' : 'documents'}
                    </span>
                    <span className="hidden sm:inline">
                      Press Enter to send · Shift+Enter for new line
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeView === 'frameworks' && (
            <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-8">
              <div className="border-b border-slate-200 pb-6">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
                  Outpost WFM Frameworks
                </h1>
                <p className="mt-1.5 text-sm text-slate-600">
                  Select any pillar below to query Corey_AI on the underlying formulas, thresholds, and operating playbooks.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {FRAMEWORK_PILLARS.map((pillar) => (
                  <div
                    key={pillar.index}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6"
                  >
                    <div>
                      <h2 className="font-display text-lg font-semibold text-slate-900">
                        {pillar.index} {pillar.title}
                      </h2>
                      <p className="mt-2.5 text-sm leading-relaxed text-slate-600">
                        {pillar.summary}
                      </p>
                    </div>

                    <div className="mt-5 pt-4 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => void sendMessage(pillar.prompt)}
                        className="text-xs font-semibold text-blue-700 hover:text-blue-800 hover:underline"
                      >
                        Ask Corey_AI about this pillar →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeView === 'knowledge' && (
            <KnowledgeBasePanel
              knowledge={knowledge}
              onRefresh={fetchKnowledgeStatus}
            />
          )}

          {activeView === 'outpost' && (
            <div className="mx-auto w-full max-w-4xl space-y-8 px-6 py-8">
              <div className="border-b border-slate-200 pb-6">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
                  Outpost WFM Advisory
                </h1>
                <p className="mt-1.5 text-sm text-slate-600">
                  Practical Workforce Management audits, analyst upskilling, and BPO performance alignment led by Corey Sewpersad.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    01. WFM Auditing
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Full diagnostic of forecasting accuracy, shrinkage assumptions, Erlang-C capacity, and intraday execution with a 30-60-90 day remediation roadmap.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    02. Team Training
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Structured workshops for WFM analysts, planners, and real-time managers on capacity modeling, shrinkage control, and executive storytelling.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    03. BPO Performance
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Standardize KPI definitions, shrinkage caps, and interval delivery accountability across outsourced contact center partners.
                  </p>
                </div>
              </div>

              <LeadCaptureForm variant="page" defaultInquiryType="wfm_audit" />
            </div>
          )}
        </main>
      </div>

      {/* On-Demand Discovery Call / WFM Audit Modal */}
      {bookingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-2xl">
            <button
              type="button"
              onClick={() => setBookingModalOpen(false)}
              aria-label="Close modal"
              className="absolute top-4 right-4 z-10 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
            <LeadCaptureForm
              variant="modal"
              defaultInquiryType="discovery_call"
              onDismiss={() => setBookingModalOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
