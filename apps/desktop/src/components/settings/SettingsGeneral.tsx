import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { AuthState, OrganizationInfo } from '@nakiros/shared';
import { ORG_STATE_CHANGED_EVENT } from '../../constants/org';
import { Button, Card, Input, Modal, Select } from '../ui';
import { SettingsDanger } from './SettingsDanger';
import type { SettingsGeneralProps } from './types';

export function SettingsGeneral({ workspace, onUpdate, onDelete }: SettingsGeneralProps) {
  const { t } = useTranslation('settings');
  const [name, setName] = useState(workspace.name);
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [availableOrganizations, setAvailableOrganizations] = useState<OrganizationInfo[]>([]);
  const [ownershipLoading, setOwnershipLoading] = useState(true);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferPending, setTransferPending] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  useEffect(() => {
    setName(workspace.name);
  }, [workspace.id, workspace.name]);

  useEffect(() => {
    let cancelled = false;

    async function loadOwnershipContext() {
      const [nextAuthState, orgs] = await Promise.all([
        window.nakiros.authGetState().catch(() => ({ isAuthenticated: false } as AuthState)),
        window.nakiros.orgListMine().catch(() => []),
      ]);

      if (cancelled) return;
      setAuthState(nextAuthState);
      setAvailableOrganizations(orgs);
    }

    void (async () => {
      try {
        if (cancelled) return;
        await loadOwnershipContext();
      } finally {
        if (!cancelled) {
          setOwnershipLoading(false);
        }
      }
    })();

    const unsubscribeAuthComplete = window.nakiros.onAuthComplete(() => {
      void loadOwnershipContext();
    });

    const unsubscribeSignedOut = window.nakiros.onAuthSignedOut(() => {
      setAuthState({ isAuthenticated: false });
      setAvailableOrganizations([]);
    });

    const handleOrgStateChanged = () => {
      void loadOwnershipContext();
    };

    window.addEventListener(ORG_STATE_CHANGED_EVENT, handleOrgStateChanged);

    return () => {
      cancelled = true;
      unsubscribeAuthComplete();
      unsubscribeSignedOut();
      window.removeEventListener(ORG_STATE_CHANGED_EVENT, handleOrgStateChanged);
    };
  }, []);

  useEffect(() => {
    if (availableOrganizations.length === 0) {
      setSelectedOrganizationId('');
      return;
    }

    setSelectedOrganizationId((current) => (
      current && availableOrganizations.some((org) => org.id === current)
        ? current
        : availableOrganizations[0]!.id
    ));
  }, [availableOrganizations]);

  useEffect(() => {
    setTransferError(null);
    setTransferModalOpen(false);
  }, [workspace.id, workspace.ownerId]);

  async function handleNameBlur() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === workspace.name) return;
    await onUpdate({ ...workspace, name: trimmed });
  }

  async function handleOwnershipTransfer() {
    if (!selectedOrganization || transferPending) return;

    setTransferPending(true);
    setTransferError(null);
    try {
      await onUpdate({ ...workspace, ownerId: selectedOrganization.id });
      setTransferModalOpen(false);
    } catch (error) {
      setTransferError(error instanceof Error ? error.message : t('projectOwnershipTransferError'));
    } finally {
      setTransferPending(false);
    }
  }

  const docLangs = [
    { value: 'Système', label: t('languageSystem') },
    { value: 'Français', label: t('languageFrench') },
    { value: 'English', label: t('languageEnglish') },
  ] as const;
  const selectedDocLang = workspace.documentLanguage ?? 'Système';
  const currentOwnerOrganization = availableOrganizations.find((org) => org.id === workspace.ownerId) ?? null;
  const isPersonalWorkspace = !workspace.ownerId || (authState?.userId != null && workspace.ownerId === authState.userId);
  const selectedOrganization = useMemo(
    () => availableOrganizations.find((org) => org.id === selectedOrganizationId) ?? null,
    [availableOrganizations, selectedOrganizationId],
  );
  const currentOwnerLabel = isPersonalWorkspace
    ? t('workspaceOwnerPersonal')
    : currentOwnerOrganization
      ? t('workspaceOwnerOrganization', { name: currentOwnerOrganization.name })
      : t('projectOwnershipOrganizationFallback');
  const transferOptions = availableOrganizations.map((org) => ({ value: org.id, label: org.name }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="mb-1 mt-0 text-xl font-bold">{t('navGeneral')}</h2>
      </div>

      <Card className="rounded-[16px] border-[var(--line)] bg-[var(--bg-soft)] p-5 shadow-none">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void handleNameBlur()}
          label={t('projectNameLabel')}
          className="rounded-[12px] border-[var(--line)] bg-[var(--bg-card)] px-3 py-2.5 text-[13px]"
        />
      </Card>

      <Card className="rounded-[16px] border-[var(--line)] bg-[var(--bg-soft)] p-5 shadow-none">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
          {t('docLangLabel')}
        </span>
        <p className="m-0 text-xs text-[var(--text-muted)]">{t('docLangHint')}</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {docLangs.map((lang) => (
            <Button
              key={lang.value}
              type="button"
              variant="secondary"
              onClick={() => void onUpdate({ ...workspace, documentLanguage: lang.value })}
              className={clsx(
                'h-8 rounded-[10px] px-3 text-xs font-bold',
                selectedDocLang === lang.value
                  ? 'border-[var(--line-strong)] bg-[var(--bg-card)] text-[var(--text)]'
                  : 'border-[var(--line)] bg-[var(--bg-card)] text-[var(--text)]',
              )}
            >
              {lang.label}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="rounded-[16px] border-[var(--line)] bg-[var(--bg-soft)] p-5 shadow-none">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="m-0 text-sm font-semibold text-[var(--text)]">{t('projectOwnershipTitle')}</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{t('projectOwnershipSubtitle')}</p>
          </div>

          <div className="rounded-[12px] border border-[var(--line)] bg-[var(--bg-card)] p-3">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
              {t('projectOwnershipCurrentLabel')}
            </span>
            <p className="m-0 text-sm font-medium text-[var(--text)]">{currentOwnerLabel}</p>
          </div>

          {ownershipLoading ? (
            <p className="m-0 text-xs text-[var(--text-muted)]">{t('workspaceOwnerLoading')}</p>
          ) : !authState?.isAuthenticated ? (
            <div className="flex flex-col gap-3 rounded-[12px] border border-dashed border-[var(--line)] bg-[var(--bg-card)] p-4">
              <p className="m-0 text-xs text-[var(--text-muted)]">{t('projectOwnershipSignInHint')}</p>
              <div>
                <Button type="button" size="sm" onClick={() => void window.nakiros.authSignIn()}>
                  {t('accountSignIn')}
                </Button>
              </div>
            </div>
          ) : isPersonalWorkspace ? (
            availableOrganizations.length === 0 ? (
              <p className="m-0 text-xs text-[var(--text-muted)]">{t('projectOwnershipNoOrganizations')}</p>
            ) : (
              <div className="flex flex-col gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--bg-card)] p-4">
                <Select
                  id="workspace-owner-transfer"
                  value={selectedOrganizationId}
                  onChange={(event) => setSelectedOrganizationId(event.target.value)}
                  label={t('projectOwnershipTransferLabel')}
                  hint={t('projectOwnershipTransferHint')}
                  options={transferOptions}
                  className="rounded-[12px] border-[var(--line)] bg-[var(--bg-soft)] text-[13px]"
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!selectedOrganization}
                    onClick={() => {
                      setTransferError(null);
                      setTransferModalOpen(true);
                    }}
                  >
                    {t('projectOwnershipTransferAction')}
                  </Button>
                </div>
                {transferError && (
                  <p className="m-0 text-xs text-destructive">{transferError}</p>
                )}
              </div>
            )
          ) : (
            <div className="flex flex-col gap-2 rounded-[12px] border border-[var(--line)] bg-[var(--bg-card)] p-4">
              <p className="m-0 text-sm font-medium text-[var(--text)]">
                {t('projectOwnershipOrgLocked', { name: currentOwnerOrganization?.name ?? t('workspaceOwnerLabel') })}
              </p>
              <p className="m-0 text-xs text-[var(--text-muted)]">{t('projectOwnershipOrgLockedHint')}</p>
            </div>
          )}
        </div>
      </Card>

      <SettingsDanger workspace={workspace} onDeleted={onDelete} />

      <Modal
        isOpen={transferModalOpen}
        onClose={() => {
          if (transferPending) return;
          setTransferModalOpen(false);
        }}
        title={t('projectOwnershipConfirmTitle')}
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm text-muted-foreground">
            {t('projectOwnershipConfirmBody', { name: workspace.name, organization: selectedOrganization?.name ?? '' })}
          </p>
          <p className="m-0 text-xs text-muted-foreground">{t('projectOwnershipConfirmHint')}</p>
          {transferError && (
            <p className="m-0 text-xs text-destructive">{transferError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={transferPending}
              onClick={() => setTransferModalOpen(false)}
            >
              {t('mcpCancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={transferPending || !selectedOrganization}
              onClick={() => {
                void handleOwnershipTransfer();
              }}
            >
              {transferPending ? t('projectOwnershipTransferring') : t('projectOwnershipTransferAction')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
