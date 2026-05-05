// Static .claude/ tree explorer — used in Hero and Room sections.
// Data is frozen mock; no runtime fetch.

type NodeKind = 'dir' | 'skill' | 'agent' | 'rule' | 'style' | 'file';
type FmStatus = 'ok' | 'warn' | 'fail' | 'draft';

interface TreeNode {
  kind: NodeKind;
  name: string;
  depth: number;
  score: number | null;
  frontmatter: FmStatus;
}

const CLAUDE_TREE: TreeNode[] = [
  { kind: 'dir',   name: '.claude/',                         depth: 0, score: null, frontmatter: 'ok' },
  { kind: 'dir',   name: 'skills/',                          depth: 1, score: null, frontmatter: 'ok' },
  { kind: 'skill', name: 'nakiros-skill-factory',            depth: 2, score: 90,   frontmatter: 'ok' },
  { kind: 'skill', name: 'nakiros-conversation-analyst',     depth: 2, score: 78,   frontmatter: 'ok' },
  { kind: 'skill', name: 'proposal-engine',                  depth: 2, score: 60,   frontmatter: 'warn' },
  { kind: 'skill', name: 'commit-message-writer',            depth: 2, score: null, frontmatter: 'draft' },
  { kind: 'dir',   name: 'agents/',                          depth: 1, score: null, frontmatter: 'ok' },
  { kind: 'agent', name: 'eval-runner',                      depth: 2, score: 88,   frontmatter: 'ok' },
  { kind: 'agent', name: 'session-auditor',                  depth: 2, score: 72,   frontmatter: 'ok' },
  { kind: 'agent', name: 'fix-drafter',                      depth: 2, score: 41,   frontmatter: 'fail' },
  { kind: 'dir',   name: 'output-styles/',                   depth: 1, score: null, frontmatter: 'ok' },
  { kind: 'style', name: 'terse',                            depth: 2, score: 75,   frontmatter: 'ok' },
  { kind: 'dir',   name: 'rules/',                           depth: 1, score: null, frontmatter: 'ok' },
  { kind: 'rule',  name: 'i18n.md',                          depth: 2, score: 88,   frontmatter: 'ok' },
  { kind: 'rule',  name: 'ipc-contract.md',                  depth: 2, score: 70,   frontmatter: 'warn' },
  { kind: 'file',  name: 'CLAUDE.md',                        depth: 1, score: 82,   frontmatter: 'ok' },
  { kind: 'file',  name: 'settings.json',                    depth: 1, score: 70,   frontmatter: 'warn' },
  { kind: 'file',  name: '.mcp.json',                        depth: 1, score: 95,   frontmatter: 'ok' },
];

// Inline SVG paths for kind icons (matches primitives.jsx style)
function KindIcon({ kind }: { kind: NodeKind }) {
  const colorMap: Record<NodeKind, string> = {
    skill: 'var(--accent)',
    agent: 'var(--violet)',
    rule:  'var(--healthy)',
    style: 'var(--watch)',
    file:  'var(--fg-muted)',
    dir:   'var(--fg-faint)',
  };
  const color = colorMap[kind];

  const paths: Record<NodeKind, string> = {
    skill:  'M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z',
    agent:  'M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5v1a3 3 0 0 0 6 0V4a3 3 0 0 0-3 0zM15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-2 5v1a3 3 0 0 1-6 0',
    rule:   'M4 4h13l3 3v13a0 0 0 0 1 0 0H4zM9 9h7M9 13h7M9 17h4',
    style:  'M12 3l1.8 4.4L18 9l-3.6 2 .9 4.4L12 13l-3.3 2.4.9-4.4L6 9l4.2-1.6z',
    file:   'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
    dir:    'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  };

  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d={paths[kind]} />
    </svg>
  );
}

function ScorePill({ value }: { value: number | null }) {
  if (value == null) {
    return (
      <span
        className="lp-mono"
        style={{
          fontSize: 9.5,
          padding: '1px 5px',
          borderRadius: 3,
          color: 'var(--fg-faint)',
          border: '1px dashed var(--border-subtle)',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}
      >
        draft
      </span>
    );
  }
  const tone =
    value >= 85 ? 'healthy' : value >= 65 ? 'accent' : value >= 50 ? 'watch' : 'critical';
  const colorMap: Record<string, string> = {
    healthy: 'var(--healthy)',
    accent:  'var(--accent)',
    watch:   'var(--watch)',
    critical: 'var(--critical)',
  };
  return (
    <span
      className="lp-mono"
      style={{
        fontSize: 10.5,
        padding: '1px 5px',
        borderRadius: 3,
        fontVariantNumeric: 'tabular-nums',
        color: colorMap[tone],
        background: `var(--${tone}-soft)`,
        border: `1px solid oklch(from var(--${tone}) l c h / 0.3)`,
      }}
    >
      {value}
    </span>
  );
}

function FmStatusBadge({ s }: { s: FmStatus }) {
  const map: Record<FmStatus, { label: string; color: string }> = {
    ok:    { label: 'spec ok',   color: 'var(--healthy)' },
    warn:  { label: 'spec warn', color: 'var(--watch)' },
    fail:  { label: 'spec fail', color: 'var(--critical)' },
    draft: { label: 'no spec',   color: 'var(--fg-faint)' },
  };
  const { label, color } = map[s];
  return (
    <span
      className="lp-mono"
      style={{
        fontSize: 9.5,
        color,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}
    >
      ● {label}
    </span>
  );
}

interface ClaudeTreeProps {
  highlight?: string;
}

export function ClaudeTree({ highlight }: ClaudeTreeProps) {
  return (
    <div
      className="lp-mono"
      style={{
        fontSize: 12,
        lineHeight: 1.7,
        overflow: 'hidden',
      }}
    >
      {CLAUDE_TREE.map((n, i) => {
        const isContainer = n.kind === 'dir';
        const isHighlight = highlight != null && n.name === highlight;
        return (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 70px 88px',
              alignItems: 'center',
              gap: 10,
              padding: '4px 12px',
              background: isHighlight ? 'var(--accent-soft)' : 'transparent',
              borderLeft: isHighlight
                ? '2px solid var(--accent)'
                : '2px solid transparent',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                paddingLeft: n.depth * 16,
                minWidth: 0,
              }}
            >
              <KindIcon kind={n.kind} />
              <span
                style={{
                  color: isContainer ? 'var(--fg-faint)' : 'var(--fg)',
                  fontWeight: isContainer ? 400 : 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {n.name}
              </span>
            </div>
            <span style={{ textAlign: 'right' }}>
              {!isContainer && <ScorePill value={n.score} />}
            </span>
            <span style={{ textAlign: 'right' }}>
              {!isContainer && <FmStatusBadge s={n.frontmatter} />}
            </span>
          </div>
        );
      })}
    </div>
  );
}
