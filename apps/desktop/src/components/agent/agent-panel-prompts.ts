import type { OrchestrationBlock, OrchestrationParticipantBlock } from './agent-panel-utils.js';
import type { OrchestrationExecution, OrchestrationParticipantResult } from './agent-panel-runtime.js';

interface ParticipantConsultationPromptArgs {
  sourceAgentId: string;
  block: OrchestrationBlock;
  participant: OrchestrationParticipantBlock;
  sourceVisibleContent: string;
  completedParticipants: OrchestrationParticipantResult[];
  pendingParticipants: OrchestrationParticipantBlock[];
  humanizeAgentId: (agentId: string) => string;
}

interface SourceSynthesisPromptArgs {
  execution: OrchestrationExecution;
  humanizeAgentId: (agentId: string) => string;
}

interface ConversationHandoffPromptArgs {
  targetAgentId: string;
  activeParticipantIds: string[];
  activeRepoPaths: string[];
  userText: string;
  transcript: string;
  participantSummaries?: Array<{ agentId: string; summary: string }>;
  humanizeAgentId: (agentId: string) => string;
  getRepoName: (repoPath: string) => string;
}

function unique(values: string[]): string[] {
  return values.filter((value, index, array) => array.indexOf(value) === index);
}

export function buildParticipantConsultationPrompt(args: ParticipantConsultationPromptArgs): string {
  const activeParticipants = unique([
    args.humanizeAgentId(args.sourceAgentId),
    ...args.completedParticipants.map((participant) => args.humanizeAgentId(participant.agent)),
    args.humanizeAgentId(args.participant.agent),
    ...args.pendingParticipants.map((participant) => args.humanizeAgentId(participant.agent)),
  ]);
  const priorOutputs = args.completedParticipants.length > 0
    ? args.completedParticipants
      .map((participant) => `[${args.humanizeAgentId(participant.agent)}]\n${participant.summary || participant.content.substring(0, 600) || '(no visible response)'}`)
      .join('\n\n')
    : '';

  return [
    `You are being consulted by ${args.humanizeAgentId(args.sourceAgentId)} in an ongoing workspace conversation.`,
    '',
    '```orchestration-context',
    `current_speaker: ${args.humanizeAgentId(args.participant.agent)}`,
    `requested_by: ${args.humanizeAgentId(args.sourceAgentId)}`,
    `active_participants: [${activeParticipants.join(', ')}]`,
    `completed_this_round: [${args.completedParticipants.map((participant) => args.humanizeAgentId(participant.agent)).join(', ')}]`,
    `pending_after_you: [${args.pendingParticipants.map((participant) => args.humanizeAgentId(participant.agent)).join(', ')}]`,
    `repo_scope: [${args.block.repos.join(', ')}]`,
    `round_goal: ${args.block.userGoal || 'Provide the next specialist contribution for this round.'}`,
    `synthesis_goal: ${args.block.synthesisGoal || 'Help the source agent synthesize the next decision.'}`,
    'speaking_rule: The runtime holds the totem. Speak only from your role, do not simulate other participants, and assume everyone hears the same round context.',
    '```',
    '',
    `Reason: ${args.participant.reason || 'Specialist input requested.'}`,
    `Focus: ${args.participant.focus || 'Answer from your role with the most useful next step.'}`,
    `Scope: ${args.block.scope || 'workspace'}`,
    args.block.repos.length > 0 ? `Repos: ${args.block.repos.join(', ')}` : '',
    args.block.userGoal ? `User goal: ${args.block.userGoal}` : '',
    args.block.synthesisGoal ? `Expected synthesis goal: ${args.block.synthesisGoal}` : '',
    '',
    'Valid project discovery chain: `{repo}/_nakiros/workspace.yaml` -> `~/.nakiros/workspaces/{workspace_slug}/workspace.yaml`.',
    'Never read, mention, or report `.nakiros.yaml` as missing.',
    'Command discipline: prefer simple direct file reads (`sed`, `cat`, `rg`) one by one or in very small batches.',
    'Do not use `xargs` or oversized shell compositions to load a few known files. If one read fails, fall back to simpler per-file commands.',
    'Activation is not the deliverable. Do not stop after announcing that you loaded your persona or config.',
    'In this same turn, continue to a substantive specialist answer grounded in the round goal, or return a clear blocking reason if analysis cannot proceed safely.',
    'Use the orchestration metadata silently. Do not quote, summarize, or reproduce the orchestration-context fields in your visible answer.',
    '',
    priorOutputs ? 'Already heard in this round:' : '',
    priorOutputs,
    priorOutputs ? '' : '',
    'Latest coordinator message:',
    args.sourceVisibleContent || 'No additional coordinator text was provided.',
    '',
    'Answer only from your own specialist perspective. If another specialist is required, emit an `agent-orchestration` block instead of simulating them.',
    'At the end of your response, emit an agent-summary block (invisible to user):',
    '```agent-summary',
    'decisions:',
    '  - key decision or recommendation made',
    'done:',
    '  - what you completed or analysed',
    'open_questions:',
    '  - unresolved question if any',
    '```',
  ].filter(Boolean).join('\n');
}

export function buildSourceSynthesisPrompt(args: SourceSynthesisPromptArgs): string {
  const participantSections = args.execution.completedParticipants.map((participant) => (
    `[${args.humanizeAgentId(participant.agent)}]\n${participant.summary || participant.content.substring(0, 600) || '(no visible response)'}`
  ));

  return [
    'Consulted participants have answered.',
    '',
    '```orchestration-context',
    `current_speaker: ${args.humanizeAgentId(args.execution.sourceAgentId)}`,
    'requested_by: runtime',
    `active_participants: [${unique([
      args.humanizeAgentId(args.execution.sourceAgentId),
      ...args.execution.completedParticipants.map((participant) => args.humanizeAgentId(participant.agent)),
    ]).join(', ')}]`,
    `completed_this_round: [${args.execution.completedParticipants.map((participant) => args.humanizeAgentId(participant.agent)).join(', ')}]`,
    'pending_after_you: []',
    `repo_scope: [${args.execution.sharedRepos.join(', ')}]`,
    `round_goal: ${args.execution.userGoal || 'Synthesize the round and decide the next move.'}`,
    `synthesis_goal: ${args.execution.synthesisGoal || 'Return the best next answer for the user.'}`,
    'speaking_rule: The runtime holds the totem. Synthesize from real participant outputs only; do not invent missing voices.',
    '```',
    '',
    args.execution.userGoal ? `User goal: ${args.execution.userGoal}` : '',
    args.execution.synthesisGoal ? `Synthesis goal: ${args.execution.synthesisGoal}` : '',
    '',
    'Participant outputs:',
    participantSections.join('\n\n'),
    '',
    'Continue the conversation from your own role. If more specialist input is still required, emit a fresh `agent-orchestration` block. Otherwise answer the user directly.',
  ].filter(Boolean).join('\n');
}

export function buildConversationHandoffPrompt(args: ConversationHandoffPromptArgs): string {
  const activeParticipants = unique(
    args.activeParticipantIds
      .map((participantId) => participantId.split(':')[0] ?? participantId)
      .map((agentId) => args.humanizeAgentId(agentId)),
  );
  const repoNames = args.activeRepoPaths
    .map((repoPath) => args.getRepoName(repoPath))
    .filter(Boolean);
  const knownParticipants = (args.participantSummaries ?? []).filter((participant) => participant.summary.trim().length > 0);

  return [
    `You are joining an ongoing workspace conversation as ${args.humanizeAgentId(args.targetAgentId)} because the user explicitly invited you.`,
    '',
    '```orchestration-context',
    `current_speaker: ${args.humanizeAgentId(args.targetAgentId)}`,
    'requested_by: User',
    `active_participants: [${activeParticipants.join(', ')}]`,
    'completed_this_round: []',
    'pending_after_you: []',
    `repo_scope: [${repoNames.join(', ')}]`,
    `round_goal: ${args.userText || 'Join the conversation and contribute from your specialist perspective.'}`,
    'synthesis_goal: Add your specialist view to the visible group conversation without replaying the backstage orchestration.',
    'speaking_rule: The runtime holds the totem. Speak only from your role, do not simulate other participants, and assume everyone heard the same visible discussion.',
    '```',
    '',
    knownParticipants.length > 0 ? 'Participant knowledge snapshots:' : '',
    ...knownParticipants.map((participant) => `[${args.humanizeAgentId(participant.agentId)}]\n${participant.summary}`),
    knownParticipants.length > 0 ? '' : '',
    'Recent conversation (last 4 messages):',
    args.transcript || '[No prior visible messages available.]',
    '',
    `Latest user invitation: ${args.userText}`,
    '',
    'Treat the transcript as the shared meeting context.',
    'Ignore orchestration/tool noise; it has already been filtered out.',
    'Activation is not the deliverable. Continue in this same turn to a substantive specialist answer or a clear blocking reason.',
    'Do not quote or reproduce the orchestration-context, conversation-handoff metadata, or transcript scaffolding in your visible answer.',
    'Answer only from your own role. If another specialist is needed and not already active, emit an `agent-orchestration` block instead of simulating them.',
    'At the end of your response, emit an agent-summary block (invisible to user):',
    '```agent-summary',
    'decisions:',
    '  - key decision or recommendation made',
    'done:',
    '  - what you completed or analysed',
    'open_questions:',
    '  - unresolved question if any',
    '```',
  ].filter(Boolean).join('\n');
}
