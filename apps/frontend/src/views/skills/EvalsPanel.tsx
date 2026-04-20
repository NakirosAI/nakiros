import { useTranslation } from 'react-i18next';
import { FlaskConical } from 'lucide-react';
import type { Skill, SkillScope } from '@nakiros/shared';
import { EvalMatrix } from '../../components/eval-matrix';
import { Badge } from './components';

interface Props {
  skill: Skill;
  scope: SkillScope;
  projectId?: string;
  marketplaceName?: string;
  pluginName?: string;
}

/**
 * Shared evals tab body for every scoped skill view. Renders the eval
 * definitions list + the evolution matrix. Reads from the `skill-evals`
 * i18n namespace so callers don't need to thread `t` through.
 *
 * The historical iteration accordion used to live here behind a `{false &&
 * ...}` guard. It was deleted when EvalMatrix replaced it — see git history
 * pre-2026-04-20 to revive if ever needed.
 */
export function SkillEvalsPanel({ skill, scope, projectId, marketplaceName, pluginName }: Props) {
  const { t } = useTranslation('skill-evals');

  if (!skill.evals || skill.evals.definitions.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
        <FlaskConical size={32} />
        <p className="text-sm">{t('noEvals')}</p>
      </div>
    );
  }

  const { definitions } = skill.evals;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {t('definitionsHeading', { count: definitions.length })}
        </h3>
        <div className="flex flex-col gap-1.5">
          {definitions.map((def) => (
            <div key={def.id} className="rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--text-primary)]">{def.name}</span>
                <Badge label={t('assertionsBadge', { count: def.assertions.length })} />
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{def.prompt}</p>
            </div>
          ))}
        </div>
      </div>

      <EvalMatrix
        request={{ scope, projectId, marketplaceName, pluginName, skillName: skill.name }}
      />
    </div>
  );
}
