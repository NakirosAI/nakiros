import type {
  ArtifactChangeMode,
  ArtifactContext,
  ArtifactTarget,
} from '@nakiros/shared';

interface ArtifactSnapshot {
  content: string;
  title: string;
}

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

function normalizeComparable(content: string): string {
  return content.replace(/\r\n/g, '\n').trim();
}

function getDocTitle(path: string): string {
  return basename(path);
}

export function artifactTargetLabel(target: ArtifactTarget): string {
  if (target.kind === 'workspace_doc') return getDocTitle(target.absolutePath);
  return target.kind;
}

export function buildArtifactContextRunMessage(
  artifactContext: ArtifactContext | null | undefined,
  userMessage: string,
): string {
  if (!artifactContext) return userMessage;

  const targetDescriptor = artifactContext.target.kind === 'workspace_doc'
    ? `{"kind":"workspace_doc","absolutePath":"${artifactContext.target.absolutePath.replace(/"/g, '\\"')}"}`
    : `{"kind":"${artifactContext.target.kind}","workspaceId":"${artifactContext.target.workspaceId.replace(/"/g, '\\"')}","id":"${artifactContext.target.id.replace(/"/g, '\\"')}"}`;

  return [
    'You are editing a specific artifact.',
    `Mode: ${artifactContext.mode}.`,
    'If you propose a modification, return exactly one artifact block using this envelope:',
    '<!-- nakiros-artifact-change {json metadata} -->',
    'FULL RESULTING CONTENT',
    '<!-- /nakiros-artifact-change -->',
    'Metadata must include the exact target below.',
    `Exact target: ${targetDescriptor}`,
    'The body must contain the full resulting artifact content, not a patch.',
    'Do not claim the artifact was written when mode is diff.',
    '',
    userMessage,
  ].join('\n');
}

export async function readArtifactSnapshot(target: ArtifactTarget): Promise<ArtifactSnapshot> {
  if (target.kind === 'workspace_doc') {
    return {
      content: await window.nakiros.readDoc(target.absolutePath),
      title: getDocTitle(target.absolutePath),
    };
  }

  throw new Error(`Unsupported artifact target kind: ${target.kind}`);
}

export async function applyArtifactSnapshot(target: ArtifactTarget, proposedContent: string): Promise<void> {
  if (target.kind === 'workspace_doc') {
    await window.nakiros.writeDoc(target.absolutePath, proposedContent);
    return;
  }

  throw new Error(`Unsupported artifact target kind: ${target.kind}`);
}

export async function rollbackArtifactSnapshot(target: ArtifactTarget, baselineContent: string): Promise<void> {
  await applyArtifactSnapshot(target, baselineContent);
}

export async function hasArtifactBaselineConflict(target: ArtifactTarget, baselineContent: string): Promise<boolean> {
  const current = await readArtifactSnapshot(target);
  return normalizeComparable(current.content) !== normalizeComparable(baselineContent);
}

export function resolveArtifactMode(
  explicitMode: ArtifactChangeMode | null | undefined,
  fallbackMode: ArtifactChangeMode | null | undefined,
): ArtifactChangeMode {
  return explicitMode ?? fallbackMode ?? 'diff';
}
