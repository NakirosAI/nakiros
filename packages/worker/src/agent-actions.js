/**
 * Pure argument-mapping functions for nakiros-action tools.
 * Extracted here to be independently unit-testable without a D1/Worker runtime.
 */
export function parseCreateEpicArgs(args) {
    if (!args['name'])
        return { ok: false, error: 'name is required', status: 400 };
    const body = {
        name: args['name'],
        ...(args['description'] ? { description: args['description'] } : {}),
        ...(args['color'] ? { color: args['color'] } : {}),
    };
    return { ok: true, value: body };
}
export function parseCreateStoryArgs(args) {
    if (!args['title'])
        return { ok: false, error: 'title is required', status: 400 };
    const acceptanceCriteria = args['acceptance_criteria']
        ? args['acceptance_criteria'].split('\n').map((s) => s.trim()).filter(Boolean)
        : undefined;
    const storyPoints = args['story_points'] ? Number(args['story_points']) : undefined;
    const priority = ['low', 'medium', 'high'].find((p) => p === args['priority']);
    const body = {
        title: args['title'],
        ...(args['epic_id'] ? { epicId: args['epic_id'] } : {}),
        ...(args['description'] ? { description: args['description'] } : {}),
        ...(acceptanceCriteria ? { acceptanceCriteria } : {}),
        ...(priority ? { priority } : {}),
        ...(storyPoints !== undefined && !isNaN(storyPoints) ? { storyPoints } : {}),
    };
    return { ok: true, value: body };
}
export function parseCreateTaskArgs(args) {
    if (!args['story_id'])
        return { ok: false, error: 'story_id is required', status: 400 };
    if (!args['title'])
        return { ok: false, error: 'title is required', status: 400 };
    const type = ['backend', 'frontend', 'test', 'other'].find((t) => t === args['type']);
    const body = {
        storyId: args['story_id'],
        title: args['title'],
        ...(args['description'] ? { description: args['description'] } : {}),
        ...(type ? { type } : {}),
    };
    return { ok: true, value: body };
}
