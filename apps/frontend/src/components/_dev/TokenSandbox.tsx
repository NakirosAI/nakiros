import { useEffect, useState } from 'react';
import HBar from '../viz/HBar';
import Sparkline from '../viz/Sparkline';

/*
 * Dev-only sandbox for the new-design OKLch token set introduced in the
 * Phase 0 of `docs/refactoring/07-new-design-integration.md`. Surfaces
 * every `--n-*` token and Tailwind utility (bg-n-*, text-n-*, ...) so
 * we can validate visuals before any screen is migrated.
 *
 * Open via `?dev=tokens` in the URL. Removed once the migration lands.
 */

type Density = 'standard' | 'compact' | 'comfy';

const SURFACES = [
  { name: 'canvas', cls: 'bg-n-canvas' },
  { name: 'surface', cls: 'bg-n-surface' },
  { name: 'raised', cls: 'bg-n-raised' },
  { name: 'sunken', cls: 'bg-n-sunken' },
  { name: 'overlay', cls: 'bg-n-overlay' },
];

const TEXT_TONES = [
  { name: 'fg', cls: 'text-n-fg' },
  { name: 'muted', cls: 'text-n-muted' },
  { name: 'subtle', cls: 'text-n-subtle' },
  { name: 'faint', cls: 'text-n-faint' },
];

const BORDERS = [
  { name: 'subtle', cls: 'border-n-border-subtle' },
  { name: 'default', cls: 'border-n-border-default' },
  { name: 'strong', cls: 'border-n-border-strong' },
];

const SEMANTIC = [
  { name: 'accent', solid: 'bg-n-accent', soft: 'bg-n-accent-soft', text: 'text-n-accent' },
  { name: 'healthy', solid: 'bg-n-healthy', soft: 'bg-n-healthy-soft', text: 'text-n-healthy' },
  { name: 'watch', solid: 'bg-n-watch', soft: 'bg-n-watch-soft', text: 'text-n-watch' },
  { name: 'critical', solid: 'bg-n-critical', soft: 'bg-n-critical-soft', text: 'text-n-critical' },
  { name: 'info', solid: 'bg-n-info', soft: 'bg-n-info-soft', text: 'text-n-info' },
  { name: 'violet', solid: 'bg-n-violet', soft: 'bg-n-violet-soft', text: 'text-n-violet' },
];

const TRACKS = [
  { name: 'tokens', cls: 'bg-n-track-tokens' },
  { name: 'context', cls: 'bg-n-track-context' },
  { name: 'friction', cls: 'bg-n-track-friction' },
  { name: 'tools', cls: 'bg-n-track-tools' },
  { name: 'cache', cls: 'bg-n-track-cache' },
];

const RADII = [
  { name: 'xs', cls: 'rounded-n-xs' },
  { name: 'sm', cls: 'rounded-n-sm' },
  { name: 'md', cls: 'rounded-n-md' },
  { name: 'lg', cls: 'rounded-n-lg' },
  { name: 'xl', cls: 'rounded-n-xl' },
];

const SHADOWS = [
  { name: 'card', cls: 'shadow-n-card' },
  { name: 'pop', cls: 'shadow-n-pop' },
  { name: 'glow-accent', cls: 'shadow-n-glow-accent' },
];

export default function TokenSandbox() {
  const [density, setDensity] = useState<Density>('standard');
  const [hue, setHue] = useState(195);

  useEffect(() => {
    const root = document.documentElement;
    if (density === 'standard') delete root.dataset.density;
    else root.dataset.density = density;
  }, [density]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--n-accent', `oklch(0.78 0.10 ${hue})`);
    root.style.setProperty('--n-accent-strong', `oklch(0.84 0.12 ${hue})`);
    root.style.setProperty('--n-accent-soft', `oklch(0.78 0.10 ${hue} / 0.14)`);
    root.style.setProperty('--n-accent-line', `oklch(0.78 0.10 ${hue} / 0.35)`);
    return () => {
      root.style.removeProperty('--n-accent');
      root.style.removeProperty('--n-accent-strong');
      root.style.removeProperty('--n-accent-soft');
      root.style.removeProperty('--n-accent-line');
    };
  }, [hue]);

  return (
    <div className="min-h-screen bg-n-canvas font-n-sans text-n-fg">
      <header className="border-b border-n-border-default bg-n-sunken px-6 py-4">
        <h1 className="text-lg font-semibold">Nakiros — Token sandbox</h1>
        <p className="mt-1 text-sm text-n-muted">
          Phase 0 PR1a · validate OKLch tokens, density, accent hue. Remove via PR cleanup.
        </p>
        <div className="mt-3 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-n-muted">
            Density:
            <select
              className="rounded-n-sm border border-n-border-default bg-n-raised px-2 py-1 text-n-fg"
              value={density}
              onChange={(e) => setDensity(e.target.value as Density)}
            >
              <option value="standard">standard</option>
              <option value="compact">compact</option>
              <option value="comfy">comfy</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-n-muted">
            Accent hue:
            <input
              type="range"
              min={0}
              max={360}
              step={5}
              value={hue}
              onChange={(e) => setHue(Number(e.target.value))}
            />
            <span className="font-n-mono tabular-nums text-n-fg">{hue}°</span>
          </label>
          <div className="flex gap-1.5">
            {[195, 165, 240, 295, 80, 25].map((h) => (
              <button
                key={h}
                onClick={() => setHue(h)}
                className="h-5 w-5 rounded-full border-2"
                style={{
                  background: `oklch(0.78 0.10 ${h})`,
                  borderColor: hue === h ? 'var(--n-fg)' : 'transparent',
                }}
                aria-label={`hue ${h}`}
              />
            ))}
          </div>
        </div>
      </header>

      <main className="space-y-10 px-6 py-8">
        <Section title="Surfaces">
          <Grid>
            {SURFACES.map((s) => (
              <Swatch key={s.name} label={s.name} cls={s.cls} />
            ))}
          </Grid>
        </Section>

        <Section title="Text tones">
          <div className="space-y-1 rounded-n-md border border-n-border-default bg-n-surface p-4">
            {TEXT_TONES.map((t) => (
              <p key={t.name} className={t.cls}>
                <span className="font-n-mono text-xs">{t.cls}</span> · The quick brown fox jumps
                over the lazy dog.
              </p>
            ))}
            <p className="font-n-mono text-n-muted">font-n-mono · 0123456789 ABCabc</p>
          </div>
        </Section>

        <Section title="Borders">
          <Grid>
            {BORDERS.map((b) => (
              <div
                key={b.name}
                className={`flex h-20 items-center justify-center rounded-n-md border-2 bg-n-surface text-sm text-n-muted ${b.cls}`}
              >
                {b.name}
              </div>
            ))}
          </Grid>
        </Section>

        <Section title="Semantic colors">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {SEMANTIC.map((s) => (
              <div
                key={s.name}
                className="overflow-hidden rounded-n-md border border-n-border-default bg-n-surface"
              >
                <div className={`h-10 ${s.solid}`} />
                <div className={`h-10 ${s.soft}`} />
                <div className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className={s.text}>{s.name}</span>
                  <span className="font-n-mono text-xs text-n-faint">solid · soft</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Sismograph tracks">
          <Grid>
            {TRACKS.map((t) => (
              <Swatch key={t.name} label={t.name} cls={t.cls} />
            ))}
          </Grid>
        </Section>

        <Section title="Radii">
          <div className="flex flex-wrap gap-3">
            {RADII.map((r) => (
              <div
                key={r.name}
                className={`flex h-16 w-24 items-center justify-center bg-n-accent-soft text-sm text-n-accent ${r.cls}`}
              >
                {r.name}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Shadows">
          <div className="flex flex-wrap gap-6 rounded-n-md bg-n-canvas p-6">
            {SHADOWS.map((s) => (
              <div
                key={s.name}
                className={`flex h-20 w-32 items-center justify-center rounded-n-md bg-n-surface text-sm text-n-muted ${s.cls}`}
              >
                {s.name}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Density tokens (live)">
          <div className="rounded-n-md border border-n-border-default bg-n-surface p-4 text-sm text-n-muted">
            <div className="font-n-mono">
              row-h = <span className="text-n-fg">var(--n-row-h)</span>
              {' · '}pad-card = <span className="text-n-fg">var(--n-pad-card)</span>
            </div>
            <div className="mt-3 flex flex-col gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex items-center rounded-n-sm bg-n-raised px-3 text-n-fg"
                  style={{ height: 'var(--n-row-h)' }}
                >
                  Row {i} — height resolves to current density
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Viz primitives (PR3a)">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-n-md border border-n-border-default bg-n-surface p-4">
              <div className="mb-2 font-n-mono text-xs uppercase tracking-wide text-n-subtle">
                Sparkline
              </div>
              <div className="space-y-3">
                <SparklineSwatch label="rising" data={[2, 4, 3, 6, 5, 8, 12]} />
                <SparklineSwatch label="falling" data={[12, 10, 11, 7, 6, 4, 3]} />
                <SparklineSwatch label="flat" data={[5, 5, 5, 5, 5]} stroke="var(--n-fg-muted)" fill="oklch(0.96 0.005 240 / 0.05)" />
                <SparklineSwatch label="watch" data={[3, 5, 4, 7, 9, 8, 11]} stroke="var(--n-watch)" fill="var(--n-watch-soft)" />
                <SparklineSwatch label="critical, dot" data={[8, 6, 9, 4, 7, 3, 2]} stroke="var(--n-critical)" fill="var(--n-critical-soft)" dot />
              </div>
            </div>
            <div className="rounded-n-md border border-n-border-default bg-n-surface p-4">
              <div className="mb-2 font-n-mono text-xs uppercase tracking-wide text-n-subtle">
                HBar
              </div>
              <div className="space-y-3">
                <HBarSwatch label="20% accent" value={20} max={100} />
                <HBarSwatch label="60% healthy" value={60} max={100} color="var(--n-healthy)" />
                <HBarSwatch label="85% watch, h=6" value={85} max={100} color="var(--n-watch)" height={6} />
                <HBarSwatch label="100% critical" value={100} max={100} color="var(--n-critical)" />
                <HBarSwatch label="0%" value={0} max={100} />
              </div>
            </div>
          </div>
        </Section>

        <Section title="Animations">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 rounded-n-md border border-n-border-default bg-n-surface px-3 py-2 text-sm text-n-muted">
              <span className="n-pulse h-2 w-2 rounded-full bg-n-healthy" />
              n-pulse
            </div>
            <div className="n-shimmer-bg rounded-n-md border border-n-border-default bg-n-surface px-6 py-4 text-sm text-n-muted">
              n-shimmer-bg
            </div>
          </div>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-n-subtle">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">{children}</div>;
}

function SparklineSwatch({
  label,
  data,
  stroke,
  fill,
  dot,
}: {
  label: string;
  data: number[];
  stroke?: string;
  fill?: string;
  dot?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-n-mono text-[11px] text-n-muted">{label}</span>
      <Sparkline data={data} stroke={stroke} fill={fill} dot={dot} />
    </div>
  );
}

function HBarSwatch({
  label,
  value,
  max,
  color,
  height,
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
  height?: number;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="font-n-mono text-[11px] text-n-muted">{label}</span>
        <span className="font-n-mono text-[10.5px] tabular-nums text-n-faint">
          {value}/{max}
        </span>
      </div>
      <HBar value={value} max={max} color={color} height={height} />
    </div>
  );
}

function Swatch({ label, cls }: { label: string; cls: string }) {
  return (
    <div className="overflow-hidden rounded-n-md border border-n-border-default">
      <div className={`h-20 ${cls}`} />
      <div className="flex items-center justify-between bg-n-surface px-3 py-2 text-sm">
        <span className="text-n-fg">{label}</span>
        <span className="font-n-mono text-xs text-n-faint">{cls}</span>
      </div>
    </div>
  );
}
