import { and, eq } from 'drizzle-orm';
import * as schema from './schema.js';
// ─── Auth helper ─────────────────────────────────────────────────────────────
export function buildJiraAuthHeader(email, apiToken) {
    return `Basic ${btoa(`${email}:${apiToken}`)}`;
}
// ─── Pagination fetch ─────────────────────────────────────────────────────────
async function fetchAllJiraIssues(baseUrl, authHeader, jql, fields) {
    const all = [];
    let startAt = 0;
    while (true) {
        const url = `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=100&fields=${fields}`;
        const res = await fetch(url, { headers: { Authorization: authHeader, Accept: 'application/json' } });
        if (!res.ok)
            throw new Error(`Jira API ${res.status}: ${res.statusText}`);
        const data = await res.json();
        all.push(...data.issues);
        if (all.length >= data.total)
            break;
        startAt += data.issues.length;
    }
    return all;
}
// ─── Field helpers ────────────────────────────────────────────────────────────
export function extractAdfText(adf) {
    if (!adf || typeof adf !== 'object')
        return null;
    try {
        const doc = adf;
        const text = doc.content
            ?.flatMap((b) => b.content?.map((i) => i.text ?? '') ?? [])
            .join(' ').trim();
        return text || null;
    }
    catch {
        return null;
    }
}
export function mapJiraStatus(s) {
    const l = s.toLowerCase();
    if (['done', 'closed', 'resolved'].includes(l))
        return 'done';
    if (['in progress', 'in development'].includes(l))
        return 'in_progress';
    if (['in review', 'code review', 'testing'].includes(l))
        return 'in_review';
    if (['to do', 'open', 'selected for development'].includes(l))
        return 'todo';
    return 'backlog';
}
export function mapJiraEpicStatus(s) {
    const l = s.toLowerCase();
    if (['done', 'closed', 'resolved'].includes(l))
        return 'done';
    if (['in progress', 'in development'].includes(l))
        return 'in_progress';
    return 'backlog';
}
export function mapJiraPriority(s) {
    const l = (s ?? '').toLowerCase();
    if (['high', 'highest', 'critical', 'blocker'].includes(l))
        return 'high';
    if (['low', 'lowest', 'trivial'].includes(l))
        return 'low';
    return 'medium';
}
export async function updateJiraIssue(baseUrl, authHeader, issueKey, payload) {
    const res = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}`, {
        method: 'PUT',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Jira API error ${res.status}: ${errText}`);
    }
    // Jira PUT /issue returns 204 No Content on success — no JSON to parse
}
export async function createJiraIssue(baseUrl, authHeader, payload) {
    const res = await fetch(`${baseUrl}/rest/api/3/issue`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Jira API error ${res.status}: ${errText}`);
    }
    const data = (await res.json());
    return { key: data.key };
}
export function plainTextToAdf(text) {
    if (!text?.trim())
        return { type: 'doc', version: 1, content: [] };
    const paragraphs = text.split(/\n\n+/).filter(Boolean);
    return {
        type: 'doc',
        version: 1,
        content: paragraphs.map((para) => ({
            type: 'paragraph',
            content: [{ type: 'text', text: para.replace(/\n/g, ' ').trim() }],
        })),
    };
}
export function mapNakirosPriorityToJira(priority) {
    if (priority === 'high')
        return 'High';
    if (priority === 'low')
        return 'Low';
    return 'Medium';
}
export function buildJiraIssuePayload(story, projectKey) {
    const adfDescription = plainTextToAdf(story.description);
    if (story.acceptanceCriteria && story.acceptanceCriteria.length > 0) {
        adfDescription.content.push({
            type: 'bulletList',
            content: story.acceptanceCriteria.map((ac) => ({
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: ac }] }],
            })),
        });
    }
    return {
        fields: {
            project: { key: projectKey },
            summary: story.title,
            issuetype: { name: 'Story' },
            priority: { name: mapNakirosPriorityToJira(story.priority) },
            ...(adfDescription.content.length > 0 && { description: adfDescription }),
        },
    };
}
// ─── Internal helpers ─────────────────────────────────────────────────────────
function getEpicKey(issue) {
    return issue.fields.parent?.key ?? issue.fields.customfield_10014 ?? null;
}
function getCurrentSprintName(issue) {
    const sprints = issue.fields.customfield_10020;
    return sprints?.length ? sprints[sprints.length - 1]?.name : undefined;
}
async function upsertEpicInTx(tx, workspaceId, issue) {
    const now = new Date();
    const existing = (await tx
        .select()
        .from(schema.epics)
        .where(and(eq(schema.epics.workspaceId, workspaceId), eq(schema.epics.externalId, issue.key), eq(schema.epics.externalSource, 'jira')))
        .all())[0];
    if (existing) {
        await tx
            .update(schema.epics)
            .set({
            name: issue.fields.summary,
            description: extractAdfText(issue.fields.description),
            status: mapJiraEpicStatus(issue.fields.status.name),
            updatedAt: now,
        })
            .where(eq(schema.epics.id, existing.id));
        return { id: existing.id, created: false };
    }
    const id = crypto.randomUUID();
    await tx.insert(schema.epics).values({
        id, workspaceId,
        name: issue.fields.summary,
        description: extractAdfText(issue.fields.description),
        color: null,
        status: mapJiraEpicStatus(issue.fields.status.name),
        rank: now.getTime(),
        externalId: issue.key,
        externalSource: 'jira',
        createdAt: now,
        updatedAt: now,
    });
    return { id, created: true };
}
async function upsertStoryInTx(tx, workspaceId, issue, epicMap, sprintMap) {
    const now = new Date();
    const nowMs = now.getTime();
    const epicKey = getEpicKey(issue);
    const epicId = epicKey ? (epicMap.get(epicKey) ?? null) : null;
    const sprintName = getCurrentSprintName(issue)?.toLowerCase().trim();
    const sprintId = sprintName ? (sprintMap.get(sprintName) ?? null) : null;
    const existing = (await tx
        .select()
        .from(schema.stories)
        .where(and(eq(schema.stories.workspaceId, workspaceId), eq(schema.stories.externalId, issue.key), eq(schema.stories.externalSource, 'jira')))
        .all())[0];
    if (existing) {
        await tx
            .update(schema.stories)
            .set({
            title: issue.fields.summary,
            description: extractAdfText(issue.fields.description),
            epicId, sprintId,
            status: mapJiraStatus(issue.fields.status.name),
            priority: mapJiraPriority(issue.fields.priority?.name),
            storyPoints: issue.fields.customfield_10016 ?? null,
            lastSyncedAt: nowMs,
            updatedAt: now,
        })
            .where(eq(schema.stories.id, existing.id));
        return { created: false };
    }
    await tx.insert(schema.stories).values({
        id: crypto.randomUUID(), workspaceId,
        epicId, sprintId,
        title: issue.fields.summary,
        description: extractAdfText(issue.fields.description),
        acceptanceCriteria: null,
        status: mapJiraStatus(issue.fields.status.name),
        priority: mapJiraPriority(issue.fields.priority?.name),
        assignee: null,
        storyPoints: issue.fields.customfield_10016 ?? null,
        rank: nowMs,
        externalId: issue.key,
        externalSource: 'jira',
        lastSyncedAt: nowMs,
        createdAt: now,
        updatedAt: now,
    });
    return { created: true };
}
// ─── Main import function ─────────────────────────────────────────────────────
export async function runJiraImport(context, storage, _env) {
    const { workspaceId, projectKey, apiToken, metadata } = context;
    const baseUrl = metadata['baseUrl'];
    const email = metadata['email'];
    const authHeader = buildJiraAuthHeader(email, apiToken);
    // ── 1. Fetch from Jira (BEFORE transaction) ──────────────────────────────
    const epicFields = 'id,key,summary,description,status,priority';
    const storyFields = 'id,key,summary,description,status,priority,customfield_10016,customfield_10020,parent,customfield_10014';
    const jiraEpics = await fetchAllJiraIssues(baseUrl, authHeader, `project=${projectKey} AND issuetype=Epic`, epicFields);
    const jiraStories = await fetchAllJiraIssues(baseUrl, authHeader, `project=${projectKey} AND issuetype in (Story, Task, Bug, "Sub-task")`, storyFields);
    // ── 2. Load sprints before transaction ───────────────────────────────────
    const nakirosSprints = await storage.listSprints(workspaceId);
    const sprintMap = new Map(nakirosSprints.map((s) => [s.name.toLowerCase().trim(), s.id]));
    // ── 3. Run all D1 writes inside a transaction ────────────────────────────
    let epicCount = 0, storyCount = 0, updatedCount = 0;
    await storage.db.transaction(async (tx) => {
        for (const issue of jiraEpics) {
            const { created } = await upsertEpicInTx(tx, workspaceId, issue);
            created ? epicCount++ : updatedCount++;
        }
        // Build epicMap WITHIN transaction for consistency
        const epicRows = await tx
            .select({ id: schema.epics.id, externalId: schema.epics.externalId })
            .from(schema.epics)
            .where(and(eq(schema.epics.workspaceId, workspaceId), eq(schema.epics.externalSource, 'jira')))
            .all();
        const epicMap = new Map(epicRows.map((e) => [e.externalId, e.id]));
        for (const issue of jiraStories) {
            const { created } = await upsertStoryInTx(tx, workspaceId, issue, epicMap, sprintMap);
            created ? storyCount++ : updatedCount++;
        }
    });
    return { epics: epicCount, stories: storyCount, updated: updatedCount };
}
