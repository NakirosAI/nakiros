import { useState } from 'react';
import type { StoredRepo, StoredWorkspace, AgentProfile } from '@tiqora/shared';
import AddRepoForm, { PROFILES } from '../components/AddRepoForm';
import { PROFILE_LABELS } from '../utils/profiles';

interface Props {
  onCreated(workspace: StoredWorkspace): void;
  onCancel(): void;
}

type Step = 1 | 2 | 3;

export default function WorkspaceSetup({ onCreated, onCancel }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [pmTool, setPmTool] = useState<StoredWorkspace['pmTool'] | ''>('');
  const [projectKey, setProjectKey] = useState('');
  const [repos, setRepos] = useState<StoredRepo[]>([]);
  const [saving, setSaving] = useState(false);

  function handleRepoAdd(repo: StoredRepo) {
    setRepos((prev) => [...prev, repo]);
  }

  function handleRepoChange(
    idx: number,
    field: keyof StoredRepo,
    value: string,
  ) {
    setRepos((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    );
  }

  function handleRepoRemove(idx: number) {
    setRepos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCreate() {
    setSaving(true);
    const workspace: StoredWorkspace = {
      id: Date.now().toString(),
      name,
      repos,
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
    <div style={{ maxWidth: 600, margin: '60px auto', padding: '0 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>
          Nouveau workspace — Étape {step}/3
        </h1>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 14 }}>
          ✕ Annuler
        </button>
      </div>

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Nom du workspace</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: MonProjet"
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Outil PM (optionnel)</span>
            <select
              value={pmTool}
              onChange={(e) =>
                setPmTool(e.target.value as StoredWorkspace['pmTool'] | '')
              }
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

          <button
            onClick={() => setStep(2)}
            disabled={!name.trim()}
            style={btnPrimary(!name.trim())}
          >
            Suivant →
          </button>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AddRepoForm onAdd={handleRepoAdd} />

          {repos.map((repo, idx) => (
            <div
              key={repo.localPath}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: '#6b7280',
                    fontFamily: 'monospace',
                  }}
                >
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
                onChange={(e) =>
                  handleRepoChange(idx, 'profile', e.target.value as AgentProfile)
                }
                style={inputStyle}
              >
                {PROFILES.map((p) => (
                  <option key={p} value={p}>
                    {PROFILE_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStep(1)} style={btnSecondary}>
              ← Retour
            </button>
            <button onClick={() => setStep(3)} style={btnPrimary(false)}>
              Suivant →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: 16,
            }}
          >
            <p>
              <strong>Workspace :</strong> {name}
            </p>
            {pmTool && (
              <p>
                <strong>PM :</strong> {pmTool}
                {projectKey ? ` — ${projectKey}` : ''}
              </p>
            )}
            <p>
              <strong>Repos ({repos.length}) :</strong>
            </p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {repos.map((r) => (
                <li key={r.localPath}>
                  {r.name} — <em>{PROFILE_LABELS[r.profile]}</em>
                  {r.role ? ` — ${r.role}` : ''}
                </li>
              ))}
            </ul>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStep(2)} style={btnSecondary}>
              ← Retour
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              style={btnPrimary(saving)}
            >
              {saving ? 'Création…' : 'Créer le workspace'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
};

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    padding: '10px 20px',
    background: disabled ? '#93c5fd' : '#0070f3',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 14,
  };
}

const btnSecondary: React.CSSProperties = {
  padding: '10px 20px',
  background: '#f3f4f6',
  color: '#374151',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
};
