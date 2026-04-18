import { useEffect, useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import clsx from 'clsx';

mermaid.initialize({ startOnLoad: false, theme: 'dark' });

// ── Mermaid diagram renderer ──────────────────────────────────────────────────

function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(`md-mermaid-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;
    mermaid.render(idRef.current, code).then(({ svg }) => {
      if (!cancelled && containerRef.current) {
        containerRef.current.innerHTML = svg;
        setError(null);
      }
    }).catch(err => {
      if (!cancelled) setError(String(err));
    });
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <pre className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400 font-mono overflow-x-auto">
        {code}
      </pre>
    );
  }

  return <div ref={containerRef} className="flex justify-center my-4" />;
}

// ── Diff block renderer ───────────────────────────────────────────────────────

function DiffBlock({ code }: { code: string }) {
  const lines = code.split('\n');
  return (
    <pre className="my-3 overflow-x-auto rounded border border-[var(--line)] bg-[var(--bg-soft)] py-2 text-xs font-mono">
      {lines.map((line, i) => {
        let lineClass = 'text-[var(--text)]';
        let prefix = ' ';
        if (line.startsWith('+')) {
          lineClass = 'bg-emerald-500/10 text-emerald-400';
          prefix = '+';
        } else if (line.startsWith('-')) {
          lineClass = 'bg-red-500/10 text-red-400';
          prefix = '-';
        } else if (line.startsWith('@@')) {
          lineClass = 'bg-blue-500/10 text-blue-400';
          prefix = '@';
        }
        return (
          <div key={i} className={clsx('px-4 py-px', lineClass)}>
            <span className="select-none opacity-50 mr-2">{prefix === ' ' ? ' ' : prefix}</span>
            {line.startsWith('+') || line.startsWith('-') || line.startsWith('@@') ? line.slice(1) : line}
          </div>
        );
      })}
    </pre>
  );
}

// ── Markdown components ───────────────────────────────────────────────────────

const components: Components = {
  // Intercept <pre> to detect mermaid blocks before rendering
  pre({ children, ...props }) {
    const child = Array.isArray(children) ? children[0] : children;
    const el = child as React.ReactElement<{ className?: string; children?: string }> | null;
    if (el?.props?.className?.includes('language-mermaid')) {
      const code = String(el.props.children ?? '').replace(/\n$/, '');
      return <MermaidDiagram code={code} />;
    }
    if (el?.props?.className?.includes('language-diff')) {
      const code = String(el.props.children ?? '').replace(/\n$/, '');
      return <DiffBlock code={code} />;
    }
    return (
      <pre
        {...props}
        className="my-3 rounded border border-[var(--line)] bg-[var(--bg-soft)] px-4 py-3 text-xs font-mono overflow-x-auto"
      >
        {children}
      </pre>
    );
  },
  code({ children, className, ...props }) {
    // Inline code only (block code is handled via <pre> above)
    return (
      <code
        {...props}
        className={clsx(
          'rounded px-1 py-0.5 text-xs font-mono bg-[var(--bg-soft)] text-[var(--text)]',
          className,
        )}
      >
        {children}
      </code>
    );
  },
  table({ children, ...props }) {
    return (
      <div className="overflow-x-auto my-3">
        <table {...props} className="w-full border-collapse text-sm">{children}</table>
      </div>
    );
  },
  th({ children, ...props }) {
    return (
      <th
        {...props}
        className="border border-[var(--line)] px-3 py-1.5 text-left font-semibold bg-[var(--bg-soft)] text-[var(--text)]"
      >
        {children}
      </th>
    );
  },
  td({ children, ...props }) {
    return (
      <td {...props} className="border border-[var(--line)] px-3 py-1.5 align-top text-[var(--text)]">
        {children}
      </td>
    );
  },
  h1({ children, ...props }) {
    return <h1 {...props} className="text-xl font-bold text-[var(--text)] mt-5 mb-2">{children}</h1>;
  },
  h2({ children, ...props }) {
    return <h2 {...props} className="text-lg font-semibold text-[var(--text)] mt-4 mb-1.5">{children}</h2>;
  },
  h3({ children, ...props }) {
    return <h3 {...props} className="text-base font-semibold text-[var(--text)] mt-3 mb-1">{children}</h3>;
  },
  p({ children, ...props }) {
    return <p {...props} className="text-sm text-[var(--text)] leading-relaxed mb-2">{children}</p>;
  },
  ul({ children, ...props }) {
    return <ul {...props} className="list-disc pl-5 my-2 space-y-0.5 text-sm text-[var(--text)]">{children}</ul>;
  },
  ol({ children, ...props }) {
    return <ol {...props} className="list-decimal pl-5 my-2 space-y-0.5 text-sm text-[var(--text)]">{children}</ol>;
  },
  blockquote({ children, ...props }) {
    return (
      <blockquote
        {...props}
        className="border-l-2 border-[var(--line)] pl-4 my-2 text-[var(--text-muted)] italic text-sm"
      >
        {children}
      </blockquote>
    );
  },
  a({ children, href, ...props }) {
    return (
      <a
        {...props}
        href={href}
        className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },
  hr(props) {
    return <hr {...props} className="my-4 border-[var(--line)]" />;
  },
};

// ── Public component ──────────────────────────────────────────────────────────

interface MarkdownViewerProps {
  content?: string;
  className?: string;
  onInternalLinkClick?: (href: string) => void;
}

export function MarkdownViewer({ content = '', className, onInternalLinkClick }: MarkdownViewerProps) {
  const resolvedComponents: Components = {
    ...components,
    a({ children, href, ...props }) {
      const isExternal = href?.startsWith('http://') || href?.startsWith('https://');
      return (
        <a
          {...props}
          href={href}
          className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
          onClick={(e) => {
            e.preventDefault();
            if (!href) return;
            if (isExternal) {
              void window.nakiros.openPath(href);
            } else if (onInternalLinkClick) {
              onInternalLinkClick(href);
            }
          }}
        >
          {children}
        </a>
      );
    },
  };

  return (
    <div className={clsx('overflow-y-auto px-4 py-3', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={resolvedComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
