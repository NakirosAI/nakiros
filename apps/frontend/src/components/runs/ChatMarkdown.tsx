import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMarkdownProps {
  /** Raw markdown content emitted by the assistant. */
  content: string;
}

/**
 * Lightweight markdown renderer for chat bubbles in the run timeline
 * (create / fix / audit / eval). Same engine as `AuditMarkdownViewer`
 * (`react-markdown` + `remark-gfm`) but with chat-friendly styles —
 * headings stay visible, tables read like data grids, code blocks and
 * inline code use the project mono font. No interactive widgets.
 *
 * Mounted by `AssistantText` in `RunStream.tsx` so every assistant turn
 * — regardless of run kind — gets the same formatting.
 */
export default function ChatMarkdown({ content }: ChatMarkdownProps) {
  return (
    <div className="chat-md min-w-0 break-words text-[13px] leading-relaxed text-n-fg">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-3 text-[15px] font-semibold text-n-fg first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1.5 mt-3 text-[14px] font-semibold text-n-fg first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2.5 text-[13px] font-semibold text-n-fg first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1 mt-2 text-[12.5px] font-semibold text-n-muted first:mt-0">{children}</h4>
  ),

  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,

  strong: ({ children }) => <strong className="font-semibold text-n-fg">{children}</strong>,
  em: ({ children }) => <em className="italic text-n-fg">{children}</em>,

  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-n-border-default pl-3 text-n-muted">
      {children}
    </blockquote>
  ),

  ul: ({ children }) => (
    <ul className="my-1.5 list-disc space-y-0.5 pl-5 marker:text-n-faint">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1.5 list-decimal space-y-0.5 pl-5 marker:text-n-faint">{children}</ol>
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

  code: ({ children, className }) => {
    // `react-markdown` calls this for both inline code and the inner
    // <code> of fenced blocks. The `className` (e.g. `language-ts`) is
    // only present for fenced — we use it to skip the inline styling
    // so the parent <pre> wrapper handles the block.
    if (className && className.startsWith('language-')) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="break-words rounded-n-xs border border-n-border-subtle bg-n-sunken px-1 py-0.5 font-n-mono text-[11.5px] text-n-fg">
        {children}
      </code>
    );
  },

  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-n-md border border-n-border-subtle bg-n-sunken px-3 py-2 font-n-mono text-[11.5px] leading-relaxed text-n-fg">
      {children}
    </pre>
  ),

  hr: () => <hr className="my-3 border-n-border-subtle" />,

  // ── Tables (GFM) ────────────────────────────────────────────────────────
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-n-md border border-n-border-subtle bg-n-surface">
      <table className="w-full border-collapse text-[12.5px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-n-sunken/40 text-left font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
      {children}
    </thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-t border-n-border-subtle align-top first:border-t-0">{children}</tr>
  ),
  th: ({ children }) => <th className="px-3 py-1.5 font-medium">{children}</th>,
  td: ({ children }) => (
    <td className="px-3 py-1.5 leading-snug text-n-fg">{children}</td>
  ),
};
