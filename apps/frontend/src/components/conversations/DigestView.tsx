import { useTranslation } from 'react-i18next';
import type {
  ConversationDigest,
  ConversationDigestFriction,
  ConversationDigestRule,
} from '@nakiros/shared';

interface Props {
  digest: ConversationDigest;
  /** Optional regenerate handler — when provided, surfaces a top-right button. */
  onRegenerate?(): void;
}

/**
 * Render the persisted output of the V1.1 friction classifier — phases,
 * frictions, extracted rules — formatted for human triage. Used by the
 * Frictions drawer tab and the post-completion view of the classify-convo
 * RunScreen.
 */
export function DigestView({ digest, onRegenerate }: Props) {
  const { t } = useTranslation('conversations');
  return (
    <div className="px-5 py-5 space-y-6">
      <div className="flex items-center justify-between">
        <div className="font-n-mono text-[11px] text-n-faint">
          {digest.model} · {new Date(digest.generatedAt).toLocaleString()} · ~{digest.inputTokens.toLocaleString()} in / ~{digest.outputTokens.toLocaleString()} out
        </div>
        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            className="rounded-n-sm border border-n-border-subtle bg-n-raised px-2.5 py-1 text-[11.5px] text-n-muted hover:text-n-fg"
          >
            {t('frictions.regenerate', { defaultValue: 'Re-classify' })}
          </button>
        )}
      </div>

      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-[0.4px] text-n-faint mb-1.5">
          {t('frictions.summary', { defaultValue: 'Summary' })}
        </h3>
        <p className="text-[13.5px] leading-relaxed text-n-fg">{digest.sessionSummary}</p>
      </section>

      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-[0.4px] text-n-faint mb-2">
          {t('frictions.phases', { defaultValue: 'Phases' })}
        </h3>
        <ul className="space-y-1.5">
          {digest.phases.map((p) => (
            <li
              key={p.id}
              className="flex items-start gap-3 rounded-n-sm border border-n-border-subtle bg-n-raised px-3 py-2"
            >
              <span className="font-n-mono text-[10.5px] text-n-faint mt-0.5 flex-shrink-0 w-14">
                T{p.fromTurn}–{p.toTurn}
              </span>
              <div className="min-w-0">
                <span className="inline-block rounded-full bg-n-canvas px-2 py-0.5 font-n-mono text-[10.5px] text-n-muted mr-2">
                  {p.label}
                </span>
                <span className="text-[12.5px] text-n-fg">{p.summary}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-[0.4px] text-n-faint mb-2">
          {t('frictions.frictions', { defaultValue: 'Frictions' })} ({digest.frictions.length})
        </h3>
        {digest.frictions.length === 0 ? (
          <p className="text-[12.5px] italic text-n-muted">
            {t('frictions.noFrictions', { defaultValue: 'No frictions detected — clean conversation.' })}
          </p>
        ) : (
          <ul className="space-y-2">
            {digest.frictions.map((f, i) => (
              <FrictionItem key={i} friction={f} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-[0.4px] text-n-faint mb-2">
          {t('frictions.rules', { defaultValue: 'Candidate rules' })} ({digest.extractedRules.length})
        </h3>
        {digest.extractedRules.length === 0 ? (
          <p className="text-[12.5px] italic text-n-muted">
            {t('frictions.noRules', { defaultValue: 'No rules extracted from this session.' })}
          </p>
        ) : (
          <ul className="space-y-2">
            {digest.extractedRules.map((r, i) => (
              <RuleItem key={i} rule={r} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FrictionItem({ friction }: { friction: ConversationDigestFriction }) {
  const tone = severityTone(friction.severity);
  return (
    <li className="rounded-n-md border border-n-border-subtle bg-n-raised px-3 py-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${tone.dot}`} />
        <span className={`font-n-mono text-[10.5px] uppercase tracking-[0.4px] ${tone.text}`}>
          {friction.severity}
        </span>
        <span className="font-n-mono text-[10.5px] text-n-faint">·</span>
        <span className="font-n-mono text-[10.5px] text-n-muted">{friction.kind}</span>
        <span className="font-n-mono text-[10.5px] text-n-faint">·</span>
        <span className="font-n-mono text-[10.5px] text-n-faint">
          T{friction.evidenceTurns.join(', T')}
        </span>
        <span className="ml-auto font-n-mono text-[10.5px] text-n-faint">
          {Math.round(friction.confidence * 100)}%
        </span>
      </div>
      <p className="text-[12.5px] text-n-fg leading-relaxed">{friction.whatHappened}</p>
      {friction.ruleCandidate && (
        <p className="mt-1.5 border-l-2 border-n-border-subtle pl-2 text-[12px] italic text-n-muted">
          → {friction.ruleCandidate}
        </p>
      )}
    </li>
  );
}

function RuleItem({ rule }: { rule: ConversationDigestRule }) {
  return (
    <li className="rounded-n-md border border-n-border-subtle bg-n-raised px-3 py-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="inline-block rounded-full bg-n-canvas px-2 py-0.5 font-n-mono text-[10.5px] text-n-muted">
          {rule.targetModule}
        </span>
        <span className="font-n-mono text-[10.5px] text-n-faint">·</span>
        <span className="font-n-mono text-[10.5px] text-n-muted">{rule.scope}</span>
        <span className="ml-auto font-n-mono text-[10.5px] text-n-faint">
          {Math.round(rule.confidence * 100)}%
        </span>
      </div>
      <p className="text-[13px] font-medium text-n-fg leading-relaxed">{rule.rule}</p>
      <p className="mt-1 text-[12px] text-n-muted">{rule.why}</p>
    </li>
  );
}

function severityTone(severity: ConversationDigestFriction['severity']) {
  if (severity === 'high') return { dot: 'bg-n-critical', text: 'text-n-critical' };
  if (severity === 'med') return { dot: 'bg-n-watch', text: 'text-n-watch' };
  return { dot: 'bg-n-muted', text: 'text-n-muted' };
}
