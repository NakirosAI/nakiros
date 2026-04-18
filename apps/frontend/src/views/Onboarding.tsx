import { useEffect, useRef, useState } from 'react';
import { Check, Circle, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useIpcListener } from '../hooks/useIpcListener';

type Step = 1 | 2 | 3 | 4;

interface OnboardingProps {
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

  return <canvas ref={canvasRef} width={size} height={size} className="block" />;
}

export default function Onboarding({ onDone }: OnboardingProps) {
  const { t } = useTranslation('onboarding');
  const [step, setStep] = useState<Step>(1);
  const [editors, setEditors] = useState<DetectedEditor[]>([]);
  const [progress, setProgress] = useState<OnboardingProgressEvent[]>([]);
  const [installDone, setInstallDone] = useState(false);
  const [installError, setInstallError] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (step !== 2) return;
    void window.nakiros.onboardingDetectEditors().then(setEditors);
  }, [step]);

  useEffect(() => {
    if (step !== 3) return;
    setProgress([]);
    setInstallDone(false);
    setInstallError(false);

    void window.nakiros.onboardingInstall(editors).then((result: { success: boolean }) => {
      setInstallDone(true);
      if (!result.success) setInstallError(true);
    });
  }, [step, editors]);

  useIpcListener(
    window.nakiros.onOnboardingProgress,
    (item: OnboardingProgressEvent) => {
      setProgress((prev) => [...prev, item]);
      if (item.error) setInstallError(true);
      setTimeout(() => progressRef.current?.scrollTo(0, 99999), 50);
    },
    [step, installDone],
    step === 3 && !installDone,
  );

  return (
    <div className="relative flex h-screen flex-col items-center justify-center bg-[var(--bg)] p-8 text-[var(--text)]">
      {step === 1 && (
        <div className="flex w-full max-w-[480px] flex-col items-center gap-4 text-center">
          <AnimatedLogo size={200} />
          <h1 className="m-0 text-[28px] font-bold text-[var(--text)]">{t('welcomeTitle')}</h1>
          <p className="m-0 text-[15px] leading-[1.6] text-[var(--text-muted)]">{t('welcomeSub')}</p>
          <button
            className="mt-2 rounded-lg border-none bg-[var(--primary)] px-7 py-2.5 text-sm font-semibold text-white"
            onClick={() => setStep(2)}
          >
            {t('welcomeBtn')}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="flex w-full max-w-[480px] flex-col items-center gap-4 text-center">
          <h2 className="m-0 text-[22px] font-bold text-[var(--text)]">{t('detectTitle')}</h2>
          <p className="mb-8 mt-0 text-[15px] leading-[1.6] text-[var(--text-muted)]">{t('detectSub')}</p>
          <div className="mb-2 w-full rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] py-2">
            {editors.map((e) => (
              <div key={e.id} className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-2.5 last:border-b-0">
                {e.detected ? (
                  <Check size={16} color="var(--success)" strokeWidth={2.4} />
                ) : (
                  <Circle size={16} color="var(--text-muted)" strokeWidth={2.2} />
                )}
                <span className="flex-1 text-left text-sm font-medium">{e.label}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {e.detected ? t('editorDetected') : t('editorNotDetected')}
                </span>
              </div>
            ))}
          </div>
          <button
            className="mt-2 rounded-lg border-none bg-[var(--primary)] px-7 py-2.5 text-sm font-semibold text-white"
            onClick={() => setStep(3)}
          >
            {t('detectBtn')}
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="flex w-full max-w-[480px] flex-col items-center gap-4 text-center">
          <h2 className="m-0 text-[22px] font-bold text-[var(--text)]">{t('installTitle')}</h2>
          <div ref={progressRef} className="flex max-h-[260px] w-full flex-col gap-2 overflow-y-auto rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] p-4">
            {progress.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 text-left">
                {item.error ? (
                  <X size={16} color="var(--danger)" strokeWidth={2.4} />
                ) : (
                  <Check size={16} color="var(--success)" strokeWidth={2.4} />
                )}
                <span className={clsx('text-[13px]', item.error ? 'text-[var(--danger)]' : 'text-[var(--text)]')}>
                  {item.label}
                </span>
              </div>
            ))}
            {!installDone && (
              <div className="flex items-start gap-2.5 text-left">
                <Loader2 size={16} color="var(--text-muted)" strokeWidth={2.2} />
                <span className="text-[13px] text-[var(--text-muted)]">{t('installSpinner')}</span>
              </div>
            )}
          </div>
          {installDone && (
            <div className="mt-6 flex gap-3">
              {installError && (
                <button
                  className="mt-2 rounded-lg border border-[var(--line-strong)] bg-[var(--bg-card)] px-7 py-2.5 text-sm font-semibold text-[var(--text)]"
                  onClick={() => setStep(3)}
                >
                  {t('installRetry')}
                </button>
              )}
              <button
                className="mt-2 rounded-lg border-none bg-[var(--primary)] px-7 py-2.5 text-sm font-semibold text-white"
                onClick={() => setStep(4)}
              >
                {installError ? t('installContinueError') : t('installContinue')}
              </button>
            </div>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="flex w-full max-w-[480px] flex-col items-center gap-4 text-center">
          <AnimatedLogo size={160} />
          <h2 className="m-0 text-[22px] font-bold text-[var(--text)]">{t('doneTitle')}</h2>
          <p className="m-0 text-[15px] leading-[1.6] text-[var(--text-muted)]">{t('doneSub')}</p>
          <button
            className="mt-2 rounded-lg border-none bg-[var(--primary)] px-7 py-2.5 text-sm font-semibold text-white"
            onClick={onDone}
          >
            {t('doneBtn')}
          </button>
        </div>
      )}

      <div className="absolute bottom-8 flex gap-2">
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <div
            key={s}
            className={clsx(
              'h-2 w-2 rounded-full transition-all',
              s === step
                ? 'bg-[var(--primary)]'
                : s < step
                  ? 'bg-[var(--success)]'
                  : 'bg-[var(--line-strong)]',
            )}
          />
        ))}
      </div>
    </div>
  );
}
