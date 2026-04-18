import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X, AlertTriangle } from 'lucide-react';
import type { Project, ScanProgress } from '@nakiros/shared';

interface ScanViewProps {
  onComplete(projects: Project[]): void;
}

export default function ScanView({ onComplete }: ScanViewProps) {
  const { t } = useTranslation('scan');
  const [scanning, setScanning] = useState(true);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    const unsubscribe = window.nakiros.onScanProgress((p) => {
      setProgress(p);
    });

    window.nakiros.scanProjects().then((result) => {
      setProjects(result);
      setScanning(false);
    });

    return unsubscribe;
  }, []);

  async function handleDismiss(id: string) {
    await window.nakiros.dismissProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  function handleContinue() {
    onComplete(projects);
  }

  const inactiveThresholdDays = 30;

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-8 bg-[var(--bg-base)] p-8">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            {t('title', 'Nakiros analyse vos outils IA...')}
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {t('subtitle', 'Détection des projets Claude Code')}
          </p>
        </div>

        {/* Progress */}
        {scanning && (
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {progress
                ? `${progress.current}/${progress.total} — ${progress.projectName ?? '...'}`
                : t('scanning', 'Scan en cours...')}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-muted)]">
              <div
                className="h-full rounded-full bg-[var(--primary)] transition-all duration-300"
                style={{
                  width: progress ? `${(progress.current / Math.max(progress.total, 1)) * 100}%` : '0%',
                }}
              />
            </div>
          </div>
        )}

        {/* Project list */}
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {projects.map((project) => {
            const isInactive = project.lastActivityAt
              ? (Date.now() - new Date(project.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24) > inactiveThresholdDays
              : false;

            return (
              <div
                key={project.id}
                className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-[var(--text-primary)]">
                      {project.name}
                    </span>
                    <span className="rounded-full bg-[var(--bg-muted)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                      {project.provider}
                    </span>
                    {isInactive && (
                      <span className="flex items-center gap-1 text-xs text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        {t('inactive', 'Inactif')}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex gap-3 text-xs text-[var(--text-muted)]">
                    <span>{project.sessionCount} sessions</span>
                    <span>{project.skillCount} skills</span>
                    {project.lastActivityAt && (
                      <span>
                        {new Date(project.lastActivityAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDismiss(project.id)}
                  className="ml-3 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-400"
                  title={t('dismiss', 'Ignorer ce projet')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {!scanning && (
          <div className="mt-6 flex items-center justify-between">
            <span className="text-sm text-[var(--text-muted)]">
              {projects.length} {t('projectsFound', 'projets détectés')}
            </span>
            <button
              onClick={handleContinue}
              className="rounded-lg bg-[var(--primary)] px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-hover)]"
            >
              {t('continue', 'Continuer')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
