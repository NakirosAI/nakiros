import { useEffect, useRef, useState } from 'react';
import { Check, Circle, Loader2, X } from 'lucide-react';
import type { ResolvedLanguage } from '@nakiros/shared';
import { MESSAGES } from '../i18n';

type Step = 1 | 2 | 3 | 4 | 5;

interface OnboardingProps {
  language: ResolvedLanguage;
  onDone: () => void;
}

function AnimatedLogo({ size = 160 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2;
    const cy = size / 2;
    // Scale so the furthest node (~180px in design space) fits with padding
    const s = size / 500;

    const nodes = [
      { x: cx, y: cy, r: 14 * s, isCenter: true },
      { x: cx - 140 * s, y: cy - 100 * s, r: 9 * s, isCenter: false },
      { x: cx + 140 * s, y: cy - 80 * s, r: 9 * s, isCenter: false },
      { x: cx - 120 * s, y: cy + 110 * s, r: 9 * s, isCenter: false },
      { x: cx + 150 * s, y: cy + 100 * s, r: 9 * s, isCenter: false },
    ];

    const workerCount = nodes.length - 1;
    const cycleDuration = 2.6;
    const travelRatio = 0.62;
    let time = 0;
    let animId: number;

    const animate = () => {
      ctx.clearRect(0, 0, size, size);
      time += 0.02;

      const now = performance.now() / 1000;
      const cyclePos = now / cycleDuration;
      const cycleStep = Math.floor(cyclePos);
      const cycleProgress = cyclePos - cycleStep;
      const activeIdx = (cycleStep % workerCount) + 1;
      const particleProgress = Math.min(cycleProgress / travelRatio, 1);
      const pulseStrength = Math.min(
        Math.max((cycleProgress - travelRatio * 0.75) / (1 - travelRatio * 0.75), 0),
        1,
      );

      // Lines
      nodes.forEach((node, i) => {
        if (node.isCenter) return;
        const isActive = i === activeIdx;
        ctx.strokeStyle = isActive ? 'rgba(46, 207, 207, 0.72)' : 'rgba(13, 158, 158, 0.28)';
        ctx.lineWidth = isActive ? 2.4 : 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(node.x, node.y);
        ctx.stroke();

        if (isActive && cycleProgress <= travelRatio) {
          const px = cx + (node.x - cx) * particleProgress;
          const py = cy + (node.y - cy) * particleProgress;
          ctx.fillStyle = '#2ECFCF';
          ctx.beginPath();
          ctx.arc(px, py, Math.max(3.2 * s, 1.5), 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Nodes
      nodes.forEach((node, i) => {
        ctx.fillStyle = node.isCenter ? '#2ECFCF' : '#0D9E9E';
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        ctx.fill();

        if (!node.isCenter && i === activeIdx) {
          const pulseWave = (Math.sin(now * 8) + 1) / 2;
          ctx.strokeStyle = `rgba(46, 207, 207, ${0.2 + pulseStrength * 0.65})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.r + (4 + pulseWave * 4) * s, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (node.isCenter) {
          const pr = node.r + (4 + Math.sin(time * 2) * 2) * s;
          ctx.strokeStyle = `rgba(46, 207, 207, ${0.5 - Math.sin(time * 2) * 0.2})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(node.x, node.y, pr, 0, Math.PI * 2);
          ctx.stroke();
        }
      });

      animId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animId);
  }, [size]);

  return <canvas ref={canvasRef} style={{ width: size, height: size }} />;
}

export default function Onboarding({ language, onDone }: OnboardingProps) {
  const t = MESSAGES[language].onboarding;
  const [step, setStep] = useState<Step>(1);
  const [editors, setEditors] = useState<DetectedEditor[]>([]);
  const [progress, setProgress] = useState<OnboardingProgressEvent[]>([]);
  const [installDone, setInstallDone] = useState(false);
  const [installError, setInstallError] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [updating, setUpdating] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  // Détection des éditeurs au passage à l'étape 2
  useEffect(() => {
    if (step !== 2) return;
    void window.nakiros.onboardingDetectEditors().then(setEditors);
  }, [step]);

  // Installation au passage à l'étape 3
  useEffect(() => {
    if (step !== 3) return;
    setProgress([]);
    setInstallDone(false);
    setInstallError(false);

    const unsub = window.nakiros.onOnboardingProgress((item: OnboardingProgressEvent) => {
      setProgress((prev) => [...prev, item]);
      if (item.error) setInstallError(true);
      setTimeout(() => progressRef.current?.scrollTo(0, 99999), 50);
    });

    void window.nakiros.onboardingInstall(editors).then((result: { success: boolean }) => {
      setInstallDone(true);
      if (!result.success) setInstallError(true);
      unsub();
    });

    return unsub;
  }, [step]);

  // Check de mise à jour à l'étape 4
  useEffect(() => {
    if (step !== 4) return;
    void window.nakiros.checkForUpdates().then((result) => {
      setUpdateResult(result);
      if (!result.hasUpdate) setTimeout(() => setStep(5), 1200);
    });
  }, [step]);

  const handleApplyUpdate = async () => {
    if (!updateResult) return;
    setUpdating(true);
    await window.nakiros.applyUpdate(updateResult.changedFiles);
    setUpdating(false);
    setStep(5);
  };

  return (
    <div style={styles.root}>
      {/* Étape 1 — Welcome */}
      {step === 1 && (
        <div style={styles.center}>
          <AnimatedLogo size={200} />
          <h1 style={styles.h1}>{t.welcomeTitle}</h1>
          <p style={styles.sub}>{t.welcomeSub}</p>
          <button style={styles.btnPrimary} onClick={() => setStep(2)}>
            {t.welcomeBtn}
          </button>
        </div>
      )}

      {/* Étape 2 — Detect Editors */}
      {step === 2 && (
        <div style={styles.center}>
          <h2 style={styles.h2}>{t.detectTitle}</h2>
          <p style={{ ...styles.sub, marginBottom: 32 }}>{t.detectSub}</p>
          <div style={styles.editorList}>
            {editors.map((e) => (
              <div key={e.id} style={styles.editorRow}>
                {e.detected ? (
                  <Check size={16} color="var(--success)" strokeWidth={2.4} />
                ) : (
                  <Circle size={16} color="var(--text-muted)" strokeWidth={2.2} />
                )}
                <span style={styles.editorLabel}>{e.label}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {e.detected ? t.editorDetected : t.editorNotDetected}
                </span>
              </div>
            ))}
          </div>
          <button style={styles.btnPrimary} onClick={() => setStep(3)}>
            {t.detectBtn}
          </button>
        </div>
      )}

      {/* Étape 3 — Install */}
      {step === 3 && (
        <div style={styles.center}>
          <h2 style={styles.h2}>{t.installTitle}</h2>
          <div ref={progressRef} style={styles.progressBox}>
            {progress.map((item, i) => (
              <div key={i} style={styles.progressRow}>
                {item.error ? (
                  <X size={16} color="var(--danger)" strokeWidth={2.4} />
                ) : (
                  <Check size={16} color="var(--success)" strokeWidth={2.4} />
                )}
                <span style={{ color: item.error ? 'var(--danger)' : 'var(--text)', fontSize: 13 }}>
                  {item.label}
                </span>
              </div>
            ))}
            {!installDone && (
              <div style={styles.progressRow}>
                <Loader2 size={16} color="var(--text-muted)" strokeWidth={2.2} />
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t.installSpinner}</span>
              </div>
            )}
          </div>
          {installDone && (
            <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
              {installError && (
                <button style={styles.btnSecondary} onClick={() => setStep(3)}>
                  {t.installRetry}
                </button>
              )}
              <button style={styles.btnPrimary} onClick={() => setStep(4)}>
                {installError ? t.installContinueError : t.installContinue}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Étape 4 — Update Check */}
      {step === 4 && (
        <div style={styles.center}>
          <h2 style={styles.h2}>{t.updateTitle}</h2>
          {!updateResult && (
            <p style={styles.sub}>{t.updateChecking}</p>
          )}
          {updateResult && !updateResult.hasUpdate && (
            <p style={{ ...styles.sub, ...styles.statusLine }}>
              <Check size={16} color="var(--success)" strokeWidth={2.4} />
              {t.updateUpToDate}
            </p>
          )}
          {updateResult?.hasUpdate && (
            <>
              <p style={styles.sub}>{t.updateAvailable(updateResult.latestVersion)}</p>
              {updateResult.changelog && (
                <p style={{ ...styles.sub, fontSize: 13, color: 'var(--text-muted)' }}>
                  {updateResult.changelog}
                </p>
              )}
              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button style={styles.btnSecondary} onClick={() => setStep(5)}>
                  {t.updateSkip}
                </button>
                <button style={styles.btnPrimary} disabled={updating} onClick={handleApplyUpdate}>
                  {updating ? t.updating : t.updateNow}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Étape 5 — Done */}
      {step === 5 && (
        <div style={styles.center}>
          <AnimatedLogo size={160} />
          <h2 style={styles.h2}>{t.doneTitle}</h2>
          <p style={styles.sub}>{t.doneSub}</p>
          <button style={styles.btnPrimary} onClick={onDone}>
            {t.doneBtn}
          </button>
        </div>
      )}

      {/* Indicateurs d'étapes */}
      <div style={styles.steps}>
        {([1, 2, 3, 4, 5] as Step[]).map((s) => (
          <div
            key={s}
            style={{
              ...styles.stepDot,
              background: s === step ? 'var(--primary)' : s < step ? 'var(--success)' : 'var(--line-strong)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontFamily: 'inherit',
    padding: 32,
    position: 'relative',
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    maxWidth: 480,
    width: '100%',
    textAlign: 'center',
  },
  h1: { fontSize: 28, fontWeight: 700, margin: 0, color: 'var(--text)' },
  h2: { fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' },
  sub: { fontSize: 15, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 },
  statusLine: { display: 'inline-flex', alignItems: 'center', gap: 8 },
  btnPrimary: {
    marginTop: 8,
    padding: '10px 28px',
    background: 'var(--primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnSecondary: {
    marginTop: 8,
    padding: '10px 28px',
    background: 'var(--bg-card)',
    color: 'var(--text)',
    border: '1px solid var(--line-strong)',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  editorList: {
    width: '100%',
    background: 'var(--bg-card)',
    border: '1px solid var(--line)',
    borderRadius: 10,
    padding: '8px 0',
    marginBottom: 8,
  },
  editorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 20px',
    borderBottom: '1px solid var(--line)',
  },
  editorLabel: { flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 500 },
  progressBox: {
    width: '100%',
    maxHeight: 260,
    overflowY: 'auto',
    background: 'var(--bg-card)',
    border: '1px solid var(--line)',
    borderRadius: 10,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  progressRow: { display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left' },
  steps: {
    position: 'absolute',
    bottom: 32,
    display: 'flex',
    gap: 8,
  },
  stepDot: { width: 8, height: 8, borderRadius: '50%', transition: 'background 0.3s' },
};
