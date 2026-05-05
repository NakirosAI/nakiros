import { useI18n } from '@/i18n/I18nProvider';

/**
 * "Etymology" section — origin story of the name Nakiros (nakama + kairos).
 * Preserved from v1; v2 redesign lacked it. Sits mid-page after the product
 * narrative, just before the FAQ.
 */
export function Etymology() {
  const { messages } = useI18n();
  const { eyebrow, title, nakama, kairos, synthesis } = messages.etymology;

  return (
    <section id="etymology" className="relative z-10 py-24">
      <div className="mx-auto max-w-[1180px] px-6 md:px-9">
        <div className="mb-10">
          <p className="lp-mono mb-3.5 text-[10.5px] uppercase tracking-[1.4px] text-[color:var(--fg-subtle)]">
            {eyebrow}
          </p>
          <h2 className="mb-2 max-w-[720px] text-[38px] font-medium leading-tight tracking-[-0.6px] text-[color:var(--fg)]">
            {title}
          </h2>
          <p className="max-w-[560px] text-[15px] leading-relaxed text-[color:var(--fg-muted)]">
            {synthesis}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <EtymologyCard
            term={nakama.term}
            origin={nakama.origin}
            meaning={nakama.meaning}
          />
          <EtymologyCard
            term={kairos.term}
            origin={kairos.origin}
            meaning={kairos.meaning}
          />
        </div>
      </div>
    </section>
  );
}

function EtymologyCard({
  term,
  origin,
  meaning,
}: {
  term: string;
  origin: string;
  meaning: string;
}) {
  return (
    <div
      className="rounded-[10px] p-6"
      style={{
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="lp-mono text-[20px]" style={{ color: 'var(--fg)' }}>
          {term}
        </h3>
        <span
          className="lp-mono text-[10.5px] uppercase tracking-[1.4px]"
          style={{ color: 'var(--fg-faint)' }}
        >
          {origin}
        </span>
      </div>
      <p
        className="mt-3 text-[14px] leading-[1.55]"
        style={{ color: 'var(--fg-muted)' }}
      >
        {meaning}
      </p>
    </div>
  );
}
