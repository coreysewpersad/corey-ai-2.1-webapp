import fs from 'node:fs/promises';
import path from 'node:path';
import type { GoogleGenAI } from '@google/genai';

export interface IndexedDocumentRecord {
  filename: string;
  relativePath: string;
  sizeBytes: number;
  mtimeMs: number;
  mimeType: string;
  status: 'indexed' | 'indexing' | 'pending' | 'error';
  documentName?: string;
  errorMessage?: string;
}

interface ManifestFile {
  storeName?: string;
  displayName?: string;
  files: Record<
    string,
    {
      sizeBytes: number;
      mtimeMs: number;
      documentName?: string;
      mimeType: string;
    }
  >;
}

const SUPPORTED_EXTENSIONS: Record<string, string> = {
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.html': 'text/html',
  '.pdf': 'application/pdf',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
};

const STORE_DISPLAY_NAME = 'corey-ai-outpost-wfm-knowledge';

export class FileSearchManager {
  private readonly rootDir: string;
  private readonly knowledgeDirs: string[];
  private readonly dataDir: string;
  private readonly manifestPath: string;

  private storeName: string | null = null;
  private documents: Map<string, IndexedDocumentRecord> = new Map();
  private syncInProgress: Promise<void> | null = null;
  private lastSyncError: string | null = null;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.knowledgeDirs = [
      path.join(rootDir, 'knowledge'),
      path.join(rootDir, 'docs'),
      path.join(rootDir, 'wfm-docs'),
    ];
    this.dataDir = path.join(rootDir, 'data');
    this.manifestPath = path.join(this.dataDir, 'file-search-manifest.json');
  }

  public getKnowledgePrimaryDir(): string {
    return this.knowledgeDirs[0];
  }

  public getStoreName(): string | null {
    return this.storeName;
  }

  public getLastSyncError(): string | null {
    return this.lastSyncError;
  }

  public getDocuments(): IndexedDocumentRecord[] {
    return Array.from(this.documents.values()).sort((a, b) =>
      a.filename.localeCompare(b.filename)
    );
  }

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.knowledgeDirs[0], { recursive: true });
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  private async loadManifest(): Promise<ManifestFile> {
    try {
      const raw = await fs.readFile(this.manifestPath, 'utf-8');
      const parsed = JSON.parse(raw) as ManifestFile;
      return {
        storeName: parsed.storeName,
        displayName: parsed.displayName,
        files: parsed.files ?? {},
      };
    } catch {
      return { files: {} };
    }
  }

  private async saveManifest(manifest: ManifestFile): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.writeFile(
        this.manifestPath,
        JSON.stringify(manifest, null, 2),
        'utf-8'
      );
    } catch (err) {
      console.warn('[FileSearch] Could not persist manifest:', err);
    }
  }

  private async discoverSourceFiles(): Promise<
    Array<{
      fullPath: string;
      relativePath: string;
      filename: string;
      sizeBytes: number;
      mtimeMs: number;
      mimeType: string;
    }>
  > {
    const found: Array<{
      fullPath: string;
      relativePath: string;
      filename: string;
      sizeBytes: number;
      mtimeMs: number;
      mimeType: string;
    }> = [];

    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          const mimeType = SUPPORTED_EXTENSIONS[ext];
          if (!mimeType) continue;
          const stats = await fs.stat(fullPath);
          if (stats.size === 0) continue;
          found.push({
            fullPath,
            relativePath: path.relative(this.rootDir, fullPath),
            filename: entry.name,
            sizeBytes: stats.size,
            mtimeMs: stats.mtimeMs,
            mimeType,
          });
        }
      }
    };

    for (const dir of this.knowledgeDirs) {
      await walk(dir);
    }

    // Also include any root-level WFM source files (.pdf, .docx, .txt, .csv, or .md other than README.md)
    try {
      const rootEntries = await fs.readdir(this.rootDir, {
        withFileTypes: true,
      });
      for (const entry of rootEntries) {
        if (!entry.isFile() || entry.name.startsWith('.')) continue;
        const lowerName = entry.name.toLowerCase();
        if (lowerName === 'readme.md' || lowerName === 'index.html') continue;
        if (lowerName.endsWith('.json') || lowerName.endsWith('.html')) continue;
        const ext = path.extname(entry.name).toLowerCase();
        const mimeType = SUPPORTED_EXTENSIONS[ext];
        if (!mimeType) continue;
        const fullPath = path.join(this.rootDir, entry.name);
        const stats = await fs.stat(fullPath);
        if (stats.size === 0) continue;
        found.push({
          fullPath,
          relativePath: entry.name,
          filename: entry.name,
          sizeBytes: stats.size,
          mtimeMs: stats.mtimeMs,
          mimeType,
        });
      }
    } catch {
      // ignore root scan errors
    }

    return found;
  }

  public async scanLocalOnly(): Promise<void> {
    await this.ensureDirectories();
    const manifest = await this.loadManifest();
    if (manifest.storeName) {
      this.storeName = manifest.storeName;
    }
    const files = await this.discoverSourceFiles();
    for (const file of files) {
      const existing = manifest.files[file.relativePath];
      const alreadyTracked =
        existing &&
        existing.sizeBytes === file.sizeBytes &&
        Math.abs(existing.mtimeMs - file.mtimeMs) < 10 &&
        Boolean(existing.documentName);

      this.documents.set(file.relativePath, {
        filename: file.filename,
        relativePath: file.relativePath,
        sizeBytes: file.sizeBytes,
        mtimeMs: file.mtimeMs,
        mimeType: file.mimeType,
        status: alreadyTracked && this.storeName ? 'indexed' : 'pending',
        documentName: existing?.documentName,
      });
    }
  }

  private async resolveOrCreateStore(ai: GoogleGenAI, manifest: ManifestFile): Promise<string> {
    // 1. Check manifest storeName
    if (manifest.storeName) {
      try {
        const store = await ai.fileSearchStores.get({
          name: manifest.storeName,
        });
        if (store.name) {
          this.storeName = store.name;
          return store.name;
        }
      } catch {
        // Store no longer exists or belongs to another key; search or recreate
        manifest.files = {};
      }
    }

    // 2. Check existing stores on this API key by displayName
    try {
      const pager = await ai.fileSearchStores.list();
      for await (const existingStore of pager) {
        if (
          existingStore.displayName === STORE_DISPLAY_NAME &&
          existingStore.name
        ) {
          this.storeName = existingStore.name;
          manifest.storeName = existingStore.name;
          return existingStore.name;
        }
      }
    } catch {
      // Proceed to create
    }

    // 3. Create new FileSearchStore
    const created = await ai.fileSearchStores.create({
      config: {
        displayName: STORE_DISPLAY_NAME,
      },
    });
    if (!created.name) {
      throw new Error('Gemini File Search Store creation did not return a store name.');
    }
    this.storeName = created.name;
    manifest.storeName = created.name;
    manifest.displayName = STORE_DISPLAY_NAME;
    manifest.files = {};
    return created.name;
  }

  public async syncWithGemini(ai: GoogleGenAI | null): Promise<void> {
    if (this.syncInProgress) {
      return this.syncInProgress;
    }

    this.syncInProgress = (async () => {
      try {
        this.lastSyncError = null;
        await this.ensureDirectories();
        const manifest = await this.loadManifest();
        const files = await this.discoverSourceFiles();

        if (!ai) {
          this.lastSyncError = 'GEMINI_API_KEY is not configured on the server.';
          for (const file of files) {
            this.documents.set(file.relativePath, {
              filename: file.filename,
              relativePath: file.relativePath,
              sizeBytes: file.sizeBytes,
              mtimeMs: file.mtimeMs,
              mimeType: file.mimeType,
              status: 'pending',
            });
          }
          return;
        }

        const storeName = await this.resolveOrCreateStore(ai, manifest);

        // Fetch remote documents in store to reconcile state
        const remoteDocNames = new Set<string>();
        const remoteByDisplayName = new Map<string, string>();
        try {
          const docPager = await ai.fileSearchStores.documents.list({
            parent: storeName,
          });
          for await (const doc of docPager) {
            if (doc.name) {
              remoteDocNames.add(doc.name);
              if (doc.displayName) {
                remoteByDisplayName.set(doc.displayName, doc.name);
              }
            }
          }
        } catch {
          // If listing fails, continue with manifest checks
        }

        const nextMap = new Map<string, IndexedDocumentRecord>();

        for (const file of files) {
          const cached = manifest.files[file.relativePath];
          const isUnchanged =
            cached &&
            cached.sizeBytes === file.sizeBytes &&
            Math.abs(cached.mtimeMs - file.mtimeMs) < 10;

          const matchedRemote =
            (cached?.documentName && remoteDocNames.has(cached.documentName)
              ? cached.documentName
              : undefined) ?? remoteByDisplayName.get(file.relativePath);

          if (isUnchanged && matchedRemote) {
            nextMap.set(file.relativePath, {
              filename: file.filename,
              relativePath: file.relativePath,
              sizeBytes: file.sizeBytes,
              mtimeMs: file.mtimeMs,
              mimeType: file.mimeType,
              status: 'indexed',
              documentName: matchedRemote,
            });
            manifest.files[file.relativePath] = {
              sizeBytes: file.sizeBytes,
              mtimeMs: file.mtimeMs,
              documentName: matchedRemote,
              mimeType: file.mimeType,
            };
            continue;
          }

          // Upload & index into Gemini File Search Store
          nextMap.set(file.relativePath, {
            filename: file.filename,
            relativePath: file.relativePath,
            sizeBytes: file.sizeBytes,
            mtimeMs: file.mtimeMs,
            mimeType: file.mimeType,
            status: 'indexing',
          });
          this.documents = new Map(nextMap);

          try {
            let operation = await ai.fileSearchStores.uploadToFileSearchStore({
              fileSearchStoreName: storeName,
              file: file.fullPath,
              config: {
                displayName: file.relativePath,
                mimeType: file.mimeType,
              },
            });

            let attempts = 0;
            while (!operation.done && attempts < 30) {
              await new Promise((resolve) => setTimeout(resolve, 2000));
              operation = await ai.operations.get({ operation });
              attempts += 1;
            }

            if (operation.error) {
              throw new Error(
                typeof operation.error.message === 'string'
                  ? operation.error.message
                  : 'File Search indexing operation failed.'
              );
            }

            const docName =
              operation.response?.documentName ??
              remoteByDisplayName.get(file.relativePath) ??
              file.relativePath;

            nextMap.set(file.relativePath, {
              filename: file.filename,
              relativePath: file.relativePath,
              sizeBytes: file.sizeBytes,
              mtimeMs: file.mtimeMs,
              mimeType: file.mimeType,
              status: 'indexed',
              documentName: docName,
            });

            manifest.files[file.relativePath] = {
              sizeBytes: file.sizeBytes,
              mtimeMs: file.mtimeMs,
              documentName: docName,
              mimeType: file.mimeType,
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            nextMap.set(file.relativePath, {
              filename: file.filename,
              relativePath: file.relativePath,
              sizeBytes: file.sizeBytes,
              mtimeMs: file.mtimeMs,
              mimeType: file.mimeType,
              status: 'error',
              errorMessage: msg,
            });
            this.lastSyncError = msg;
          }
        }

        this.documents = nextMap;
        await this.saveManifest(manifest);
      } catch (err) {
        this.lastSyncError = err instanceof Error ? err.message : String(err);
      } finally {
        this.syncInProgress = null;
      }
    })();

    return this.syncInProgress;
  }
}
