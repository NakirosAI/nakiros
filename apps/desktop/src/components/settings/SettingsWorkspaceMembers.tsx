import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthState, UpsertWorkspaceMembershipInput, WorkspaceMembershipListPayload, WorkspaceRole } from '@nakiros/shared';
import type { SettingsBaseProps } from './types';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Select } from '../ui';

const DEFAULT_NEW_MEMBER_ROLE: WorkspaceRole = 'viewer';

const ROLE_OPTIONS: WorkspaceRole[] = ['owner', 'admin', 'pm', 'dev', 'viewer'];

function isManagerError(message: string | null): boolean {
  return Boolean(message && message.toLowerCase().includes('owner or admin'));
}

export function SettingsWorkspaceMembers({ workspace }: SettingsBaseProps) {
  const { t } = useTranslation('settings');
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [membersPayload, setMembersPayload] = useState<WorkspaceMembershipListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [draftRoles, setDraftRoles] = useState<Record<string, WorkspaceRole>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadAuthAndMembers() {
      setAuthLoading(true);
      setLoading(true);
      setError(null);

      try {
        const nextAuthState = await window.nakiros.authGetState();
        if (cancelled) return;
        setAuthState(nextAuthState);
        setAuthLoading(false);

        if (!nextAuthState.isAuthenticated) {
          setMembersPayload(null);
          setLoading(false);
          return;
        }

        const payload = await window.nakiros.workspaceListMembers(workspace.id);
        if (cancelled) return;
        setMembersPayload(payload);
        setDraftRoles(
          Object.fromEntries(
            payload.members.map((member) => [member.userId, member.workspaceRole ?? DEFAULT_NEW_MEMBER_ROLE]),
          ),
        );
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : t('workspaceMembersLoadError'));
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
          setLoading(false);
        }
      }
    }

    void loadAuthAndMembers();
    return () => {
      cancelled = true;
    };
  }, [t, workspace.id]);

  const members = membersPayload?.members ?? [];
  const managerError = isManagerError(error);

  function getRoleLabel(role: WorkspaceRole): string {
    switch (role) {
      case 'owner':
        return t('workspaceRoleOwner');
      case 'admin':
        return t('workspaceRoleAdmin');
      case 'pm':
        return t('workspaceRolePM');
      case 'dev':
        return t('workspaceRoleDev');
      case 'viewer':
      default:
        return t('workspaceRoleViewer');
    }
  }

  function getOrgRoleLabel(role: 'admin' | 'member'): string {
    return role === 'admin' ? t('orgAdminBadge') : t('orgMemberBadge');
  }

  async function refreshMembers() {
    if (!authState?.isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await window.nakiros.workspaceListMembers(workspace.id);
      setMembersPayload(payload);
      setDraftRoles(
        Object.fromEntries(
          payload.members.map((member) => [member.userId, member.workspaceRole ?? DEFAULT_NEW_MEMBER_ROLE]),
        ),
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('workspaceMembersLoadError'));
    } finally {
      setLoading(false);
    }
  }

  async function handleUpsertMember(input: UpsertWorkspaceMembershipInput, wasActive: boolean) {
    const key = `save:${input.userId}`;
    setPendingKey(key);
    setError(null);
    setFeedback(null);
    try {
      const payload = await window.nakiros.workspaceUpsertMember(workspace.id, input);
      setMembersPayload(payload);
      setDraftRoles(
        Object.fromEntries(
          payload.members.map((member) => [member.userId, member.workspaceRole ?? DEFAULT_NEW_MEMBER_ROLE]),
        ),
      );
      setFeedback(t(wasActive ? 'workspaceMembersSaveSuccess' : 'workspaceMembersAddSuccess'));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('workspaceMembersSaveError'));
    } finally {
      setPendingKey(null);
    }
  }

  async function handleRemoveMember(userId: string) {
    const key = `remove:${userId}`;
    setPendingKey(key);
    setError(null);
    setFeedback(null);
    try {
      await window.nakiros.workspaceRemoveMember(workspace.id, userId);
      await refreshMembers();
      setFeedback(t('workspaceMembersRemoveSuccess'));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('workspaceMembersRemoveError'));
    } finally {
      setPendingKey(null);
    }
  }

  const roleOptions = ROLE_OPTIONS.map((role) => ({
    value: role,
    label: getRoleLabel(role),
  }));

  if (authLoading || loading) {
    return (
      <Card className="border-[var(--line)] bg-[var(--bg-soft)] shadow-none">
        <CardContent className="p-6">
          <p className="m-0 text-sm text-muted-foreground">{t('workspaceMembersLoading')}</p>
        </CardContent>
      </Card>
    );
  }

  if (!authState?.isAuthenticated) {
    return (
      <Card className="border-[var(--line)] bg-[var(--bg-soft)] shadow-none">
        <CardHeader>
          <CardTitle className="text-lg">{t('workspaceMembersTitle')}</CardTitle>
          <CardDescription>{t('workspaceMembersSignInHint')}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Button type="button" size="sm" onClick={() => void window.nakiros.authSignIn()}>
            {t('accountSignIn')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (managerError) {
    return (
      <Card className="border-[var(--line)] bg-[var(--bg-soft)] shadow-none">
        <CardHeader>
          <CardTitle className="text-lg">{t('workspaceMembersTitle')}</CardTitle>
          <CardDescription>{t('workspaceMembersManagerOnly')}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Button type="button" size="sm" variant="secondary" onClick={() => void refreshMembers()}>
            {t('workspaceMembersRetry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (membersPayload?.scope === 'personal') {
    return (
      <Card className="border-[var(--line)] bg-[var(--bg-soft)] shadow-none">
        <CardHeader>
          <CardTitle className="text-lg">{t('workspaceMembersTitle')}</CardTitle>
          <CardDescription>{t('workspaceMembersPersonalWorkspace')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-[var(--line)] bg-[var(--bg-soft)] shadow-none">
        <CardHeader>
          <CardTitle className="text-lg">{t('workspaceMembersTitle')}</CardTitle>
          <CardDescription>{t('workspaceMembersSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          {feedback && (
            <p className="m-0 text-sm text-[var(--success)]">{feedback}</p>
          )}
          {error && !managerError && (
            <p className="m-0 text-sm text-[var(--danger)]">{error}</p>
          )}
          {members.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">{t('workspaceMembersEmpty')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {members.map((member) => {
                const draftRole = draftRoles[member.userId] ?? member.workspaceRole ?? DEFAULT_NEW_MEMBER_ROLE;
                const isSaving = pendingKey === `save:${member.userId}`;
                const isRemoving = pendingKey === `remove:${member.userId}`;
                const canSave = member.workspaceRole !== draftRole;

                return (
                  <div
                    key={member.userId}
                    className="rounded-xl border border-[var(--line)] bg-[var(--bg-card)] p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="m-0 truncate text-sm font-semibold text-foreground">
                            {member.email ?? member.userId}
                          </p>
                          <Badge variant={member.status === 'active' ? 'info' : 'muted'}>
                            {member.status === 'active' ? getRoleLabel(member.workspaceRole ?? DEFAULT_NEW_MEMBER_ROLE) : t('workspaceMemberNotAdded')}
                          </Badge>
                          <Badge variant="muted">{getOrgRoleLabel(member.organizationRole)}</Badge>
                          {member.isCurrentUser && (
                            <Badge variant="success">{t('workspaceMemberCurrentUser')}</Badge>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {member.status === 'active'
                            ? t('workspaceMemberActiveHint')
                            : t('workspaceMemberInactiveHint')}
                        </p>
                      </div>

                      <div className="flex w-full flex-col gap-3 lg:w-[260px]">
                        <Select
                          label={t('workspaceMemberRoleLabel')}
                          value={draftRole}
                          options={roleOptions}
                          onChange={(event) => {
                            const nextRole = event.target.value as WorkspaceRole;
                            setDraftRoles((current) => ({ ...current, [member.userId]: nextRole }));
                          }}
                        />
                        <div className="flex gap-2">
                          {member.status === 'active' ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => void handleUpsertMember({ userId: member.userId, role: draftRole }, true)}
                                disabled={!canSave || isSaving || isRemoving}
                              >
                                {isSaving ? t('workspaceMembersSaving') : t('workspaceMembersSaveAction')}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => void handleRemoveMember(member.userId)}
                                disabled={isSaving || isRemoving}
                              >
                                {isRemoving ? t('workspaceMembersRemoving') : t('workspaceMembersRemoveAction')}
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void handleUpsertMember({ userId: member.userId, role: draftRole }, false)}
                              disabled={isSaving}
                            >
                              {isSaving ? t('workspaceMembersSaving') : t('workspaceMembersAddAction')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
