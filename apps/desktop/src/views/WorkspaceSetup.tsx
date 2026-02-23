import { useState } from 'react';
import type { StoredRepo, StoredWorkspace, AgentProfile } from '@tiqora/shared';
import AddRepoForm, { PROFILES } from '../components/AddRepoForm';
import { PROFILE_LABELS } from '../utils/profiles';

interface Props {
  onCreated(workspace: StoredWorkspace): void;
  onCancel(): void;
}

type Mode = 'solo' | 'connected';
type Step = 0 | 1 | 2 | 3 | 4;
type SoloRepoChoice = 'pending' | 'with' | 'without';

function derivePrefix(name: string): string {
  return name.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'PROJ';
}

export default function WorkspaceSetup({ onCreated, onCancel }: Props) {
  const [step, setStep] = useState<Step>(0);
  const [mode, setMode] = useState<Mode>('solo');
  const [soloRepoChoice, setSoloRepoChoice] = useState<SoloRepoChoice>('pending');
  const [name, setName] = useState('');
  const [ticketPrefix, setTicketPrefix] = useState('PROJ');
  const [pmTool, setPmTool] = useState<StoredWorkspace['pmTool'] | ''>('');
  const [projectKey, setProjectKey] = useState('');
  const [repos, setRepos] = useState<StoredRepo[]>([]);
  const [saving, setSaving] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    setTicketPrefix(derivePrefix(value));
  }

  function handleRepoAdd(repo: StoredRepo) {
    setRepos((prev) => [...prev, repo]);
  }

  function handleRepoChange(idx: number, field: keyof StoredRepo, value: string) {
    setRepos((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    );
  }

  function handleRepoRemove(idx: number) {
    setRepos((prev) => prev.filter((_, i) => i !== idx));
  }

  // Step navigation depends on mode
  function nextStep() {
    if (step === 0) { setStep(1); return; }
    if (step === 1) { setStep(2); return; }
    // solo: step 2 = repos (optional) → step 4 (résumé)
    // connected: step 2 = repos → step 3 (PM tool) → step 4 (résumé)
    if (step === 2) { setStep(mode === 'connected' ? 3 : 4); return; }
    if (step === 3) { setStep(4); return; }
  }

  function prevStep() {
    if (step === 4) { setStep(mode === 'connected' ? 3 : 2); return; }
    if (step === 3) { setStep(2); return; }
    if (step > 0) setStep((step - 1) as Step);
  }

  const totalSteps = mode === 'connected' ? 4 : 3;
  const displayStep = step === 0 ? 0 : step;
  const requiresRepoAtStep2 = mode === 'connected' || soloRepoChoice === 'with';
  const canGoNextFromRepos = !requiresRepoAtStep2 || repos.length > 0;

  async function handleCreate() {
    setSaving(true);
    const workspace: StoredWorkspace = {
      id: Date.now().toString(),
      name,
      repos,
      mode,
      ticketPrefix,
      ticketCounter: 0,
      pmTool: pmTool || undefined,
      projectKey: projectKey || undefined,
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
    };
    await window.tiqora.saveWorkspace(workspace);
    if (repos.length > 0) {
      await window.tiqora.syncWorkspace(workspace);
    }
    setSaving(false);
    onCreated(workspace);
  }

  return (
    <div style={{ maxWidth: 700, margin: '42px auto', padding: '0 24px' }}>
      <div
        style={{
          background: 'var(--bg-soft)',
          border: '1px solid var(--line)',
          borderRadius: 2,
          padding: '24px 22px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>
          {step === 0
            ? 'Nouveau workspace'
            : `Nouveau workspace — Étape ${displayStep}/${totalSteps}`}
        </h1>
        <button
          onClick={onCancel}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14 }}
        >
          ✕ Annuler
        </button>
      </div>
      {step > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              height: 8,
              borderRadius: 2,
              background: 'var(--bg-muted)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(displayStep / totalSteps) * 100}%`,
                height: '100%',
                background: 'var(--primary)',
                borderRadius: 2,
              }}
            />
          </div>
        </div>
      )}

      {/* Step 0 — Mode */}
      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
            Quel type de projet ?
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            {(['solo', 'connected'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  flex: 1,
                  padding: '20px 16px',
                  background: mode === m ? 'var(--primary-soft)' : 'var(--bg-soft)',
                  border: `2px solid ${mode === m ? 'var(--primary)' : 'var(--line)'}`,
                  borderRadius: 2,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>
                  {m === 'solo' ? '🚀' : '🔗'}
                </div>
                <strong style={{ fontSize: 15, display: 'block', marginBottom: 4 }}>
                  {m === 'solo' ? 'Solo' : 'Connecté'}
                </strong>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {m === 'solo'
                    ? 'Kanban local, pas de PM tool externe. Idéal side project.'
                    : 'Repos + PM tool externe. Idéal projet équipe.'}
                </span>
              </button>
            ))}
          </div>
          <button onClick={nextStep} style={btnPrimary(false)}>
            Suivant →
          </button>
        </div>
      )}

      {/* Step 1 — Nom + prefix */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Nom du workspace</span>
            <input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="ex: MonProjet"
              style={inputStyle}
              autoFocus
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Préfixe des tickets</span>
            <input
              value={ticketPrefix}
              onChange={(e) => setTicketPrefix(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="PROJ"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Les tickets seront nommés {ticketPrefix || 'PROJ'}-001, {ticketPrefix || 'PROJ'}-002…
            </span>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={prevStep} style={btnSecondary}>← Retour</button>
            <button onClick={nextStep} disabled={!name.trim()} style={btnPrimary(!name.trim())}>
              Suivant →
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Repos */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Solo : choix avant d'afficher le form */}
          {mode === 'solo' && soloRepoChoice === 'pending' && (
            <>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
                Ce projet est-il lié à un repo local ?
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                {([
                  { id: 'with', icon: '📁', label: 'Avec repo', desc: 'Lier un dossier local existant' },
                  { id: 'without', icon: '🗒️', label: 'Sans repo', desc: 'Projet purement Kanban, pas de code' },
                ] as { id: SoloRepoChoice; icon: string; label: string; desc: string }[]).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setSoloRepoChoice(opt.id);
                      if (opt.id === 'without') nextStep();
                    }}
                    style={{
                      flex: 1,
                      padding: '20px 16px',
                      background: 'var(--bg-soft)',
                      border: '2px solid var(--line)',
                      borderRadius: 2,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{opt.icon}</div>
                    <strong style={{ fontSize: 15, display: 'block', marginBottom: 4 }}>{opt.label}</strong>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{opt.desc}</span>
                  </button>
                ))}
              </div>
              <button onClick={prevStep} style={btnSecondary}>← Retour</button>
            </>
          )}

          {/* Form repos : mode connected ou solo avec choix 'with' */}
          {(mode === 'connected' || soloRepoChoice === 'with') && (
            <>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
                {mode === 'solo' ? 'Ajouter le repo du projet' : 'Ajouter les repos du projet'}
              </p>
              <AddRepoForm onAdd={handleRepoAdd} />

              {repos.map((repo, idx) => (
                <div
                  key={repo.localPath}
                  style={{ border: '1px solid var(--line)', borderRadius: 2, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {repo.localPath}
                    </span>
                    <button
                      onClick={() => handleRepoRemove(idx)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    value={repo.name}
                    onChange={(e) => handleRepoChange(idx, 'name', e.target.value)}
                    placeholder="Nom"
                    style={inputStyle}
                  />
                  <input
                    value={repo.role}
                    onChange={(e) => handleRepoChange(idx, 'role', e.target.value)}
                    placeholder="Rôle (ex: Frontend React app)"
                    style={inputStyle}
                  />
                  <select
                    value={repo.profile}
                    onChange={(e) => handleRepoChange(idx, 'profile', e.target.value as AgentProfile)}
                    style={inputStyle}
                  >
                    {PROFILES.map((p) => (
                      <option key={p} value={p}>{PROFILE_LABELS[p]}</option>
                    ))}
                  </select>
                </div>
              ))}

              <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={prevStep} style={btnSecondary}>← Retour</button>
                <button onClick={nextStep} disabled={!canGoNextFromRepos} style={btnPrimary(!canGoNextFromRepos)}>
                  Suivant →
                </button>
              </div>
              {!canGoNextFromRepos && (
                <span style={{ fontSize: 12, color: 'var(--warning)' }}>
                  Ajoute au moins un repo pour continuer.
                </span>
              )}
            </>
          )}
        </div>
      )}

      {/* Step 3 — PM tool (connected only) */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Outil PM</span>
            <select
              value={pmTool}
              onChange={(e) => setPmTool(e.target.value as StoredWorkspace['pmTool'] | '')}
              style={inputStyle}
            >
              <option value="">— aucun —</option>
              <option value="jira">Jira</option>
              <option value="github">GitHub Projects</option>
              <option value="gitlab">GitLab Issues</option>
              <option value="linear">Linear</option>
            </select>
          </label>
          {pmTool && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>Clé de projet (ex: PROJ)</span>
              <input
                value={projectKey}
                onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
                placeholder="PROJ"
                style={inputStyle}
              />
            </label>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={prevStep} style={btnSecondary}>← Retour</button>
            <button onClick={nextStep} style={btnPrimary(false)}>Suivant →</button>
          </div>
        </div>
      )}

      {/* Step 4 — Résumé */}
      {step === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--bg-muted)', border: '1px solid var(--line)', borderRadius: 2, padding: 16 }}>
            <p><strong>Workspace :</strong> {name}</p>
            <p><strong>Mode :</strong> {mode === 'solo' ? '🚀 Solo' : '🔗 Connecté'}</p>
            <p><strong>Préfixe tickets :</strong> <code>{ticketPrefix}</code></p>
            {pmTool && (
              <p><strong>PM :</strong> {pmTool}{projectKey ? ` — ${projectKey}` : ''}</p>
            )}
            <p><strong>Repos ({repos.length}) :</strong></p>
            {repos.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun repo ajouté</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {repos.map((r) => (
                  <li key={r.localPath}>
                    {r.name} — <em>{PROFILE_LABELS[r.profile]}</em>
                    {r.role ? ` — ${r.role}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={prevStep} style={btnSecondary}>← Retour</button>
            <button onClick={handleCreate} disabled={saving} style={btnPrimary(saving)}>
              {saving ? 'Création…' : 'Créer le workspace'}
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid var(--line)',
  borderRadius: 2,
  fontSize: 14,
  color: 'var(--text)',
  background: 'var(--bg-soft)',
  width: '100%',
  boxSizing: 'border-box',
};

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    padding: '10px 20px',
    background: disabled ? 'var(--line-strong)' : 'var(--primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 2,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 14,
    fontWeight: 700,
  };
}

const btnSecondary: React.CSSProperties = {
  padding: '10px 20px',
  background: 'var(--bg-muted)',
  color: 'var(--text)',
  border: '1px solid var(--line)',
  borderRadius: 2,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
};
