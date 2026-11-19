import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  RefreshCw,
  Upload,
} from 'lucide-react';
import type { KnowledgeStatusResponse } from '../types';

interface KnowledgeBasePanelProps {
  knowledge: KnowledgeStatusResponse;
  onRefresh: () => Promise<void>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const KnowledgeBasePanel: React.FC<KnowledgeBasePanelProps> = ({
  knowledge,
  onRefresh,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/knowledge/sync', {
        method: 'POST',
      });
      const data = (await response.json()) as {
        error?: string;
        syncError?: string | null;
        documents?: unknown[];
      };
      if (!response.ok) {
        throw new Error(data.error || 'Sync failed.');
      }
      await onRefresh();
      if (data.syncError) {
        setFeedback({ type: 'error', message: data.syncError });
      } else {
        setFeedback({
          type: 'success',
          message: 'Project WFM documents synchronized with Gemini File Search.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Sync failed.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setFeedback(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/knowledge/upload', {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json()) as {
        error?: string;
        uploaded?: string;
        syncError?: string | null;
      };
      if (!response.ok) {
        throw new Error(data.error || 'Document upload failed.');
      }

      await onRefresh();
      setFeedback({
        type: data.syncError ? 'error' : 'success',
        message: data.syncError
          ? `Saved ${data.uploaded}, but File Search indexing reported: ${data.syncError}`
          : `Uploaded and indexed ${data.uploaded} into Gemini File Search.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Upload failed.',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const indexedCount = knowledge.documents.filter(
    (d) => d.status === 'indexed'
  ).length;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 py-8 px-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            WFM Knowledge Base
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Source documents in <code className="font-mono text-xs text-slate-800">/knowledge</code> are indexed into Gemini File Search so Corey_AI grounds every answer in your frameworks.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,.txt,.pdf,.csv,.json,.html,.docx,.doc"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            <Upload className="h-3.5 w-3.5" />
            {uploading ? 'Uploading...' : 'Upload WFM Doc'}
          </button>

          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Indexing...' : 'Re-index Folder'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">
            Indexed Documents
          </div>
          <div className="mt-1 font-display text-2xl font-semibold text-slate-900 tabular-nums">
            {indexedCount} / {knowledge.documents.length}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">
            Gemini API Connection
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
            {knowledge.hasApiKey ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Server Key Active</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <span>GEMINI_API_KEY Missing</span>
              </>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">
            File Search Store
          </div>
          <div className="mt-1 truncate font-mono text-xs font-medium text-slate-800">
            {knowledge.storeName || 'Pending initialization'}
          </div>
        </div>
      </div>

      {(feedback || knowledge.syncError) && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            feedback?.type === 'error' || (!feedback && knowledge.syncError)
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {feedback?.message ?? knowledge.syncError}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-4 py-3">Document</th>
              <th className="px-4 py-3">Format</th>
              <th className="px-4 py-3 text-right">Size</th>
              <th className="px-4 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {knowledge.documents.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No WFM source documents found in <code className="font-mono text-xs">/knowledge</code>. Upload a PDF, Markdown, or text framework document above to index it.
                </td>
              </tr>
            ) : (
              knowledge.documents.map((doc) => (
                <tr key={doc.relativePath} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      <div>
                        <div className="font-medium text-slate-900">
                          {doc.filename}
                        </div>
                        <div className="text-xs text-slate-500">
                          {doc.relativePath}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {doc.mimeType}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-slate-600 tabular-nums">
                    {formatBytes(doc.sizeBytes)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {doc.status === 'indexed' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Indexed
                      </span>
                    )}
                    {doc.status === 'indexing' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Indexing
                      </span>
                    )}
                    {doc.status === 'pending' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                        <Clock className="h-3.5 w-3.5" />
                        Pending Sync
                      </span>
                    )}
                    {doc.status === 'error' && (
                      <span
                        title={doc.errorMessage}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700"
                      >
                        <AlertCircle className="h-3.5 w-3.5" />
                        Error
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
