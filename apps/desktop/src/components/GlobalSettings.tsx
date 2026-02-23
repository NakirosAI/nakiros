import { useEffect, useRef, useState } from 'react';
import type {
  AppPreferences,
  LanguagePreference,
  ResolvedLanguage,
  ResolvedTheme,
  ThemePreference,
} from '@tiqora/shared';
import { MESSAGES } from '../i18n';

interface Props {
  preferences: AppPreferences;
  resolvedTheme: ResolvedTheme;
  language: ResolvedLanguage;
  onChange(next: AppPreferences): Promise<void>;
  onClose(): void;
}

type Status = 'idle' | 'saving' | 'saved' | 'error';

export default function GlobalSettings({
  preferences,
  resolvedTheme,
  language,
  onChange,
  onClose,
}: Props) {
  const msg = MESSAGES[language];
  const [status, setStatus] = useState<Status>('idle');
  const timerRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  async function update(partial: Partial<AppPreferences>) {
    setStatus('saving');
    try {
      await onChange({ ...preferences, ...partial });
      setStatus('saved');
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setStatus('idle'), 1500);
    } catch {
      setStatus('error');
    }
  }

  const statusText =
    status === 'saved' ? msg.settings.saveSuccess
      : status === 'error' ? msg.settings.saveError
        : '';

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: 57,
        right: 12,
        width: 320,
        background: 'var(--bg-card)',
        border: '1px solid var(--line)',
        borderRadius: 2,
        boxShadow: 'var(--shadow-lg)',
        zIndex: 500,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13 }}>{msg.settings.title}</span>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 16,
            lineHeight: 1,
            padding: '2px 4px',
          }}
          aria-label="Fermer"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Appearance */}
        <section>
          <h3 style={sectionTitle}>{msg.settings.appearanceTitle}</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([
              ['system', msg.settings.themeSystem],
              ['light', msg.settings.themeLight],
              ['dark', msg.settings.themeDark],
            ] as [ThemePreference, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => void update({ theme: value })}
                style={chipStyle(preferences.theme === value)}
              >
                {label}
              </button>
            ))}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
            {msg.settings.resolvedTheme(resolvedTheme)}
          </p>
        </section>

        {/* Language */}
        <section>
          <h3 style={sectionTitle}>{msg.settings.languageTitle}</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([
              ['system', msg.settings.languageSystem],
              ['fr', msg.settings.languageFrench],
              ['en', msg.settings.languageEnglish],
            ] as [LanguagePreference, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => void update({ language: value })}
                style={chipStyle(preferences.language === value)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {statusText && (
          <p style={{ margin: 0, fontSize: 11, color: status === 'error' ? 'var(--danger)' : 'var(--text-muted)' }}>
            {statusText}
          </p>
        )}
      </div>
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '6px 10px',
    borderRadius: 2,
    border: `1px solid ${active ? 'var(--primary)' : 'var(--line)'}`,
    background: active ? 'var(--primary-soft)' : 'var(--bg-soft)',
    color: active ? 'var(--primary)' : 'var(--text)',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
  };
}
