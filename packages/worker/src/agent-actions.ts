/**
 * Pure argument-mapping functions for nakiros-action tools.
 * Extracted here to be independently unit-testable without a D1/Worker runtime.
 */

import type { CreateEpicBody, CreateStoryBody, CreateTaskBody } from './types.js';

export type ActionArgs = Record<string, string>;

export interface ActionResult<T> {
  ok: true;
  value: T;
}

export interface ActionError {
  ok: false;
  error: string;
  status: 400;
}

export type ActionParseResult<T> = ActionResult<T> | ActionError;

export function parseCreateEpicArgs(args: ActionArgs): ActionParseResult<CreateEpicBody> {
  if (!args['name']) return { ok: false, error: 'name is required', status: 400 };
  const body: CreateEpicBody = {
    name: args['name'],
    ...(args['description'] ? { description: args['description'] } : {}),
    ...(args['color'] ? { color: args['color'] } : {}),
  };
  return { ok: true, value: body };
}

export function parseCreateStoryArgs(args: ActionArgs): ActionParseResult<CreateStoryBody & { epicId?: string }> {
  if (!args['title']) return { ok: false, error: 'title is required', status: 400 };
  const acceptanceCriteria = args['acceptance_criteria']
    ? args['acceptance_criteria'].split('\n').map((s) => s.trim()).filter(Boolean)
    : undefined;
  const storyPoints = args['story_points'] ? Number(args['story_points']) : undefined;
  const priority = (['low', 'medium', 'high'] as const).find((p) => p === args['priority']);
  const body: CreateStoryBody = {
    title: args['title'],
    ...(args['epic_id'] ? { epicId: args['epic_id'] } : {}),
    ...(args['description'] ? { description: args['description'] } : {}),
    ...(acceptanceCriteria ? { acceptanceCriteria } : {}),
    ...(priority ? { priority } : {}),
    ...(storyPoints !== undefined && !isNaN(storyPoints) ? { storyPoints } : {}),
  };
  return { ok: true, value: body };
}

export function parseCreateTaskArgs(args: ActionArgs): ActionParseResult<CreateTaskBody & { storyId: string }> {
  if (!args['story_id']) return { ok: false, error: 'story_id is required', status: 400 };
  if (!args['title']) return { ok: false, error: 'title is required', status: 400 };
  const type = (['backend', 'frontend', 'test', 'other'] as const).find((t) => t === args['type']);
  const body = {
    storyId: args['story_id'],
    title: args['title'],
    ...(args['description'] ? { description: args['description'] } : {}),
    ...(type ? { type } : {}),
  };
  return { ok: true, value: body };
}
