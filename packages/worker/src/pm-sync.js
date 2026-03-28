import { buildJiraAuthHeader, mapJiraStatus, mapJiraPriority, extractAdfText, } from './jira-import.js';
export async function fetchJiraStoryState(story, baseUrl, authHeader) {
    const url = `${baseUrl}/rest/api/3/issue/${story.externalId}?fields=summary,description,status,priority,updated`;
    const res = await fetch(url, { headers: { Authorization: authHeader, Accept: 'application/json' } });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Jira API error ${res.status}: ${errText}`);
    }
    const data = (await res.json());
    return {
        title: data.fields.summary,
        description: extractAdfText(data.fields.description),
        status: mapJiraStatus(data.fields.status.name),
        priority: mapJiraPriority(data.fields.priority?.name),
        jiraUpdatedMs: new Date(data.fields.updated).getTime(),
    };
}
export function detectConflict(story, jira) {
    const fields = {};
    if (story.title !== jira.title) {
        fields['title'] = { nakiros: story.title, jira: jira.title };
    }
    if (story.status !== jira.status) {
        fields['status'] = { nakiros: story.status, jira: jira.status };
    }
    if (story.priority !== jira.priority) {
        fields['priority'] = { nakiros: story.priority, jira: jira.priority };
    }
    const nakDesc = story.description?.trim() ?? null;
    const jiraDesc = jira.description?.trim() ?? null;
    if (nakDesc !== jiraDesc) {
        fields['description'] = { nakiros: nakDesc, jira: jiraDesc };
    }
    if (Object.keys(fields).length === 0)
        return null;
    return { storyId: story.id, provider: story.externalSource ?? 'jira', fields };
}
// Re-export buildJiraAuthHeader for convenience in index.ts sync routes
export { buildJiraAuthHeader };
