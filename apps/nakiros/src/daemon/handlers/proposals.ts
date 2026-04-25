import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import type {
  AcceptProposalRequest,
  EvalRunEvent,
  GetProposalRequest,
  ListProposalsRequest,
  ListProposalsResponse,
  Proposal,
  ProposalEvalCase,
  ProposalsNewEvent,
  RejectProposalRequest,
  RunComparisonRequest,
  RunProposalEvalRequest,
} from '@nakiros/shared';
import { IPC_CHANNELS } from '@nakiros/shared';

import { startComparisonRun } from '../../services/comparison-runner.js';
import { eventBus } from '../event-bus.js';
import {
  listProposals,
  loadProposal,
  markClusterRejected,
  updateProposalStatus,
} from '../../services/proposal-engine/proposal-store.js';
import { createEventBroadcaster } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

// ---------------------------------------------------------------------------
// Proposals handlers — list, get, accept, reject, runEval.
//
// `runEval` stages the proposal's draft as a throwaway skill under
// ~/.nakiros/skills/_proposal-<id>/ and launches the existing multi-model
// comparison runner against it. Eval events flow through the usual
// `eval:event` broadcast, so the frontend's comparison UI can render them
// with zero new wiring.
// ---------------------------------------------------------------------------

const PROPOSAL_STAGE_ROOT = join(homedir(), '.nakiros', 'skills', '_proposals');

const broadcastEvalEvent = createEventBroadcaster<EvalRunEvent>('eval:event');

export const proposalsHandlers: HandlerRegistry = {
  'proposals:list': (args): ListProposalsResponse => {
    const request = args[0] as ListProposalsRequest | undefined;
    if (!request || typeof request.projectId !== 'string') {
      throw new Error('proposals:list requires a projectId');
    }
    return {
      proposals: listProposals({ projectId: request.projectId, status: request.status }),
    };
  },

  'proposals:get': (args): Proposal | null => {
    const request = args[0] as GetProposalRequest;
    return loadProposal(request.id);
  },

  'proposals:accept': (args): Proposal => {
    const request = args[0] as AcceptProposalRequest;
    const updated = updateProposalStatus(request.id, 'accepted');
    if (!updated) throw new Error(`Proposal ${request.id} not found`);
    broadcastProposalChanged(updated);
    return updated;
  },

  'proposals:reject': (args): Proposal => {
    const request = args[0] as RejectProposalRequest;
    const current = loadProposal(request.id);
    if (!current) throw new Error(`Proposal ${request.id} not found`);

    // Mark the *cluster* as rejected first so the engine skips semantically
    // similar clusters on future passes. Centroid isn't stored on the
    // Proposal, so we reconstruct a rejection record from the cluster id
    // alone — subsequent semantic-match rejection relies on centroid
    // similarity computed by the engine before generation.
    markClusterRejected(current.clusterId, [], request.reason);

    const updated = updateProposalStatus(request.id, 'rejected');
    if (!updated) throw new Error(`Proposal ${request.id} not found`);
    broadcastProposalChanged(updated);
    return updated;
  },

  'proposals:runEval': async (args) => {
    const request = args[0] as RunProposalEvalRequest;
    const proposal = loadProposal(request.id);
    if (!proposal) throw new Error(`Proposal ${request.id} not found`);

    const skillDir = stageProposalAsSkill(proposal);
    const stagedSkillName = `_proposal-${proposal.id}`;
    const models = request.models && request.models.length > 0
      ? request.models
      : ['haiku', 'sonnet'];

    const comparisonRequest: RunComparisonRequest = {
      scope: 'claude-global',
      skillName: stagedSkillName,
      models,
      skillDirOverride: skillDir,
    };

    const response = await startComparisonRun(comparisonRequest, {
      resolveSkillDir: () => skillDir,
      onEvent: broadcastEvalEvent,
    });

    const updated = updateProposalStatus(proposal.id, 'eval_running', {
      evalResults: response,
    });
    if (updated) broadcastProposalChanged(updated);
    return response;
  },
};

/**
 * Reuse the `proposals:new` channel to also broadcast status transitions.
 * The channel name is slightly misleading but the frontend treats any
 * incoming event as "refresh proposals state", so semantics are consistent.
 */
function broadcastProposalChanged(proposal: Proposal): void {
  const event: ProposalsNewEvent = { proposal };
  eventBus.broadcast(IPC_CHANNELS['proposals:new'], event);
}

// ---------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------

function stageProposalAsSkill(proposal: Proposal): string {
  const dir = join(PROPOSAL_STAGE_ROOT, proposal.id);
  mkdirSync(join(dir, 'evals'), { recursive: true });

  // SKILL.md — already a full file emitted by the generator.
  writeFileSync(join(dir, 'SKILL.md'), proposal.draft.content, 'utf8');

  // evals.json — convert ProposalEvalCase[] to the shape eval-runner expects.
  const evalsJson = {
    skill_name: proposal.targetSkill ?? `_proposal-${proposal.id}`,
    evals: proposal.draft.evalCases.map((ec, i) => toEvalFileEntry(ec, i)),
  };
  writeFileSync(
    join(dir, 'evals', 'evals.json'),
    JSON.stringify(evalsJson, null, 2),
    'utf8',
  );

  if (!existsSync(dir)) {
    throw new Error(`Failed to stage proposal skill at ${dir}`);
  }
  return dir;
}

function toEvalFileEntry(ec: ProposalEvalCase, index: number): {
  id: number;
  name: string;
  prompt: string;
  expected_output: string;
  mode: 'autonomous';
  assertions: string[];
} {
  const expectation = ec.expectation?.trim() ?? '';
  return {
    id: index + 1,
    name: ec.name,
    prompt: ec.prompt,
    expected_output: expectation,
    mode: 'autonomous',
    assertions: expectation ? [expectation] : [],
  };
}
