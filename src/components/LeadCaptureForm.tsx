import React, { useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';

interface LeadCaptureFormProps {
  defaultInquiryType?: 'discovery_call' | 'wfm_audit';
  contextTopic?: string | null;
  triggerReason?: 'question_threshold' | 'topic_match' | null;
  variant?: 'inline' | 'modal' | 'page';
  onDismiss?: () => void;
  onSuccess?: () => void;
}

export const LeadCaptureForm: React.FC<LeadCaptureFormProps> = ({
  defaultInquiryType = 'discovery_call',
  contextTopic = null,
  triggerReason = null,
  variant = 'inline',
  onDismiss,
  onSuccess,
}) => {
  const [inquiryType, setInquiryType] = useState<'discovery_call' | 'wfm_audit'>(
    defaultInquiryType
  );
  const [name, setName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [company, setCompany] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getHeadline = (): string => {
    if (variant === 'modal' || variant === 'page') {
      return inquiryType === 'wfm_audit'
        ? 'Request an Outpost WFM Audit'
        : 'Book a Discovery Call with Outpost WFM';
    }
    if (triggerReason === 'topic_match' && contextTopic) {
      if (contextTopic === 'WFM Auditing') {
        return 'Ready for a structured WFM Audit?';
      }
      if (contextTopic === 'BPO Performance') {
        return 'Need clearer BPO governance and vendor SLA alignment?';
      }
      if (contextTopic === 'WFM Team Training') {
        return 'Looking to upskill your WFM analysts and planners?';
      }
    }
    return 'Want to apply these frameworks to your operation?';
  };

  const getSubcopy = (): string => {
    if (inquiryType === 'wfm_audit') {
      return 'Share your details to schedule a comprehensive Outpost WFM diagnostic covering forecasting accuracy, shrinkage architecture, and BPO alignment.';
    }
    return 'Connect directly with Corey Sewpersad and Outpost WFM for a focused 25-minute advisory discovery call.';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !workEmail.trim() || !company.trim()) {
      setError('Please complete Name, Work Email, and Company.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          workEmail: workEmail.trim(),
          company: company.trim(),
          inquiryType,
          contextTopic: contextTopic ?? undefined,
        }),
      });

      const data = (await response.json()) as { error?: string; success?: boolean };
      if (!response.ok) {
        throw new Error(data.error || 'Unable to submit inquiry.');
      }

      setSubmitted(true);
      onSuccess?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to submit inquiry.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <h4 className="font-display text-sm font-semibold text-slate-900">
                {inquiryType === 'wfm_audit'
                  ? 'WFM Audit Request Received'
                  : 'Discovery Call Request Received'}
              </h4>
              <p className="mt-1 text-sm text-slate-600">
                Thank you, {name}. Outpost WFM will reach out to{' '}
                <span className="font-medium text-slate-900">{workEmail}</span>{' '}
                shortly to coordinate next steps for {company}.
              </p>
            </div>
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close confirmation"
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-blue-700">
            Outpost WFM Advisory
            {contextTopic ? ` · ${contextTopic}` : ''}
          </p>
          <h4 className="mt-1 font-display text-base font-semibold text-slate-900">
            {getHeadline()}
          </h4>
          <p className="mt-1 text-sm text-slate-600">{getSubcopy()}</p>
        </div>

        {variant === 'inline' && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
          >
            Not right now
          </button>
        )}
      </div>

      <div className="mt-4 inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setInquiryType('discovery_call')}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            inquiryType === 'discovery_call'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Book Discovery Call
        </button>
        <button
          type="button"
          onClick={() => setInquiryType('wfm_audit')}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            inquiryType === 'wfm_audit'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Request WFM Audit
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jordan Patel"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Work Email
            </label>
            <input
              type="email"
              required
              value={workEmail}
              onChange={(e) => setWorkEmail(e.target.value)}
              placeholder="jordan@company.com"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Company
            </label>
            <input
              type="text"
              required
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Operations"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {error && (
          <p className="text-xs font-medium text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? 'Sending...'
              : inquiryType === 'wfm_audit'
              ? 'Request WFM Audit'
              : 'Book Discovery Call'}
          </button>
        </div>
      </form>
    </div>
  );
};
