export type AgentGroup = 'meta' | 'agent' | 'workflow';
export type AgentKind = 'agent' | 'workflow';

export interface AgentDefinition {
  id: string;
  /** Short tag used in [TAG] response headers and @mention resolution (agent-kind only) */
  tag?: string;
  label: string;
  labelKey: string;
  command: string;
  /** Hex color for this agent's tag badge (agent-kind only) */
  color?: string;
  /** 'meta' reserved, 'agent' = specialized agent, 'workflow' = slash command workflow */
  group: AgentGroup;
  /** Derived: meta/agent → 'agent', workflow → 'workflow' */
  kind: AgentKind;
  placeholder: string;
  placeholderKey: string;
}

interface InstalledCommandLike {
  id: string;
  command: string;
  kind: AgentKind;
  meta?: { tag?: string; label?: string; color?: string; placeholder?: string };
}

/** Empty at build time — populated at runtime from manifest via resolveAgentDefinitions() */
export const AGENT_DEFINITIONS: AgentDefinition[] = [];

const BUILTIN_BY_COMMAND = new Map(
  AGENT_DEFINITIONS.map((definition) => [definition.command, definition]),
);

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function dynamicDefinitionFromInstalled(command: InstalledCommandLike): AgentDefinition {
  const normalizedCommand = command.command.startsWith('/') ? command.command : `/${command.command}`;
  const id = command.id || normalizedCommand.replace(/^\/nak-(?:agent|workflow)-/, '');
  const label = command.meta?.label ?? humanizeSlug(id);
  const tag = command.meta?.tag;
  const color = command.meta?.color;
  const defaultPlaceholder = command.kind === 'workflow' ? `Run ${label}?` : `Message for ${label}…`;

  return {
    id,
    tag,
    label,
    labelKey: '',
    command: normalizedCommand,
    color,
    group: command.kind === 'workflow' ? 'workflow' : 'agent',
    kind: command.kind,
    placeholder: command.meta?.placeholder ?? defaultPlaceholder,
    placeholderKey: '',
  };
}

export function resolveAgentDefinitions(installedCommands: InstalledCommandLike[] | null | undefined): AgentDefinition[] {
  if (!installedCommands || installedCommands.length === 0) return [];

  const seen = new Set<string>();
  const resolved: AgentDefinition[] = [];
  for (const command of installedCommands) {
    const normalizedCommand = command.command.startsWith('/') ? command.command : `/${command.command}`;
    if (seen.has(normalizedCommand)) continue;
    seen.add(normalizedCommand);

    const builtin = BUILTIN_BY_COMMAND.get(normalizedCommand);
    resolved.push(builtin ?? dynamicDefinitionFromInstalled({ ...command, command: normalizedCommand }));
  }

  return resolved;
}

export function getAgentDefinitionLabel(
  definition: AgentDefinition,
  translate: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!definition.labelKey) return definition.label;
  return translate(definition.labelKey, { defaultValue: definition.label });
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Construit une color map à partir des définitions résolues (100% dynamique, pas de hardcode) */
export function buildAgentColorMap(
  definitions: AgentDefinition[],
): Record<string, { accent: string; bg: string }> {
  const result: Record<string, { accent: string; bg: string }> = {};
  for (const def of definitions) {
    if (def.tag && def.color) {
      result[def.tag] = { accent: def.color, bg: hexToRgba(def.color, 0.07) };
    }
  }
  return result;
}

/** Construit la map id → tag à partir des définitions résolues */
export function buildAgentIdToTag(definitions: AgentDefinition[]): Record<string, string> {
  return Object.fromEntries(
    definitions.filter((d) => d.tag).map((d) => [d.id, d.tag!]),
  );
}
