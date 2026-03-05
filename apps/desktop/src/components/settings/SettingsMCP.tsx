import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { WorkspaceMCP } from '@nakiros/shared';
import { uid } from '../../utils/ids';
import { Button, Card, Input, Textarea } from '../ui';
import type { SettingsBaseProps } from './types';

export function SettingsMCP({ workspace, onUpdate }: SettingsBaseProps) {
  const { t } = useTranslation('settings');
  const mcps: WorkspaceMCP[] = workspace.mcps ?? [];
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleToggle(id: string) {
    await onUpdate({ ...workspace, mcps: mcps.map((mcp) => (mcp.id === id ? { ...mcp, enabled: !mcp.enabled } : mcp)) });
  }

  async function handleDelete(id: string) {
    await onUpdate({ ...workspace, mcps: mcps.filter((mcp) => mcp.id !== id) });
    if (editingId === id) setEditingId(null);
  }

  async function handleSave(mcp: WorkspaceMCP) {
    const exists = mcps.some((item) => item.id === mcp.id);
    await onUpdate({ ...workspace, mcps: exists ? mcps.map((item) => (item.id === mcp.id ? mcp : item)) : [...mcps, mcp] });
    setEditingId(null);
  }

  function handleAdd() {
    const newId = uid();
    const blank: WorkspaceMCP = { id: newId, name: '', command: '', args: [], env: {}, enabled: true };
    void onUpdate({ ...workspace, mcps: [...mcps, blank] });
    setEditingId(newId);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="mb-1 mt-0 text-xl font-bold">{t('mcpTitle')}</h2>
        <p className="m-0 text-[13px] text-[var(--text-muted)]">{t('mcpSubtitle')}</p>
      </div>
      <Card padding="md" className="rounded-[10px] bg-[var(--bg-soft)]">
        <div className="mb-3 flex justify-end">
          <Button type="button" variant="secondary" size="sm" onClick={handleAdd}>
            {t('mcpAdd')}
          </Button>
        </div>
        {mcps.length === 0 && <p className="m-0 text-xs text-[var(--text-muted)]">{t('mcpEmpty')}</p>}
        {mcps.map((mcp) =>
          editingId === mcp.id ? (
            <MCPForm
              key={mcp.id}
              mcp={mcp}
              onSave={handleSave}
              onCancel={() => {
                if (!mcp.name && !mcp.command) void onUpdate({ ...workspace, mcps: mcps.filter((item) => item.id !== mcp.id) });
                setEditingId(null);
              }}
            />
          ) : (
            <MCPRow
              key={mcp.id}
              mcp={mcp}
              onToggle={() => void handleToggle(mcp.id)}
              onEdit={() => setEditingId(mcp.id)}
              onDelete={() => void handleDelete(mcp.id)}
            />
          ),
        )}
      </Card>
    </div>
  );
}

function MCPRow({ mcp, onToggle, onEdit, onDelete }: { mcp: WorkspaceMCP; onToggle(): void; onEdit(): void; onDelete(): void }) {
  const { t } = useTranslation('settings');
  return (
    <Card padding="sm" className="mb-2 flex items-start gap-2.5 rounded-[10px] bg-[var(--bg-card)]">
      <button
        type="button"
        onClick={onToggle}
        className={clsx(
          'mt-0.5 h-3 w-3 shrink-0 rounded-full border-0 p-0',
          mcp.enabled ? 'bg-[var(--success)]' : 'bg-[var(--line-strong)]',
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold">
          {mcp.name || <em className="text-[var(--text-muted)]">{t('mcpUnnamed')}</em>}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">
          {mcp.command}
          {mcp.args.length > 0 ? ` ${mcp.args.join(' ')}` : ''}
        </div>
        {Object.keys(mcp.env).length > 0 && (
          <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            {t('mcpEnvCount', { count: Object.keys(mcp.env).length })}
          </div>
        )}
      </div>
      <div className="flex gap-1">
        <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5" onClick={onEdit} title={t('mcpEdit')}>
          ✏️
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[var(--danger)]" onClick={onDelete} title={t('mcpDelete')}>
          ✕
        </Button>
      </div>
    </Card>
  );
}

function MCPForm({ mcp: initial, onSave, onCancel }: { mcp: WorkspaceMCP; onSave(mcp: WorkspaceMCP): Promise<void>; onCancel(): void }) {
  const { t } = useTranslation('settings');
  const [name, setName] = useState(initial.name);
  const [command, setCommand] = useState(initial.command);
  const [argsText, setArgsText] = useState(initial.args.join('\n'));
  const [envPairs, setEnvPairs] = useState<{ key: string; value: string }[]>(
    Object.entries(initial.env).map(([key, value]) => ({ key, value })),
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const env: Record<string, string> = {};
    for (const { key, value } of envPairs) {
      if (key.trim()) env[key.trim()] = value;
    }
    await onSave({
      ...initial,
      name,
      command,
      args: argsText.split('\n').map((arg) => arg.trim()).filter(Boolean),
      env,
    });
    setSaving(false);
  }

  return (
    <Card
      padding="md"
      className="mb-2 flex flex-col gap-2.5 rounded-[10px] border-[var(--primary)] bg-[var(--bg-muted)]"
    >
      <div className="flex gap-2.5">
        <Input
          label={t('mcpName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="github"
          containerClassName="flex-1"
          className="rounded-[10px] border-[var(--line)] bg-[var(--bg-card)] px-2.5 py-2 text-[13px]"
        />
        <Input
          label={t('mcpCommand')}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="npx"
          containerClassName="flex-[2]"
          className="rounded-[10px] border-[var(--line)] bg-[var(--bg-card)] px-2.5 py-2 text-[13px]"
        />
      </div>

      <Textarea
        label={t('mcpArgs')}
        value={argsText}
        onChange={(e) => setArgsText(e.target.value)}
        placeholder={'-y\n@modelcontextprotocol/server-github'}
        rows={3}
        className="rounded-[10px] border-[var(--line)] bg-[var(--bg-card)] px-2.5 py-2 font-mono text-xs"
      />

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">{t('mcpEnvVars')}</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => setEnvPairs((pairs) => [...pairs, { key: '', value: '' }])}>
            {t('mcpAddEnvVar')}
          </Button>
        </div>
        {envPairs.map((pair, index) => (
          <div key={index} className="mb-1.5 flex gap-1.5">
            <input
              value={pair.key}
              onChange={(e) => setEnvPairs((pairs) => pairs.map((item, idx) => idx === index ? { ...item, key: e.target.value } : item))}
              placeholder={t('mcpEnvKey')}
              className="ui-form-control flex-1 rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] px-2.5 py-2 font-mono text-xs text-[var(--text)]"
            />
            <input
              value={pair.value}
              onChange={(e) => setEnvPairs((pairs) => pairs.map((item, idx) => idx === index ? { ...item, value: e.target.value } : item))}
              placeholder={t('mcpEnvValue')}
              className="ui-form-control flex-[2] rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] px-2.5 py-2 font-mono text-xs text-[var(--text)]"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 self-center px-1.5 text-[var(--danger)]"
              onClick={() => setEnvPairs((pairs) => pairs.filter((_, idx) => idx !== index))}
            >
              ✕
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !name.trim() || !command.trim()}
          loading={saving}
        >
          {t('mcpSave')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('mcpCancel')}
        </Button>
      </div>
    </Card>
  );
}

