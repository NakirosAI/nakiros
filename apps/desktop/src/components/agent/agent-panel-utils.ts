import type {
  ArtifactContext,
  AgentProvider,
  ConversationParticipant,
  NakirosActionBlock,
} from '@nakiros/shared';
import { AGENT_DEFINITIONS, type AgentDefinition } from '../../constants/agents.js';
import i18n from '../../i18n/index.js';

export interface ActiveMentionContext {
  query: string;
  start: number;
}

export interface ActiveProjectScopeContext {
  query: string;
  start: number;
}

export interface ProjectScopeResolution {
  mentionedRepoPaths: string[];
  mentionedTokens: string[];
  scopeOnlyMessage: boolean;
}

export interface OrchestrationParticipantBlock {
  agent: string;
  provider: string;
  reason: string;
  focus: string;
}

export interface OrchestrationBlock {
  mode: string;
  roundState: string;
  participants: OrchestrationParticipantBlock[];
  scope: string;
  repos: string[];
  userGoal: string;
  synthesisGoal: string;
  parallel?: boolean;
}

export interface AgentSummaryData {
  decisions: string[];
  done: string[];
  openQuestions: string[];
}

export type MessageStatus = 'complete' | 'streaming' | 'error';

export interface ToolActivity {
  name: string;
  display: string;
}

export interface ActionResult {
  tool: string;
  summary: string;
}

export interface Message {
  id: string;
  role: 'user' | 'agent' | 'separator';
  agentId?: string | null;
  separatorLabel?: string;
  content: string;
  status: MessageStatus;
  tools: ToolActivity[];
  actionResults?: ActionResult[];
}

export interface AgentTabState {
  id: string;
  title: string;
  mode: 'global' | 'repo';
  anchorRepoPath: string;
  activeRepoPaths: string[];
  lastResolvedRepoMentions: string[];
  repoPath: string;
  provider: AgentProvider;
  participants: ConversationParticipant[];
  artifactContext?: ArtifactContext | null;
  activeParticipantId: string | null;
  input: string;
  messages: Message[];
  activeRunId: string | null;
  runningCommand: string | null;
  sessionId: string | null;
  conversationId: string | null;
  nakirosConversationId: string | null;
  pendingTitle: string | null;
  hasUnread: boolean;
  hasRunCompletionNotice: boolean;
}

/** Pattern générique — matche [TAG] ou [Multi Word] en début de ligne */
const GENERIC_SEGMENT_PATTERN = /(^|\n)([ \t]*)\[([A-Z][A-Za-z ]+)\](?=[ \t]|$)/g;

function buildSegmentPattern(tags: string[]): RegExp {
  if (tags.length === 0) return GENERIC_SEGMENT_PATTERN;
  const names = tags.join('|');
  return new RegExp(`(^|\\n)([ \\t]*)\\[(${names})\\](?=[ \\t]|$)`, 'g');
}

/** Baseline map dérivée de AGENT_DEFINITIONS — s'enrichit dynamiquement via buildAgentIdToTag() */
export const AGENT_ID_TO_TAG: Record<string, string> = {
  ...Object.fromEntries(
    AGENT_DEFINITIONS.filter((d) => d.tag).map((d) => [d.id, d.tag!]),
  ),
  nakiros: 'CTO', // alias legacy
};

const BASE_TAG_TO_ID_LOWER: Record<string, string> = Object.fromEntries(
  Object.entries(AGENT_ID_TO_TAG).map(([id, tag]) => [tag.toLowerCase(), id]),
);

const PROVIDER_ALIAS_MAP: Record<string, AgentProvider> = {
  gpt: 'codex',
  openai: 'codex',
};

interface AgentSegment {
  tag: string;
  content: string;
}

interface AtMention {
  agentId: string;
  rawProvider: string | null;
}

export function tagForAgentId(agentId: string | null | undefined): string | null {
  if (!agentId) return null;
  return AGENT_ID_TO_TAG[agentId] ?? null;
}

export function resolveMessageSpeakerTag(message: Pick<Message, 'agentId' | 'content'>): string | null {
  const structuredTag = tagForAgentId(message.agentId);
  if (structuredTag) return structuredTag;
  const segments = parseAgentSegments(message.content);
  if (!segments || segments.length !== 1) return null;
  return segments[0]?.tag || null;
}

export function parseAgentSegments(content: string, knownTags?: string[]): AgentSegment[] | null {
  const pattern = new RegExp(buildSegmentPattern(knownTags ?? []).source, 'g');
  const segments: AgentSegment[] = [];
  let lastTag = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const prefix = match[1] ?? '';
    const indent = match[2] ?? '';
    const tag = match[3] ?? '';
    const tagStart = match.index + prefix.length + indent.length;
    const chunk = content.slice(lastIndex, match.index).trim();
    if (chunk) segments.push({ tag: lastTag, content: chunk });
    lastTag = tag;
    lastIndex = tagStart + tag.length + 2;
  }

  const tail = content.slice(lastIndex).trim();
  if (tail) segments.push({ tag: lastTag, content: tail });
  return segments.length > 0 ? segments : null;
}

export function humanizeAgentId(agentId: string): string {
  const knownTag = AGENT_ID_TO_TAG[agentId];
  if (knownTag) return knownTag;
  return agentId
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseOrchestrationBlock(body: string): OrchestrationBlock {
  try {
    const json = JSON.parse(body.trim()) as Record<string, unknown>;
    const ctx = (json['shared_context'] ?? {}) as Record<string, unknown>;
    return {
      mode: (json['mode'] as string) ?? '',
      roundState: (json['round_state'] as string) ?? '',
      parallel: (json['parallel'] as boolean) ?? false,
      participants: ((json['participants'] ?? []) as Record<string, string>[]).map((p) => ({
        agent: p['agent'] ?? '',
        provider: p['provider'] ?? '',
        reason: p['reason'] ?? '',
        focus: p['focus'] ?? '',
      })),
      scope: (ctx['scope'] as string) ?? '',
      repos: (ctx['repos'] as string[]) ?? [],
      userGoal: (ctx['user_goal'] as string) ?? '',
      synthesisGoal: (json['synthesis_goal'] as string) ?? '',
    };
  } catch {
    return { mode: '', roundState: '', participants: [], scope: '', repos: [], userGoal: '', synthesisGoal: '' };
  }
}

function parseAgentSummaryBlock(body: string): AgentSummaryData {
  const lines = body.split('\n');
  let current: keyof AgentSummaryData | null = null;
  const result: AgentSummaryData = { decisions: [], done: [], openQuestions: [] };
  for (const line of lines) {
    const t = line.trim();
    if (t === 'decisions:') {
      current = 'decisions';
      continue;
    }
    if (t === 'done:') {
      current = 'done';
      continue;
    }
    if (t === 'open_questions:') {
      current = 'openQuestions';
      continue;
    }
    if (current && t.startsWith('- ')) result[current].push(t.slice(2).trim());
  }
  return result;
}

export function extractAgentSummaryBlock(content: string): { visibleContent: string; summaryData: AgentSummaryData | null } {
  let summaryData: AgentSummaryData | null = null;
  const visibleContent = content
    .replace(/```agent-summary\n([\s\S]*?)```/g, (_match, body: string) => {
      summaryData = parseAgentSummaryBlock(body);
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { visibleContent, summaryData };
}

export function formatSummaryForStorage(data: AgentSummaryData): string {
  const parts: string[] = [];
  if (data.decisions.length > 0) parts.push(`## Decisions\n${data.decisions.map((d) => `- ${d}`).join('\n')}`);
  if (data.done.length > 0) parts.push(`## Done\n${data.done.map((d) => `- ${d}`).join('\n')}`);
  if (data.openQuestions.length > 0) parts.push(`## Open questions\n${data.openQuestions.map((q) => `- ${q}`).join('\n')}`);
  return parts.join('\n\n');
}

export function extractOrchestrationBlocks(content: string): { visibleContent: string; blocks: OrchestrationBlock[] } {
  const blocks: OrchestrationBlock[] = [];
  const visibleContent = content
    .replace(/```(?:agent-orchestration|nakiros-orchestration)\n([\s\S]*?)```/g, (_match, body: string) => {
      blocks.push(parseOrchestrationBlock(body));
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { visibleContent, blocks };
}

function parseActionBlock(body: string): NakirosActionBlock {
  try {
    const json = JSON.parse(body.trim()) as Record<string, string>;
    const { tool, ...args } = json;
    return { tool: tool ?? '', args };
  } catch {
    return { tool: '', args: {} };
  }
}

export function extractActionBlocks(content: string): { visibleContent: string; blocks: NakirosActionBlock[] } {
  const blocks: NakirosActionBlock[] = [];
  const visibleContent = content
    .replace(/```nakiros-action\n([\s\S]*?)```/g, (_match, body: string) => {
      blocks.push(parseActionBlock(body));
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { visibleContent, blocks };
}

export function extractSpecUpdateBlocks(content: string): { visibleContent: string; specMarkdown: string | null } {
  let specMarkdown: string | null = null;
  const visibleContent = content
    .replace(/<!--\s*spec-update\s*-->([\s\S]*?)<!--\s*\/spec-update\s*-->/g, (_match, body: string) => {
      specMarkdown = body.trim();
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { visibleContent, specMarkdown };
}

export function stripOrchestrationLeakPreamble(content: string): string {
  const normalized = content.trim();
  if (!normalized) return '';

  const strippedFence = normalized.replace(
    /^```(?:orchestration-context|conversation-handoff)?\n([\s\S]*?)```/i,
    (match) => {
      const keywordHits = (match.match(/\b(current_speaker|requested_by|active_participants|completed_this_round|pending_after_you|repo_scope|round_goal|synthesis_goal|mode:|round_state:)\b/gi) ?? []).length;
      return keywordHits >= 2 ? '' : match;
    },
  );

  const paragraphs = strippedFence.split(/\n\s*\n/);
  if (paragraphs.length === 0) return strippedFence.trim();

  const firstParagraph = paragraphs[0]?.trim() ?? '';
  const keywordHits = (firstParagraph.match(/\b(current_speaker|requested_by|active_participants|completed_this_round|pending_after_you|repo_scope|round_goal|synthesis_goal|shared_context|mode:|round_state:|participants:)\b/gi) ?? []).length;

  if (keywordHits >= 2) {
    return paragraphs.slice(1).join('\n\n').trim();
  }

  return strippedFence.trim();
}

export function formatOrchestrationModeLabel(mode: string, t: ReturnType<typeof i18n.getFixedT>): string {
  switch (mode.trim().toLowerCase()) {
    case 'dispatch':
      return t('orchestration.mode.dispatch');
    case 'consult':
      return t('orchestration.mode.consult');
    case 'ask-user':
      return t('orchestration.mode.askUser');
    case 'synthesize':
      return t('orchestration.mode.synthesize');
    case 'document-decision':
      return t('orchestration.mode.documentDecision');
    default:
      return mode;
  }
}

export function formatRoundStateLabel(roundState: string, t: ReturnType<typeof i18n.getFixedT>): string {
  switch (roundState.trim().toLowerCase()) {
    case 'continue':
      return t('orchestration.roundState.continue');
    case 'converged':
      return t('orchestration.roundState.converged');
    case 'stalled':
      return t('orchestration.roundState.stalled');
    case 'needs_user_decision':
      return t('orchestration.roundState.needsUserDecision');
    default:
      return roundState;
  }
}

export function generateTitle(text: string, commandLabelMap: Record<string, string>, defaultTitle: string): string {
  const trimmed = text.trim();
  for (const [cmd, name] of Object.entries(commandLabelMap)) {
    if (trimmed === cmd || trimmed.startsWith(`${cmd} `) || trimmed.startsWith(`${cmd}\n`)) {
      const args = trimmed.slice(cmd.length).trim();
      return args ? `${name} · ${args.slice(0, 40)}` : name;
    }
  }
  const words = trimmed.split(/\s+/);
  const short = words.slice(0, 8).join(' ').trim();
  if (!short) return defaultTitle;
  return words.length > 8 ? `${short}…` : short;
}

export function matchCommandDefinition(text: string, definitions: AgentDefinition[]): AgentDefinition | null {
  const trimmed = text.trim();
  return definitions.find((definition) => (
    trimmed === definition.command
    || trimmed.startsWith(`${definition.command} `)
    || trimmed.startsWith(`${definition.command}\n`)
  )) ?? null;
}

export function extractSlashFilter(input: string): string | null {
  const trimmedStart = input.trimStart();
  const match = trimmedStart.match(/^\/\S*$/);
  return match ? match[0].toLowerCase() : null;
}

export function extractActiveMentionContext(input: string): ActiveMentionContext | null {
  const mentionPattern = /(^|\s)@([^\s@]*)$/;
  const match = mentionPattern.exec(input);
  if (!match) return null;
  const fullMatch = match[0];
  const mentionIndex = fullMatch.lastIndexOf('@');
  if (mentionIndex < 0) return null;
  return {
    query: (match[2] ?? '').toLowerCase(),
    start: match.index + mentionIndex,
  };
}

export function extractActiveProjectScopeContext(input: string): ActiveProjectScopeContext | null {
  const projectPattern = /(^|\s)#([^\s#]*)$/;
  const match = projectPattern.exec(input);
  if (!match) return null;
  const fullMatch = match[0];
  const hashIndex = fullMatch.lastIndexOf('#');
  if (hashIndex < 0) return null;
  return {
    query: (match[2] ?? '').toLowerCase(),
    start: match.index + hashIndex,
  };
}

export function normalizeProjectScopeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function toWorkspaceSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'workspace';
}

export function makeParticipantId(agentId: string, provider: AgentProvider): string {
  return `${agentId}:${provider}`;
}

export function mergeParticipants(
  existing: ConversationParticipant[],
  incoming: ConversationParticipant[],
): ConversationParticipant[] {
  const byId = new Map<string, ConversationParticipant>();
  for (const participant of existing) {
    byId.set(participant.participantId, participant);
  }
  for (const participant of incoming) {
    const previous = byId.get(participant.participantId);
    byId.set(participant.participantId, {
      ...previous,
      ...participant,
      activeRepoPaths: participant.activeRepoPaths.length > 0
        ? participant.activeRepoPaths
        : (previous?.activeRepoPaths ?? []),
      openQuestions: participant.openQuestions.length > 0
        ? participant.openQuestions
        : (previous?.openQuestions ?? []),
      summary: participant.summary || previous?.summary || '',
    });
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
  );
}

export function resolveProjectScopeInMessage(
  input: string,
  tokenToRepoPath: Map<string, string>,
): ProjectScopeResolution {
  const pattern = /(^|\s)#([^\s#]+)/g;
  let match: RegExpExecArray | null;
  const mentionedRepoPaths: string[] = [];
  const mentionedTokens: string[] = [];
  const seenRepoPaths = new Set<string>();
  const recognizedRanges: Array<{ start: number; end: number }> = [];

  while ((match = pattern.exec(input)) !== null) {
    const leading = match[1] ?? '';
    const rawToken = match[2] ?? '';
    const token = normalizeProjectScopeToken(rawToken);
    if (!token || !tokenToRepoPath.has(token)) continue;
    const repoPath = tokenToRepoPath.get(token);
    if (!repoPath) continue;
    if (!seenRepoPaths.has(repoPath)) {
      seenRepoPaths.add(repoPath);
      mentionedRepoPaths.push(repoPath);
    }
    mentionedTokens.push(token);
    const start = match.index + leading.length;
    recognizedRanges.push({ start, end: start + 1 + rawToken.length });
  }

  let remainingText = input;
  for (const range of recognizedRanges.slice().reverse()) {
    remainingText = `${remainingText.slice(0, range.start)} ${remainingText.slice(range.end)}`;
  }

  return {
    mentionedRepoPaths,
    mentionedTokens,
    scopeOnlyMessage: recognizedRanges.length > 0 && remainingText.trim().length === 0,
  };
}

function formatToolDisplay(name: string, input: Record<string, unknown>): string {
  const t = i18n.getFixedT(i18n.language, 'agent');
  const s = (v: unknown) => String(v ?? '');
  const truncate = (str: string, max = 72) => (str.length > max ? `${str.slice(0, max)}…` : str);
  switch (name) {
    case 'Read':
      return t('tools.reading', { path: s(input['file_path']) });
    case 'Write':
      return t('tools.writing', { path: s(input['file_path']) });
    case 'Edit':
    case 'MultiEdit':
      return t('tools.editing', { path: s(input['file_path']) });
    case 'Bash':
      return t('tools.bash', { command: truncate(s(input['command'])) });
    case 'Glob':
      return t('tools.glob', { pattern: s(input['pattern']) });
    case 'Grep':
      return t('tools.grep', { pattern: s(input['pattern']), path: s(input['path'] ?? '.') });
    case 'TodoWrite':
      return t('tools.todoWrite');
    case 'WebFetch':
      return t('tools.webFetch', { url: truncate(s(input['url']), 60) });
    case 'WebSearch':
      return t('tools.webSearch', { query: s(input['query']) });
    case 'Task':
      return t('tools.task', { description: truncate(s(input['description']), 60) });
    default:
      return name;
  }
}

export function rawToUiMessages(rawMessages: unknown[]): Message[] {
  const result: Message[] = [];
  let agentContent = '';
  let agentTools: ToolActivity[] = [];
  let currentAgentId: string | null = null;
  let inAgentTurn = false;
  let hasEmittedText = false;
  const seenToolKeys = new Set<string>();

  function appendTool(name: string, input: Record<string, unknown> = {}) {
    const display = formatToolDisplay(name, input);
    const key = `${name}::${display}`;
    if (seenToolKeys.has(key)) return;
    seenToolKeys.add(key);
    agentTools.push({ name, display });
  }

  function appendAgentText(text: string) {
    if (!text) return;
    if (!currentAgentId && hasEmittedText && /^\s*\[[A-Z][A-Za-z ]+\](?=[ \t]|$)/.test(text)) {
      agentContent = `${agentContent.replace(/\s*$/, '')}\n\n`;
    }
    agentContent += text;
    hasEmittedText = true;
  }

  function flushAgent() {
    if (!inAgentTurn) return;
    result.push({
      id: `restored-agent-${result.length}-${Date.now()}`,
      role: 'agent',
      agentId: currentAgentId,
      content: agentContent,
      status: 'complete',
      tools: agentTools,
    });
    agentContent = '';
    agentTools = [];
    currentAgentId = null;
    inAgentTurn = false;
    hasEmittedText = false;
    seenToolKeys.clear();
  }

  for (const raw of rawMessages) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;

    if (item['type'] === 'user') {
      if (typeof item['content'] !== 'string') continue;
      flushAgent();
      result.push({
        id: `restored-user-${result.length}-${Date.now()}`,
        role: 'user',
        content: item['content'],
        status: 'complete',
        tools: [],
      });
      continue;
    }

    if (item['type'] === 'assistant') {
      const itemAgentId = typeof item['agentId'] === 'string' ? item['agentId'] : null;
      if (inAgentTurn && hasEmittedText && itemAgentId && currentAgentId && itemAgentId !== currentAgentId) {
        flushAgent();
      }
      inAgentTurn = true;
      if (itemAgentId) currentAgentId = itemAgentId;
      const msg = item['message'] as Record<string, unknown> | undefined;
      const blocks = msg?.['content'];
      if (Array.isArray(blocks)) {
        for (const block of blocks) {
          if (!block || typeof block !== 'object') continue;
          const b = block as Record<string, unknown>;
          if (b['type'] === 'text' && typeof b['text'] === 'string') {
            appendAgentText(b['text']);
          } else if (b['type'] === 'tool_use' && typeof b['name'] === 'string') {
            const inp = (b['input'] as Record<string, unknown>) ?? {};
            appendTool(b['name'], inp);
          }
        }
      }
      continue;
    }

    if (item['type'] === 'result') {
      inAgentTurn = true;
      if (!hasEmittedText && typeof item['result'] === 'string') {
        appendAgentText(item['result']);
      }
      continue;
    }

    if (item['type'] === 'item.completed') {
      inAgentTurn = true;
      const itm = item['item'] as Record<string, unknown> | undefined;
      if (itm?.['type'] === 'agent_message' && typeof itm['text'] === 'string') {
        appendAgentText(itm['text']);
      } else if (itm?.['type'] === 'command_execution' && typeof itm['command'] === 'string') {
        appendTool('Bash', { command: itm['command'] });
      }
      continue;
    }

    if (item['type'] === 'item.started') {
      inAgentTurn = true;
      const itm = item['item'] as Record<string, unknown> | undefined;
      if (itm?.['type'] === 'command_execution' && typeof itm['command'] === 'string') {
        appendTool('Bash', { command: itm['command'] });
      }
      continue;
    }
  }

  flushAgent();
  return result;
}

export function startsWithNakirosSlashCommand(input: string): boolean {
  const normalized = input.trimStart();
  return normalized.startsWith('/nak-') || normalized.startsWith('/nak:');
}

export function isAgentProvider(value: unknown): value is AgentProvider {
  return value === 'claude' || value === 'codex' || value === 'cursor';
}

export function extractMeetingAgentTags(messages: Message[], seededTag?: string, knownTags?: string[]): string[] {
  const knownSet = knownTags ? new Set(knownTags) : null;
  const ordered: string[] = [];
  const seen = new Set<string>();
  const addTag = (tag: string) => {
    if (!tag || (knownSet && !knownSet.has(tag)) || seen.has(tag)) return;
    seen.add(tag);
    ordered.push(tag);
  };

  if (seededTag) addTag(seededTag);

  for (const message of messages) {
    if (message.role !== 'agent') continue;
    const speakerTag = resolveMessageSpeakerTag(message);
    if (speakerTag) addTag(speakerTag);
    const segments = parseAgentSegments(message.content, knownTags);
    if (!segments) continue;
    for (const segment of segments) {
      if (!segment.tag) continue;
      addTag(segment.tag);
    }
  }

  return ordered;
}

export function extractMentionedAgentIds(input: string, tagToIdLower?: Record<string, string>): string[] {
  const lookup = tagToIdLower ?? BASE_TAG_TO_ID_LOWER;
  const ordered: string[] = [];
  const seen = new Set<string>();
  const pattern = /(^|\s)@([^\s@]+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    const mentionedAgentId = lookup[(match[2] ?? '').toLowerCase()];
    if (!mentionedAgentId || seen.has(mentionedAgentId)) continue;
    seen.add(mentionedAgentId);
    ordered.push(mentionedAgentId);
  }

  return ordered;
}

export function parseAtMentions(input: string, tagToIdLower?: Record<string, string>): AtMention[] {
  const lookup = tagToIdLower ?? BASE_TAG_TO_ID_LOWER;
  const result: AtMention[] = [];
  const seen = new Set<string>();
  const pattern = /(^|\s)@([^\s@]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    const raw = match[2] ?? '';
    const colonIdx = raw.indexOf(':');
    const tagPart = colonIdx >= 0 ? raw.slice(0, colonIdx) : raw;
    const providerPart = colonIdx >= 0 ? raw.slice(colonIdx + 1) : null;
    const agentId = lookup[tagPart.toLowerCase()];
    if (!agentId || seen.has(agentId)) continue;
    seen.add(agentId);
    result.push({ agentId, rawProvider: providerPart });
  }
  return result;
}

export function resolveProviderOverride(raw: string | null): AgentProvider | 'invalid' | null {
  if (raw === null) return null;
  const validProviders: AgentProvider[] = ['claude', 'codex', 'cursor'];
  if ((validProviders as string[]).includes(raw)) return raw as AgentProvider;
  if (raw in PROVIDER_ALIAS_MAP) return PROVIDER_ALIAS_MAP[raw]!;
  return 'invalid';
}

export function formatProviderName(provider: AgentProvider): string {
  if (provider === 'claude') return 'Claude';
  if (provider === 'codex') return 'Codex';
  return 'Cursor';
}

// ---------------------------------------------------------------------------
// Workflow choices & progress extraction
// ---------------------------------------------------------------------------

export interface WorkflowChoice {
  label: string;
  /** When present, clicking this button fires a Nakiros action directly instead of sending a message to the AI. */
  nakirosAction?: string;
}

export interface WorkflowChoices {
  question: string;
  choices: WorkflowChoice[];
  /** Message content with the choices block stripped — use this for markdown rendering */
  contentWithout: string;
}

/**
 * Pattern: \n---\n\n**question**\n\n1. choice\n2. choice ...
 * Optionally followed by workflow marker lines like `[WORKFLOW] ✅ ...` or `[WORKFLOW] Step N/T ...`
 * Each choice line may optionally start with `[nakiros:action-name] ` to declare a direct IPC action.
 */
const WORKFLOW_CHOICES_RE = /\n---\n\n\*\*([^*\n]+)\*\*\n\n((?:\d+\. [^\n]+\n?){2,})(\n(?:\[[^\]]+\][^\n]*))*\s*$/;
const NAKIROS_ACTION_RE = /^\[nakiros:([^\]]+)\]\s+/;

/**
 * Detects the trailing choices block emitted by workflow instructions.
 * Returns null when the message doesn't end with the convention pattern.
 * Only call on complete (non-streaming) messages.
 */
export function extractWorkflowChoices(content: string): WorkflowChoices | null {
  const match = WORKFLOW_CHOICES_RE.exec(content);
  if (!match) return null;
  const question = match[1]?.trim() ?? '';
  const choices = (match[2] ?? '')
    .split('\n')
    .map((line): WorkflowChoice | null => {
      const text = line.replace(/^\d+\.\s+/, '').trim();
      if (!text) return null;
      const actionMatch = NAKIROS_ACTION_RE.exec(text);
      if (actionMatch) {
        return { label: text.slice(actionMatch[0].length).trim(), nakirosAction: actionMatch[1] };
      }
      return { label: text };
    })
    .filter((c): c is WorkflowChoice => c !== null);
  if (choices.length < 2) return null;
  return {
    question,
    choices,
    // Strip the choices block AND any trailing workflow markers that followed it
    contentWithout: content.slice(0, match.index).trimEnd(),
  };
}

export interface WorkflowProgress {
  current: number;
  total: number;
  label: string;
}

const WORKFLOW_PROGRESS_RE = /\[[\w-]+\]\s+(?:Étape|Step)\s+(\d+)\/(\d+)\s+—\s+([^\n✓]+)/gm;

/**
 * Scans agent message content for the latest workflow step marker.
 * Returns the last match (most advanced step).
 */
export function extractWorkflowProgress(messages: { role: string; content: string }[]): WorkflowProgress | null {
  let result: WorkflowProgress | null = null;
  for (const msg of messages) {
    if (msg.role !== 'agent') continue;
    let m: RegExpExecArray | null;
    const re = new RegExp(WORKFLOW_PROGRESS_RE.source, 'gm');
    while ((m = re.exec(msg.content)) !== null) {
      const current = parseInt(m[1] ?? '0', 10);
      const total = parseInt(m[2] ?? '0', 10);
      const label = (m[3] ?? '').replace(/✓\s*$/, '').trim();
      if (current > 0 && total > 0) result = { current, total, label };
    }
  }
  return result;
}

export function sanitizeVisibleMessageContent(content: string): string {
  const { visibleContent: noOrchestration } = extractOrchestrationBlocks(content);
  const { visibleContent: noActions } = extractActionBlocks(noOrchestration);
  const { visibleContent: noSpec } = extractSpecUpdateBlocks(noActions);
  const { visibleContent } = extractAgentSummaryBlock(noSpec);
  return stripOrchestrationLeakPreamble(visibleContent)
    .replace(/^_cwd:\s+`[^`]+`_\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildVisibleConversationTranscript(messages: Message[]): string {
  const transcript = messages
    .map((message) => {
      if (message.role === 'separator') return '';
      if (message.role === 'user') {
        const trimmed = message.content.trim();
        return trimmed ? `[User]\n${trimmed}` : '';
      }

      const visible = sanitizeVisibleMessageContent(message.content);
      if (!visible) return '';
      const speakerTag = resolveMessageSpeakerTag(message);
      return speakerTag ? `[${speakerTag}]\n${visible}` : visible;
    })
    .filter(Boolean);

  const recentTranscript = transcript.slice(-4);
  return recentTranscript.join('\n\n');
}
