import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { FileSearchManager } from './server/fileSearchManager.ts';
import {
  createGeminiClient,
  generateCoreyAdvisoryReply,
} from './server/geminiService.ts';
import type { ChatTurn } from './server/geminiService.ts';

interface LeadSubmission {
  id: string;
  name: string;
  workEmail: string;
  company: string;
  inquiryType: 'discovery_call' | 'wfm_audit';
  contextTopic?: string;
  notes?: string;
  createdAt: string;
}

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = process.cwd();
const LEADS_FILE = path.join(ROOT_DIR, 'data', 'leads.json');
const inMemoryLeads: LeadSubmission[] = [];

const fileSearchManager = new FileSearchManager(ROOT_DIR);

const ALLOWED_UPLOAD_EXTS = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.csv',
  '.json',
  '.html',
  '.pdf',
  '.docx',
  '.doc',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        const dir = fileSearchManager.getKnowledgePrimaryDir();
        await fs.mkdir(dir, { recursive: true });
        cb(null, dir);
      } catch (err) {
        cb(err instanceof Error ? err : new Error('Upload directory error'), '');
      }
    },
    filename: (_req, file, cb) => {
      const base = path
        .basename(file.originalname)
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, base || `wfm_doc_${Date.now()}.txt`);
    },
  }),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_UPLOAD_EXTS.has(ext)) {
      cb(
        new Error(
          'Unsupported file type. Upload .md, .txt, .pdf, .csv, .json, .html, or .docx documents.'
        )
      );
      return;
    }
    cb(null, true);
  },
});

async function persistLead(lead: LeadSubmission): Promise<void> {
  inMemoryLeads.push(lead);
  try {
    await fs.mkdir(path.dirname(LEADS_FILE), { recursive: true });
    let existing: LeadSubmission[] = [];
    try {
      const raw = await fs.readFile(LEADS_FILE, 'utf-8');
      existing = JSON.parse(raw) as LeadSubmission[];
    } catch {
      existing = [];
    }
    existing.push(lead);
    await fs.writeFile(LEADS_FILE, JSON.stringify(existing, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Leads] Persisted in memory only:', err);
  }
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const lower = rawMessage.toLowerCase();

  if (
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('permission_denied') ||
    lower.includes('403')
  ) {
    return {
      status: 403,
      message:
        'The server GEMINI_API_KEY was rejected or lacks permission. Please verify your key in Settings > Secrets.',
    };
  }

  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    return {
      status: 429,
      message:
        'Gemini API quota exceeded. Please retry shortly or check your API key quota in Settings > Secrets.',
    };
  }

  return {
    status: 500,
    message: rawMessage || 'Failed to generate a Gemini response.',
  };
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Initial local scan and background File Search sync
  await fileSearchManager.scanLocalOnly();
  const startupAi = createGeminiClient();
  if (startupAi) {
    void fileSearchManager.syncWithGemini(startupAi);
  }

  app.get('/api/health', (_req, res) => {
    const docs = fileSearchManager.getDocuments();
    res.json({
      status: 'ok',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
      storeName: fileSearchManager.getStoreName(),
      indexedCount: docs.filter((d) => d.status === 'indexed').length,
      totalDocuments: docs.length,
      syncError: fileSearchManager.getLastSyncError(),
    });
  });

  app.get('/api/knowledge', async (_req, res) => {
    await fileSearchManager.scanLocalOnly();
    res.json({
      storeName: fileSearchManager.getStoreName(),
      hasApiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
      syncError: fileSearchManager.getLastSyncError(),
      documents: fileSearchManager.getDocuments(),
    });
  });

  app.post('/api/knowledge/sync', async (_req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets to index documents with Gemini File Search.',
      });
      return;
    }

    await fileSearchManager.syncWithGemini(ai);
    res.json({
      storeName: fileSearchManager.getStoreName(),
      syncError: fileSearchManager.getLastSyncError(),
      documents: fileSearchManager.getDocuments(),
    });
  });

  app.post(
    '/api/knowledge/upload',
    (req, res, next) => {
      upload.single('file')(req, res, (err) => {
        if (err) {
          res.status(400).json({
            error: err instanceof Error ? err.message : 'File upload failed.',
          });
          return;
        }
        next();
      });
    },
    async (req, res) => {
      if (!req.file) {
        res.status(400).json({ error: 'No document file provided.' });
        return;
      }

      const ai = createGeminiClient();
      if (ai) {
        await fileSearchManager.syncWithGemini(ai);
      } else {
        await fileSearchManager.scanLocalOnly();
      }

      res.status(201).json({
        uploaded: req.file.filename,
        storeName: fileSearchManager.getStoreName(),
        syncError: fileSearchManager.getLastSyncError(),
        documents: fileSearchManager.getDocuments(),
      });
    }
  );

  app.post('/api/chat', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured on the server. Please add your Gemini API key in Settings > Secrets.',
      });
      return;
    }

    const body = req.body as { messages?: unknown };
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({ error: 'Messages array is required.' });
      return;
    }

    const messages: ChatTurn[] = body.messages
      .filter(
        (m): m is ChatTurn =>
          Boolean(m) &&
          typeof m === 'object' &&
          (m as ChatTurn).role !== undefined &&
          typeof (m as ChatTurn).content === 'string' &&
          (m as ChatTurn).content.trim().length > 0
      )
      .slice(-20);

    if (messages.length === 0) {
      res.status(400).json({ error: 'At least one non-empty message is required.' });
      return;
    }

    // Ensure File Search Store is synced before first grounded query
    if (!fileSearchManager.getStoreName()) {
      await fileSearchManager.syncWithGemini(ai);
    }

    try {
      const result = await generateCoreyAdvisoryReply({
        ai,
        messages,
        fileSearchStoreName: fileSearchManager.getStoreName(),
      });

      res.json({
        reply: result.reply,
        citations: result.citations,
        leadTrigger: result.leadTrigger,
        groundedStore: Boolean(fileSearchManager.getStoreName()),
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/leads', async (req, res) => {
    const body = req.body as {
      name?: unknown;
      workEmail?: unknown;
      company?: unknown;
      inquiryType?: unknown;
      contextTopic?: unknown;
      notes?: unknown;
    };

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const workEmail =
      typeof body.workEmail === 'string' ? body.workEmail.trim() : '';
    const company = typeof body.company === 'string' ? body.company.trim() : '';
    const inquiryType =
      body.inquiryType === 'wfm_audit' ? 'wfm_audit' : 'discovery_call';
    const contextTopic =
      typeof body.contextTopic === 'string' ? body.contextTopic.trim() : undefined;
    const notes = typeof body.notes === 'string' ? body.notes.trim() : undefined;

    if (!name || !workEmail || !company) {
      res.status(400).json({
        error: 'Name, Work Email, and Company are required.',
      });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail)) {
      res.status(400).json({
        error: 'Please enter a valid work email address.',
      });
      return;
    }

    const submission: LeadSubmission = {
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      workEmail,
      company,
      inquiryType,
      contextTopic,
      notes,
      createdAt: new Date().toISOString(),
    };

    await persistLead(submission);
    res.status(201).json({
      success: true,
      leadId: submission.id,
      inquiryType: submission.inquiryType,
    });
  });

  // Frontend middleware / static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Corey_AI — Outpost WFM listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
