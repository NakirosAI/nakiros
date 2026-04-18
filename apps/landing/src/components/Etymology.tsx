import { useI18n } from '@/i18n/I18nProvider';

export function Etymology() {
  const { messages } = useI18n();
  const { eyebrow, title, nakama, kairos, synthesis } = messages.etymology;

  return (
    <section id="etymology" className="border-b border-[#1A1A1A] bg-[#111111] py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <span className="font-mono text-xs uppercase tracking-[0.15em] text-[#2ECFCF]">
            {eyebrow}
          </span>
          <h2 className="mt-3 font-mono text-3xl text-[#F0F0F0] sm:text-4xl">{title}</h2>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2">
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

        <p className="mx-auto mt-12 max-w-2xl text-center text-lg leading-relaxed text-[#F0F0F0]/80">
          {synthesis}
        </p>
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
    <div className="rounded-2xl border border-[#1A1A1A] bg-[#0D0D0D] p-8 transition-colors hover:border-[#2ECFCF]/30">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-mono text-2xl text-[#F0F0F0]">{term}</h3>
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#F0F0F0]/40">
          {origin}
        </span>
      </div>
      <p className="mt-4 leading-relaxed text-[#F0F0F0]/70">{meaning}</p>
    </div>
  );
}
