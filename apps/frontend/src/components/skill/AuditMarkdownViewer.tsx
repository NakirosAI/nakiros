import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Minus, X } from 'lucide-react';

interface AuditMarkdownViewerProps {
  /** Raw Markdown report (`audit-*.md` content). */
  content: string;
}

/**
 * Markdown renderer dedicated to `nakiros-skill-factory` audit reports.
 * Reuses `react-markdown` + `remark-gfm` so we don't have to maintain a
 * structured parser (cf. previous attempt in
 * `apps/frontend/src/lib/audit-report-parser.ts`), but overrides the
 * table renderers to match the new-design mockup
 * (`apps/Nakiros-new-design/screens-skills.jsx:219-244`):
 *
 * - flat tables with no outer border, only top borders between rows
 * - mono uppercase header row in subtle color
 * - first cell rendered as a faint mono index, value cells in `--n-fg`
 * - "Result" cells containing ✅ / ❌ / N/A are replaced with Lucide
 *   glyphs in the proper semantic color
 *
 * Headings, lists, paragraphs and inline code keep a clean OKLch
 * default. Mermaid / unified diff blocks are out of scope here — audit
 * reports never carry those, and we keep `MarkdownViewer` (the legacy
 * full-featured renderer) for everything else.
 */
export default function AuditMarkdownViewer({ content }: AuditMarkdownViewerProps) {
  return (
    <div className="audit-md font-n-sans text-[12.5px] leading-relaxed text-n-fg">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ── Renderers ──────────────────────────────────────────────────────────────

const components: Components = {
  h1: ({ children }) => (
    // Reports start with `# Audit — name` which we already show in the
    // header card; suppress to avoid duplication.
    <span className="sr-only">{children}</span>
  ),

  h2: ({ children }) => {
    // Group headings (`Frontmatter (3/4)`, `Score: 22/23`, ...) become
    // section labels with a ratio aligned right when present.
    const text = childrenToString(children);
    const ratioMatch = text.match(/^(.+?)\s*\((\d+)\s*\/\s*(\d+)\)\s*$/);
    if (ratioMatch) {
      return (
        <h2 className="mt-6 mb-2 flex items-baseline justify-between border-b border-n-border-subtle pb-2 text-[13px] font-semibold text-n-fg">
          <span>{ratioMatch[1]}</span>
          <span className="font-n-mono text-[11.5px] text-n-muted">
            {ratioMatch[2]}/{ratioMatch[3]}
          </span>
        </h2>
      );
    }
    return (
      <h2 className="mt-6 mb-2 border-b border-n-border-subtle pb-2 text-[13px] font-semibold text-n-fg">
        {children}
      </h2>
    );
  },

  h3: ({ children }) => (
    <h3 className="mt-4 mb-1.5 font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
      {children}
    </h3>
  ),

  p: ({ children }) => (
    <p className="my-2 text-[12.5px] leading-relaxed text-n-fg">{children}</p>
  ),

  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-n-border-default pl-3 font-n-mono text-[11.5px] text-n-muted">
      {children}
    </blockquote>
  ),

  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 text-[12.5px] text-n-muted">{children}</ul>
  ),

  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 text-[12.5px] text-n-muted">{children}</ol>
  ),

  li: ({ children }) => <li className="leading-snug">{children}</li>,

  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-n-accent underline underline-offset-2 hover:text-n-accent-strong"
    >
      {children}
    </a>
  ),

  code: ({ children, className }) => (
    // Inline only — audit reports rarely carry fenced blocks, and when
    // they do (e.g. for paths) the inline style is more compact.
    <code
      className={
        'rounded-n-xs border border-n-border-subtle bg-n-sunken px-1 py-0.5 font-n-mono text-[11px] text-n-fg ' +
        (className ?? '')
      }
    >
      {children}
    </code>
  ),

  hr: () => <hr className="my-4 border-n-border-subtle" />,

  // ── Tables (audit checks) ────────────────────────────────────────────────

  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-n-md border border-n-border-subtle bg-n-surface">
      <table className="w-full border-collapse text-[12.5px]">{children}</table>
    </div>
  ),

  thead: ({ children }) => (
    <thead className="bg-n-sunken/30 text-left font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
      {children}
    </thead>
  ),

  tbody: ({ children }) => <tbody>{children}</tbody>,

  tr: ({ children }) => (
    <tr className="border-t border-n-border-subtle align-top first:border-t-0">{children}</tr>
  ),

  th: ({ children }) => (
    <th className="px-4 py-2 font-medium first:w-12 [&:nth-child(3)]:w-[80px]">{children}</th>
  ),

  td: ({ children, ...props }) => (
    <AuditTableCell {...props}>{children}</AuditTableCell>
  ),
};

// ── Result cell (✓ / ✗ / N/A) ──────────────────────────────────────────────

interface AuditTableCellProps extends React.HTMLAttributes<HTMLTableCellElement> {
  children?: React.ReactNode;
}

/**
 * Renders a `<td>` with new-design styling. When the cell content is
 * a single status glyph (✅ / ❌ / N/A), we swap it for a Lucide icon
 * in the matching semantic color so the result column reads at a
 * glance — the rest of the table keeps the raw Markdown text.
 */
function AuditTableCell({ children, ...props }: AuditTableCellProps) {
  const text = childrenToString(children).trim();

  if (text === '✅' || text === '✓') {
    return (
      <td {...props} className="px-4 py-2.5">
        <span aria-label="passed" className="inline-flex items-center text-n-healthy">
          <Check size={13} strokeWidth={2.5} />
        </span>
      </td>
    );
  }
  if (text === '❌' || text === '✗') {
    return (
      <td {...props} className="px-4 py-2.5">
        <span aria-label="failed" className="inline-flex items-center text-n-critical">
          <X size={13} strokeWidth={2.5} />
        </span>
      </td>
    );
  }
  if (/^N\s*\/\s*A$/i.test(text)) {
    return (
      <td {...props} className="px-4 py-2.5">
        <span
          aria-label="not applicable"
          className="inline-flex items-center gap-1 font-n-mono text-[10.5px] text-n-faint"
        >
          <Minus size={12} strokeWidth={2} />
          N/A
        </span>
      </td>
    );
  }

  // First column — short numeric index — gets a mono faint look.
  if (/^\d+$/.test(text)) {
    return (
      <td
        {...props}
        className="px-4 py-2.5 font-n-mono text-[11px] text-n-faint"
      >
        {children}
      </td>
    );
  }

  return (
    <td {...props} className="px-4 py-2.5 leading-snug text-n-muted [&:nth-child(2)]:text-n-fg">
      {children}
    </td>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Best-effort flatten of `react-markdown` children into a plain string.
 * Used to detect status glyphs and ratio patterns; non-string nodes
 * collapse to an empty string, which is fine since we only branch on
 * exact-match strings.
 */
function childrenToString(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(childrenToString).join('');
  return '';
}
