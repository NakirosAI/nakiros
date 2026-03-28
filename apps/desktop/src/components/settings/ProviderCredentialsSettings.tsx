import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Link2, Pencil, Plus, ShieldOff, Trash2, Unplug } from 'lucide-react';
import clsx from 'clsx';
import type {
  CreateProviderCredentialInput,
  ProviderCredentialProvider,
  ProviderCredentialSummary,
  SetWorkspaceProviderDefaultInput,
  StoredWorkspace,
  UpdateProviderCredentialInput,
  WorkspaceProviderBinding,
  WorkspaceProviderCredentialsPayload,
} from '@nakiros/shared';
import { Badge, Button, Card, EmptyState, Input, Modal, Select } from '../ui';

const PROVIDERS: ProviderCredentialProvider[] = ['jira', 'github', 'gitlab'];

interface CredentialEditorState {
  provider: ProviderCredentialProvider;
  label: string;
  secret: string;
  baseUrl: string;
  email: string;
}

interface CredentialEditorModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  submitting: boolean;
  credential?: ProviderCredentialSummary | null;
  presetProvider?: ProviderCredentialProvider;
  onClose(): void;
  onSubmit(
    provider: ProviderCredentialProvider,
    input: CreateProviderCredentialInput | UpdateProviderCredentialInput,
  ): Promise<void>;
}

interface GlobalSettingsProviderCredentialsSectionProps {
  isActive?: boolean;
}

interface WorkspaceProviderCredentialsSectionProps {
  workspace: StoredWorkspace;
}

interface DeleteModalState {
  credential: ProviderCredentialSummary;
  impactedWorkspaces: Array<{ workspaceId: string; workspaceName: string; isDefault: boolean }>;
}

function getProviderLabel(provider: ProviderCredentialProvider): string {
  if (provider === 'jira') return 'Jira';
  if (provider === 'github') return 'GitHub';
  return 'GitLab';
}

function toEditorState(
  credential?: ProviderCredentialSummary | null,
  presetProvider?: ProviderCredentialProvider,
): CredentialEditorState {
  const provider = credential?.provider ?? presetProvider ?? 'jira';
  const metadata = credential?.metadata;
  return {
    provider,
    label: credential?.label ?? '',
    secret: '',
    baseUrl: 'baseUrl' in (metadata ?? {}) && typeof metadata.baseUrl === 'string' ? metadata.baseUrl : '',
    email: 'email' in (metadata ?? {}) && typeof metadata.email === 'string' ? metadata.email : '',
  };
}

function buildCreateInput(state: CredentialEditorState): CreateProviderCredentialInput {
  if (state.provider === 'jira') {
    return {
      provider: state.provider,
      label: state.label.trim(),
      secret: state.secret,
      metadata: {
        baseUrl: state.baseUrl.trim(),
        ...(state.email.trim() ? { email: state.email.trim() } : {}),
      },
    };
  }

  if (state.provider === 'github') {
    return {
      provider: state.provider,
      label: state.label.trim(),
      secret: state.secret,
      metadata: {
        ...(state.baseUrl.trim() ? { baseUrl: state.baseUrl.trim() } : {}),
      },
    };
  }

  return {
    provider: state.provider,
    label: state.label.trim(),
    secret: state.secret,
    metadata: {
      baseUrl: state.baseUrl.trim(),
    },
  };
}

function buildUpdateInput(state: CredentialEditorState): UpdateProviderCredentialInput {
  const input: UpdateProviderCredentialInput = {
    label: state.label.trim(),
  };

  if (state.secret.trim()) {
    input.secret = state.secret;
  }

  if (state.provider === 'jira') {
    input.metadata = {
      baseUrl: state.baseUrl.trim(),
      ...(state.email.trim() ? { email: state.email.trim() } : {}),
    };
    return input;
  }

  if (state.provider === 'github') {
    input.metadata = {
      ...(state.baseUrl.trim() ? { baseUrl: state.baseUrl.trim() } : {}),
    };
    return input;
  }

  input.metadata = {
    baseUrl: state.baseUrl.trim(),
  };
  return input;
}

function describeCredentialMetadata(
  credential: ProviderCredentialSummary,
  t: ReturnType<typeof useTranslation<'settings'>>['t'],
): string[] {
  const details: string[] = [];
  if ('baseUrl' in credential.metadata && credential.metadata.baseUrl) {
    details.push(`${t('providerCredentialBaseUrlLabel')}: ${credential.metadata.baseUrl}`);
  }
  if ('email' in credential.metadata && credential.metadata.email) {
    details.push(`${t('providerCredentialEmailLabel')}: ${credential.metadata.email}`);
  }
  return details;
}

function CredentialEditorModal({
  isOpen,
  mode,
  submitting,
  credential,
  presetProvider,
  onClose,
  onSubmit,
}: CredentialEditorModalProps) {
  const { t } = useTranslation('settings');
  const [state, setState] = useState<CredentialEditorState>(() => toEditorState(credential, presetProvider));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setState(toEditorState(credential, presetProvider));
    setError(null);
  }, [credential, isOpen, presetProvider]);

  async function handleSubmit() {
    if (!state.label.trim()) {
      setError(t('providerCredentialValidationLabel'));
      return;
    }
    if (mode === 'create' && !state.secret.trim()) {
      setError(t('providerCredentialValidationSecret'));
      return;
    }
    if (state.provider !== 'github' && !state.baseUrl.trim()) {
      setError(t('providerCredentialValidationBaseUrl'));
      return;
    }

    setError(null);
    try {
      await onSubmit(
        state.provider,
        mode === 'create' ? buildCreateInput(state) : buildUpdateInput(state),
      );
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : t(mode === 'create' ? 'providerCredentialCreateError' : 'providerCredentialUpdateError'),
      );
    }
  }

  const providerLocked = mode === 'edit' || presetProvider !== undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t(mode === 'create' ? 'providerCredentialCreateTitle' : 'providerCredentialEditTitle')}
      size="md"
    >
      <div className="flex flex-col gap-4">
        <Select
          value={state.provider}
          onChange={(event) => setState((current) => ({ ...current, provider: event.target.value as ProviderCredentialProvider }))}
          label={t('providerCredentialProviderLabel')}
          disabled={providerLocked || submitting}
          options={PROVIDERS.map((provider) => ({
            value: provider,
            label: getProviderLabel(provider),
          }))}
        />

        <Input
          value={state.label}
          onChange={(event) => setState((current) => ({ ...current, label: event.target.value }))}
          label={t('providerCredentialNameLabel')}
          placeholder={t('providerCredentialNamePlaceholder')}
          disabled={submitting}
        />

        {(state.provider === 'jira' || state.provider === 'gitlab' || state.provider === 'github') && (
          <Input
            value={state.baseUrl}
            onChange={(event) => setState((current) => ({ ...current, baseUrl: event.target.value }))}
            label={t('providerCredentialBaseUrlLabel')}
            placeholder={t('providerCredentialBaseUrlPlaceholder')}
            hint={state.provider === 'github' ? t('providerCredentialBaseUrlHintGithub') : undefined}
            disabled={submitting}
          />
        )}

        {state.provider === 'jira' && (
          <Input
            value={state.email}
            onChange={(event) => setState((current) => ({ ...current, email: event.target.value }))}
            label={t('providerCredentialEmailLabel')}
            placeholder={t('providerCredentialEmailPlaceholder')}
            hint={t('providerCredentialEmailHint')}
            disabled={submitting}
          />
        )}

        <Input
          type="password"
          value={state.secret}
          onChange={(event) => setState((current) => ({ ...current, secret: event.target.value }))}
          label={t('providerCredentialSecretLabel')}
          placeholder={t(
            mode === 'create'
              ? 'providerCredentialSecretPlaceholder'
              : 'providerCredentialSecretReplacePlaceholder',
          )}
          hint={t(
            mode === 'create'
              ? 'providerCredentialSecretCreateHint'
              : 'providerCredentialSecretEditHint',
          )}
          disabled={submitting}
        />

        {error ? <p className="m-0 text-xs text-[var(--danger)]">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            {t('providerCredentialCancel')}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting
              ? t(mode === 'create' ? 'providerCredentialCreating' : 'providerCredentialSaving')
              : t(mode === 'create' ? 'providerCredentialCreateAction' : 'providerCredentialSaveAction')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ProviderCredentialCard({
  credential,
  onEdit,
  onRevoke,
  onDelete,
}: {
  credential: ProviderCredentialSummary;
  onEdit(): void;
  onRevoke(): void;
  onDelete(): void;
}) {
  const { t } = useTranslation('settings');
  const metadataLines = describeCredentialMetadata(credential, t);

  return (
    <Card className="overflow-hidden rounded-[20px] border-[var(--line)] bg-[var(--bg-card)] shadow-none">
      <div className="flex flex-col">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="m-0 text-base font-semibold text-[var(--text)]">{credential.label}</h3>
              <Badge variant="muted" className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]">
                {getProviderLabel(credential.provider)}
              </Badge>
              {credential.isRevoked ? (
                <Badge variant="danger" className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]">
                  {t('providerCredentialRevoked')}
                </Badge>
              ) : null}
              {credential.usage.length === 0 ? (
                <Badge variant="muted" className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]">
                  {t('providerCredentialUnused')}
                </Badge>
              ) : null}
            </div>

            <p className="mb-0 mt-2 text-sm leading-6 text-[var(--text-muted)]">
              {metadataLines.length > 0
                ? metadataLines.join(' • ')
                : getProviderLabel(credential.provider)}
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onEdit} className="rounded-full px-3">
              <Pencil size={14} />
              {t('providerCredentialEditAction')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRevoke}
              disabled={credential.isRevoked}
              className="rounded-full px-3"
            >
              <ShieldOff size={14} />
              {t('providerCredentialRevokeAction')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title={t('providerCredentialDeleteAction')}
              aria-label={t('providerCredentialDeleteAction')}
              onClick={onDelete}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>

        <div className="px-5 py-5">
          <div className="rounded-[18px] border border-[var(--line)] bg-[var(--bg-soft)] p-4">
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              {t('providerCredentialUsageTitle')}
            </p>
            {credential.usage.length === 0 ? (
              <p className="mb-0 mt-3 text-sm leading-6 text-[var(--text-muted)]">
                {t('providerCredentialUsageEmpty')}
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {credential.usage.map((usage) => (
                  <Badge
                    key={`${credential.id}:${usage.workspaceId}`}
                    variant={usage.isDefault ? 'success' : 'muted'}
                    className="rounded-full px-3 py-1.5 text-xs"
                  >
                    {usage.workspaceName}
                    {usage.isDefault ? ` · ${t('providerCredentialDefault')}` : ''}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function GlobalSettingsProviderCredentialsSection({
  isActive = true,
}: GlobalSettingsProviderCredentialsSectionProps) {
  const { t } = useTranslation('settings');
  const [credentials, setCredentials] = useState<ProviderCredentialSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [editorCredential, setEditorCredential] = useState<ProviderCredentialSummary | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteState, setDeleteState] = useState<DeleteModalState | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setCredentials(await window.nakiros.providerCredentialsGetAll());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('providerCredentialLoadError'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isActive) return;
    void refresh();
  }, [isActive]);

  async function handleSubmit(
    provider: ProviderCredentialProvider,
    input: CreateProviderCredentialInput | UpdateProviderCredentialInput,
  ) {
    setSubmitting(true);
    try {
      if (editorMode === 'create') {
        await window.nakiros.providerCredentialCreate(input as CreateProviderCredentialInput);
      } else if (editorCredential) {
        await window.nakiros.providerCredentialUpdate(editorCredential.id, input as UpdateProviderCredentialInput);
      }
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(credential: ProviderCredentialSummary) {
    try {
      await window.nakiros.providerCredentialRevoke(credential.id);
      await refresh();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : t('providerCredentialRevokeError'));
    }
  }

  async function confirmDelete(force: boolean) {
    if (!deleteState) return;
    setDeleting(true);
    try {
      await window.nakiros.providerCredentialDelete(deleteState.credential.id, force);
      setDeleteState(null);
      await refresh();
    } catch (deleteError) {
      if (
        deleteError instanceof Error &&
        'impactedWorkspaces' in deleteError &&
        Array.isArray((deleteError as { impactedWorkspaces?: unknown }).impactedWorkspaces)
      ) {
        setDeleteState({
          credential: deleteState.credential,
          impactedWorkspaces: (deleteError as {
            impactedWorkspaces: Array<{ workspaceId: string; workspaceName: string; isDefault: boolean }>;
          }).impactedWorkspaces,
        });
      } else {
        setError(deleteError instanceof Error ? deleteError.message : t('providerCredentialDeleteError'));
      }
    } finally {
      setDeleting(false);
    }
  }

  const grouped = PROVIDERS.map((provider) => ({
    provider,
    items: credentials.filter((credential) => credential.provider === provider),
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mb-1 mt-0 text-xl font-bold text-foreground">{t('providerCredentialsTitle')}</h2>
          <p className="m-0 text-sm text-muted-foreground">{t('providerCredentialsSubtitle')}</p>
        </div>

        <Button
          type="button"
          onClick={() => {
            setEditorMode('create');
            setEditorCredential(null);
            setEditorOpen(true);
          }}
        >
          <Plus size={16} />
          {t('providerCredentialCreateAction')}
        </Button>
      </div>

      {error ? <p className="m-0 text-sm text-[var(--danger)]">{error}</p> : null}

      {loading ? (
        <p className="m-0 text-sm text-muted-foreground">{t('providerCredentialLoading')}</p>
      ) : credentials.length === 0 ? (
        <EmptyState
          icon={<KeyRound size={18} />}
          title={t('providerCredentialEmptyTitle')}
          subtitle={t('providerCredentialEmptySubtitle')}
          action={{
            label: t('providerCredentialCreateAction'),
            onClick: () => {
              setEditorMode('create');
              setEditorCredential(null);
              setEditorOpen(true);
            },
          }}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {grouped.map(({ provider, items }) => (
            <section key={provider} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="m-0 text-sm font-semibold text-[var(--text)]">{getProviderLabel(provider)}</h3>
                <Badge variant="muted">{t('providerCredentialCount', { count: items.length })}</Badge>
              </div>

              {items.length === 0 ? (
                <Card className="rounded-[16px] border-dashed border-[var(--line)] bg-[var(--bg-soft)] p-5 shadow-none">
                  <p className="m-0 text-sm text-[var(--text-muted)]">
                    {t('providerCredentialProviderEmpty', { provider: getProviderLabel(provider) })}
                  </p>
                </Card>
              ) : (
                <div className="flex flex-col gap-3">
                  {items.map((credential) => (
                    <ProviderCredentialCard
                      key={credential.id}
                      credential={credential}
                      onEdit={() => {
                        setEditorMode('edit');
                        setEditorCredential(credential);
                        setEditorOpen(true);
                      }}
                      onRevoke={() => void handleRevoke(credential)}
                      onDelete={() => {
                        setDeleteState({
                          credential,
                          impactedWorkspaces: credential.usage,
                        });
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <CredentialEditorModal
        isOpen={editorOpen}
        mode={editorMode}
        submitting={submitting}
        credential={editorCredential}
        onClose={() => {
          if (submitting) return;
          setEditorOpen(false);
        }}
        onSubmit={handleSubmit}
      />

      <Modal
        isOpen={deleteState !== null}
        onClose={() => {
          if (deleting) return;
          setDeleteState(null);
        }}
        title={t('providerCredentialDeleteTitle')}
        size="sm"
      >
        {deleteState ? (
          <div className="flex flex-col gap-4">
            <p className="m-0 text-sm text-[var(--text)]">
              {t('providerCredentialDeleteBody', { label: deleteState.credential.label })}
            </p>

            {deleteState.impactedWorkspaces.length > 0 ? (
              <div className="rounded-[10px] border border-[var(--warning)]/40 bg-[var(--bg-soft)] p-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-[0.04em] text-[var(--warning)]">
                  {t('providerCredentialDeleteImpactTitle')}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {deleteState.impactedWorkspaces.map((workspace) => (
                    <Badge key={`${deleteState.credential.id}:${workspace.workspaceId}`} variant="warning">
                      {workspace.workspaceName}
                      {workspace.isDefault ? ` · ${t('providerCredentialDefault')}` : ''}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDeleteState(null)} disabled={deleting}>
                {t('providerCredentialCancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void confirmDelete(deleteState.impactedWorkspaces.length > 0)}
                disabled={deleting}
              >
                {deleting
                  ? t('providerCredentialDeleting')
                  : t(
                    deleteState.impactedWorkspaces.length > 0
                      ? 'providerCredentialDeleteForceAction'
                      : 'providerCredentialDeleteAction',
                  )}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function WorkspaceProviderCard({
  provider,
  payload,
  attachSelection,
  bindingPending,
  onAttachSelectionChange,
  onBind,
  onCreate,
  onSetDefault,
  onUnbind,
}: {
  provider: ProviderCredentialProvider;
  payload: WorkspaceProviderCredentialsPayload;
  attachSelection: string;
  bindingPending: boolean;
  onAttachSelectionChange(value: string): void;
  onBind(): Promise<void>;
  onCreate(): void;
  onSetDefault(input: SetWorkspaceProviderDefaultInput): Promise<void>;
  onUnbind(binding: WorkspaceProviderBinding): Promise<void>;
}) {
  const { t } = useTranslation('settings');
  const bindings = payload.bindings.filter((binding) => binding.provider === provider);
  const activeBinding = bindings.find((binding) => binding.isDefault) ?? null;
  const availableCredentials = payload.availableCredentials
    .filter((credential) => credential.provider === provider)
    .filter((credential) => !credential.isRevoked)
    .filter((credential) => !bindings.some((binding) => binding.credentialId === credential.id));

  return (
    <Card className="rounded-[16px] border-[var(--line)] bg-[var(--bg-soft)] p-5 shadow-none">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="m-0 text-sm font-semibold text-[var(--text)]">{getProviderLabel(provider)}</h3>
            <p className="mb-0 mt-1 text-xs text-[var(--text-muted)]">
              {t('workspaceProviderCredentialProviderHint', { provider: getProviderLabel(provider) })}
            </p>
          </div>

          <Button type="button" variant="secondary" size="sm" onClick={onCreate}>
            <Plus size={14} />
            {t('workspaceProviderCredentialCreateAction')}
          </Button>
        </div>

        <Select
          value={activeBinding?.credentialId ?? ''}
          onChange={(event) => {
            if (!event.target.value) return;
            void onSetDefault({ provider, credentialId: event.target.value });
          }}
          label={t('workspaceProviderCredentialActiveLabel')}
          options={[
            { value: '', label: t('workspaceProviderCredentialActivePlaceholder') },
            ...bindings
              .filter((binding) => !binding.credential.isRevoked)
              .map((binding) => ({
                value: binding.credentialId,
                label: binding.credential.label,
              })),
          ]}
          disabled={bindings.length === 0 || bindingPending}
        />

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <Select
            value={attachSelection}
            onChange={(event) => onAttachSelectionChange(event.target.value)}
            label={t('workspaceProviderCredentialAttachLabel')}
            options={[
              { value: '', label: t('workspaceProviderCredentialAttachPlaceholder') },
              ...availableCredentials.map((credential) => ({
                value: credential.id,
                label: credential.label,
              })),
            ]}
            disabled={bindingPending || availableCredentials.length === 0}
          />

          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void onBind()}
              disabled={!attachSelection || bindingPending}
            >
              <Link2 size={14} />
              {t('workspaceProviderCredentialAttachAction')}
            </Button>
          </div>
        </div>

        {bindings.length === 0 ? (
          <EmptyState
            icon={<Unplug size={18} />}
            title={t('workspaceProviderCredentialEmptyTitle', { provider: getProviderLabel(provider) })}
            subtitle={t('workspaceProviderCredentialEmptySubtitle')}
            className="min-h-[160px]"
          />
        ) : (
          <div className="flex flex-col gap-2">
            {bindings.map((binding) => (
              <div
                key={`${binding.workspaceId}:${binding.credentialId}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[var(--text)]">{binding.credential.label}</span>
                    {binding.isDefault ? <Badge variant="success">{t('providerCredentialDefault')}</Badge> : null}
                    {binding.credential.isRevoked ? <Badge variant="danger">{t('providerCredentialRevoked')}</Badge> : null}
                  </div>
                  {describeCredentialMetadata(binding.credential, t).map((line) => (
                    <p key={`${binding.credentialId}:${line}`} className="mb-0 mt-1 text-xs text-[var(--text-muted)]">
                      {line}
                    </p>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void onUnbind(binding)}
                  disabled={bindingPending}
                >
                  <Unplug size={14} />
                  {t('workspaceProviderCredentialDetachAction')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export function WorkspaceProviderCredentialsSection({
  workspace,
}: WorkspaceProviderCredentialsSectionProps) {
  const { t } = useTranslation('settings');
  const [payload, setPayload] = useState<WorkspaceProviderCredentialsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bindingPending, setBindingPending] = useState(false);
  const [attachSelection, setAttachSelection] = useState<Record<ProviderCredentialProvider, string>>({
    jira: '',
    github: '',
    gitlab: '',
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorProvider, setEditorProvider] = useState<ProviderCredentialProvider>('jira');
  const [editorSubmitting, setEditorSubmitting] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setPayload(await window.nakiros.workspaceProviderCredentialsGet(workspace.id));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('workspaceProviderCredentialLoadError'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [workspace.id]);

  async function handleBind(provider: ProviderCredentialProvider) {
    const credentialId = attachSelection[provider];
    if (!credentialId) return;
    setBindingPending(true);
    setError(null);
    try {
      const nextPayload = await window.nakiros.workspaceProviderCredentialBind(workspace.id, {
        provider,
        credentialId,
      });
      setPayload(nextPayload);
      setAttachSelection((current) => ({ ...current, [provider]: '' }));
    } catch (bindError) {
      setError(bindError instanceof Error ? bindError.message : t('workspaceProviderCredentialBindError'));
    } finally {
      setBindingPending(false);
    }
  }

  async function handleSetDefault(input: SetWorkspaceProviderDefaultInput) {
    setBindingPending(true);
    setError(null);
    try {
      setPayload(await window.nakiros.workspaceProviderCredentialSetDefault(workspace.id, input));
    } catch (setDefaultError) {
      setError(setDefaultError instanceof Error ? setDefaultError.message : t('workspaceProviderCredentialDefaultError'));
    } finally {
      setBindingPending(false);
    }
  }

  async function handleUnbind(binding: WorkspaceProviderBinding) {
    setBindingPending(true);
    setError(null);
    try {
      setPayload(await window.nakiros.workspaceProviderCredentialUnbind(workspace.id, binding.credentialId));
    } catch (unbindError) {
      setError(unbindError instanceof Error ? unbindError.message : t('workspaceProviderCredentialDetachError'));
    } finally {
      setBindingPending(false);
    }
  }

  async function handleCreate(
    provider: ProviderCredentialProvider,
    input: CreateProviderCredentialInput | UpdateProviderCredentialInput,
  ) {
    void provider;
    setEditorSubmitting(true);
    try {
      const created = await window.nakiros.providerCredentialCreate(input as CreateProviderCredentialInput);
      const nextPayload = await window.nakiros.workspaceProviderCredentialBind(workspace.id, {
        provider: created.provider,
        credentialId: created.id,
      });
      setPayload(nextPayload);
    } finally {
      setEditorSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="mb-1 mt-0 text-xl font-bold text-[var(--text)]">{t('pmTitle')}</h2>
        <p className="m-0 text-sm text-[var(--text-muted)]">{t('providerCredentialsWorkspaceSubtitle')}</p>
      </div>

      {error ? <p className="m-0 text-sm text-[var(--danger)]">{error}</p> : null}

      {loading || payload === null ? (
        <p className="m-0 text-sm text-[var(--text-muted)]">{t('workspaceProviderCredentialLoading')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {PROVIDERS.map((provider) => (
            <WorkspaceProviderCard
              key={provider}
              provider={provider}
              payload={payload}
              attachSelection={attachSelection[provider]}
              bindingPending={bindingPending}
              onAttachSelectionChange={(value) => setAttachSelection((current) => ({ ...current, [provider]: value }))}
              onBind={() => handleBind(provider)}
              onCreate={() => {
                setEditorProvider(provider);
                setEditorOpen(true);
              }}
              onSetDefault={handleSetDefault}
              onUnbind={handleUnbind}
            />
          ))}
        </div>
      )}

      <CredentialEditorModal
        isOpen={editorOpen}
        mode="create"
        submitting={editorSubmitting}
        presetProvider={editorProvider}
        onClose={() => {
          if (editorSubmitting) return;
          setEditorOpen(false);
        }}
        onSubmit={handleCreate}
      />
    </div>
  );
}
