import { GoogleGenAI } from '@google/genai';
import type { Content } from '@google/genai';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

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

export const COREY_AI_SYSTEM_INSTRUCTION = `You are Corey_AI, the Workforce Management (WFM) Advisory Assistant created by Corey Sewpersad and Outpost WFM.

CORE PERSONA & ADVISORY STYLE:
- Speak with the direct, pragmatic authority of a senior Workforce Management practitioner and BPO operations strategist.
- Avoid generic AI filler, hype, or vague platitudes. Lead with concrete diagnostic structure, interval math, operational guardrails, and clear recommendations.
- Format complex frameworks, formulas, and staffing comparisons using clean Markdown headings, concise bullet points, or compact tables.

STRICT GROUNDING POLICY:
- You have access to the Outpost WFM File Search knowledge store containing Corey Sewpersad's WFM source documents and frameworks.
- Ground your answers strictly in the retrieved WFM source documents from the File Search tool whenever relevant framework content exists.
- Cite the framework or document section naturally when explaining concepts.
- If a visitor asks a question whose specific data or proprietary framework is not present in the indexed WFM source documents, explicitly state what is covered in the indexed Outpost WFM documents versus general standard WFM mathematical principles (such as standard Erlang-C), and never fabricate proprietary Outpost WFM policies or benchmarks that are not in the retrieved files.

SCOPE & CONVERSION BOUNDARIES:
- Never mention authentication gates, subscriptions, paywalls, OpenAI, or Chatbase—every visitor has immediate, open access to Corey_AI.
- Do not aggressively pitch services inside every answer. Let the application's subtle B2B lead-capture prompt handle scheduling when appropriate.`;

export function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const AUDIT_PATTERNS = [
  /\bwfm\s+audit/i,
  /\baudit(ing)?\b/i,
  /\bhealth\s*check\b/i,
  /\bdiagnostic\b/i,
  /\bmaturity\s+assessment\b/i,
  /\b30-60-90\b/i,
];

const TRAINING_PATTERNS = [
  /\bteam\s+training\b/i,
  /\btrain(ing)?\s+(my|our|the)?\s*(wfm|team|planners?|analysts?|rtm)\b/i,
  /\bupskill(ing)?\b/i,
  /\bworkshop\b/i,
  /\bcoaching\s+(for|my|our)?\s*(wfm|team)\b/i,
];

const BPO_PATTERNS = [
  /\bbpo\b/i,
  /\boutsourc(e|ed|ing)\b/i,
  /\bvendor\s+(performance|governance|management|sla|billing|scorecard)\b/i,
  /\bcall\s+center\s+vendor\b/i,
  /\bproductive\s+hour\b/i,
];

export function evaluateLeadTrigger(
  messages: ChatTurn[]
): LeadTriggerEvaluation {
  const userMessages = messages.filter((m) => m.role === 'user');
  const questionCount = userMessages.length;
  const latestText = userMessages[userMessages.length - 1]?.content ?? '';

  if (AUDIT_PATTERNS.some((re) => re.test(latestText))) {
    return {
      shouldPrompt: true,
      reason: 'topic_match',
      matchedTopic: 'WFM Auditing',
      suggestedAction: 'audit',
    };
  }

  if (TRAINING_PATTERNS.some((re) => re.test(latestText))) {
    return {
      shouldPrompt: true,
      reason: 'topic_match',
      matchedTopic: 'WFM Team Training',
      suggestedAction: 'discovery',
    };
  }

  if (BPO_PATTERNS.some((re) => re.test(latestText))) {
    return {
      shouldPrompt: true,
      reason: 'topic_match',
      matchedTopic: 'BPO Performance',
      suggestedAction: 'audit',
    };
  }

  if (questionCount >= 3) {
    return {
      shouldPrompt: true,
      reason: 'question_threshold',
      matchedTopic: null,
      suggestedAction: 'discovery',
    };
  }

  return {
    shouldPrompt: false,
    reason: null,
    matchedTopic: null,
    suggestedAction: 'discovery',
  };
}

export async function generateCoreyAdvisoryReply(params: {
  ai: GoogleGenAI;
  messages: ChatTurn[];
  fileSearchStoreName: string | null;
}): Promise<{
  reply: string;
  citations: GroundingCitation[];
  leadTrigger: LeadTriggerEvaluation;
}> {
  const { ai, messages, fileSearchStoreName } = params;

  const contents: Content[] = messages.map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.content }],
  }));

  const tools = fileSearchStoreName
    ? [
        {
          fileSearch: {
            fileSearchStoreNames: [fileSearchStoreName],
          },
        },
      ]
    : undefined;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents,
    config: {
      systemInstruction: COREY_AI_SYSTEM_INSTRUCTION,
      ...(tools ? { tools } : {}),
    },
  });

  const reply =
    response.text?.trim() ||
    'I could not generate a response from the indexed WFM frameworks. Please rephrase your question.';

  const citations: GroundingCitation[] = [];
  const seenTitles = new Set<string>();
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;

  if (Array.isArray(chunks)) {
    for (const chunk of chunks) {
      const ctx = chunk.retrievedContext;
      if (ctx?.title) {
        const cleanTitle = ctx.title.replace(/^knowledge\//i, '');
        if (!seenTitles.has(cleanTitle)) {
          seenTitles.add(cleanTitle);
          citations.push({
            title: cleanTitle,
            excerpt: ctx.text ? ctx.text.slice(0, 180).trim() : undefined,
          });
        }
      }
    }
  }

  return {
    reply,
    citations,
    leadTrigger: evaluateLeadTrigger(messages),
  };
}
