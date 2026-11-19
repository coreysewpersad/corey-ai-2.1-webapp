export type ActiveView = 'chat' | 'frameworks' | 'knowledge' | 'outpost';

export interface GroundingCitation {
  title: string;
  excerpt?: string;
}

export interface LeadTriggerEvaluation {
  shouldPrompt: boolean;
  reason: 'question_threshold' | 'topic_match' | null;
  matchedTopic: string | null;
  suggestedAction: 'audit' | 'discovery';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: GroundingCitation[];
  createdAt: string;
}

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

export interface KnowledgeStatusResponse {
  storeName: string | null;
  hasApiKey: boolean;
  syncError: string | null;
  documents: IndexedDocumentRecord[];
}
