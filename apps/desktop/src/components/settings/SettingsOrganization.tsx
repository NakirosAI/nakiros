import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut, Trash2 } from 'lucide-react';
import type { OrgRole, OrganizationInfo, OrganizationMemberListItem } from '@nakiros/shared';
import { ORG_STATE_CHANGED_EVENT } from '../../constants/org';
import { Badge, Button, Card, CardContent, Input, Modal, Select } from '../ui';

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

type OrgInfo = OrganizationInfo;

export function SettingsOrganization() {
  const { t } = useTranslation('settings');
  const [authState, setAuthState] = useState<{ isAuthenticated: boolean; email?: string; userId?: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [orgs, setOrgs] = useState<OrgInfo[] | undefined>(undefined);
  const [membersByOrgId, setMembersByOrgId] = useState<Record<string, OrganizationMemberListItem[] | null>>({});
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [orgPending, setOrgPending] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [orgCreateSuccess, setOrgCreateSuccess] = useState<string | null>(null);
  const [showCreateOrgForm, setShowCreateOrgForm] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<OrgInfo | null>(null);
  const [deleteOrgPendingId, setDeleteOrgPendingId] = useState<string | null>(null);
  const [deleteOrgErrors, setDeleteOrgErrors] = useState<Record<string, string | null>>({});
  const [leaveOrgPendingId, setLeaveOrgPendingId] = useState<string | null>(null);
  const [leaveOrgErrors, setLeaveOrgErrors] = useState<Record<string, string | null>>({});
  const [inviteEmails, setInviteEmails] = useState<Record<string, string>>({});
  const [inviteRoles, setInviteRoles] = useState<Record<string, OrgRole>>({});
  const [inviteStatuses, setInviteStatuses] = useState<Record<string, 'idle' | 'pending' | 'success' | 'error'>>({});
  const [inviteErrors, setInviteErrors] = useState<Record<string, string | null>>({});
  const [removingId, setRemovingId] = useState<string | null>(null);
  const safeOrgs = Array.isArray(orgs) ? orgs : [];
  const hasOrganizations = safeOrgs.length > 0;
  const shouldShowCreateOrgForm =
    !authLoading && authState?.isAuthenticated && (showCreateOrgForm || !hasOrganizations);

  async function loadOrgs() {
    const [listedOrgs, currentOrg] = await Promise.all([
      window.nakiros.orgListMine().catch(() => []),
      window.nakiros.orgGetMine().catch(() => undefined),
    ]);
    const mergedOrgs = Array.isArray(listedOrgs) ? [...listedOrgs] : [];
    if (currentOrg && !mergedOrgs.some((org) => org.id === currentOrg.id)) {
      mergedOrgs.unshift(currentOrg);
    }
    setOrgs(mergedOrgs);
    return mergedOrgs;
  }

  async function loadMembers(orgId: string) {
    setMembersByOrgId((prev) => ({ ...prev, [orgId]: null }));
    const list = await window.nakiros.orgListMembers(orgId).catch(() => []);
    setMembersByOrgId((prev) => ({ ...prev, [orgId]: list }));
  }

  useEffect(() => {
    void window.nakiros.authGetState().then((state) => {
      setAuthState({ isAuthenticated: state.isAuthenticated, email: state.email, userId: state.userId });
      if (state.isAuthenticated) {
        void loadOrgs();
      } else {
        setOrgs([]);
      }
    }).finally(() => {
      setAuthLoading(false);
    });

    const unsubComplete = window.nakiros.onAuthComplete(async () => {
      setAuthLoading(false);
      const nextState = await window.nakiros.authGetState().catch(() => ({ isAuthenticated: true } as const));
      setAuthState({
        isAuthenticated: nextState.isAuthenticated,
        email: nextState.email,
        userId: nextState.userId,
      });
      if (nextState.isAuthenticated) {
        await loadOrgs();
      }
    });

    const unsubSignedOut = window.nakiros.onAuthSignedOut(() => {
      setAuthState({ isAuthenticated: false });
      setAuthLoading(false);
      setOrgs([]);
      setMembersByOrgId({});
    });

    return () => {
      unsubComplete();
      unsubSignedOut();
    };
  }, []);

  useEffect(() => {
    const nextOrgs = Array.isArray(orgs) ? orgs : [];
    const adminOrgIds = nextOrgs.filter((org) => org.role === 'admin').map((org) => org.id);
    setMembersByOrgId((prev) => (
      Object.fromEntries(
        Object.entries(prev).filter(([orgId]) => adminOrgIds.includes(orgId)),
      )
    ));
    for (const org of nextOrgs) {
      if (org.role === 'admin') {
        void loadMembers(org.id);
      }
    }
  }, [orgs]);

  function getRoleLabel(role: OrgRole) {
    return role === 'admin' ? t('orgRoleAdmin') : t('orgRoleMember');
  }

  function getInviteErrorMessage(message: string) {
    const code = message.includes(':') ? message.split(':')[0] : '';
    if (code === 'USER_NOT_FOUND') return t('orgInviteNotFound');
    if (code === 'ALREADY_MEMBER') return t('orgInviteAlreadyMember');
    return t('orgInviteError');
  }

  function getInviteEmail(orgId: string) {
    return inviteEmails[orgId] ?? '';
  }

  function getInviteRole(orgId: string) {
    return inviteRoles[orgId] ?? 'member';
  }

  function getInviteStatus(orgId: string) {
    return inviteStatuses[orgId] ?? 'idle';
  }

  function getInviteError(orgId: string) {
    return inviteErrors[orgId] ?? null;
  }

  async function handleInvite(org: OrgInfo) {
    const inviteEmail = getInviteEmail(org.id).trim();
    if (!inviteEmail) return;
    setInviteStatuses((prev) => ({ ...prev, [org.id]: 'pending' }));
    setInviteErrors((prev) => ({ ...prev, [org.id]: null }));
    try {
      const added = await window.nakiros.orgAddMember(org.id, inviteEmail, getInviteRole(org.id), authState?.email);
      setMembersByOrgId((prev) => ({
        ...prev,
        [org.id]: [
          ...((prev[org.id] ?? []) as OrganizationMemberListItem[]),
          {
            userId: added.userId,
            invitationId: added.id,
            email: added.email,
            role: added.role,
            invitedAt: new Date().toISOString(),
            status: added.status,
          },
        ],
      }));
      setInviteEmails((prev) => ({ ...prev, [org.id]: '' }));
      setInviteRoles((prev) => ({ ...prev, [org.id]: 'member' }));
      setInviteStatuses((prev) => ({ ...prev, [org.id]: 'success' }));
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setInviteErrors((prev) => ({ ...prev, [org.id]: getInviteErrorMessage(message) }));
      setInviteStatuses((prev) => ({ ...prev, [org.id]: 'error' }));
    }
  }

  async function handleRemoveMember(orgId: string, member: OrganizationMemberListItem) {
    const key = member.status === 'pending' ? `inv-${member.invitationId}` : `usr-${member.userId}`;
    setRemovingId(key);
    try {
      if (member.status === 'pending' && member.invitationId) {
        await window.nakiros.orgCancelInvitation(orgId, member.invitationId);
        setMembersByOrgId((prev) => ({
          ...prev,
          [orgId]: ((prev[orgId] ?? []) as OrganizationMemberListItem[]).filter((item) => item.invitationId !== member.invitationId),
        }));
        return;
      }
      if (member.status === 'active' && member.userId) {
        await window.nakiros.orgRemoveMember(orgId, member.userId);
        setMembersByOrgId((prev) => ({
          ...prev,
          [orgId]: ((prev[orgId] ?? []) as OrganizationMemberListItem[]).filter((item) => item.userId !== member.userId),
        }));
      }
    } finally {
      setRemovingId(null);
    }
  }

  async function handleCreateOrganization() {
    const hadNoOrgs = safeOrgs.length === 0;
    setOrgPending(true);
    setOrgError(null);
    setOrgCreateSuccess(null);
    try {
      const result = await window.nakiros.orgCreate(orgName.trim(), orgSlug.trim());
      setOrgCreateSuccess(result.organizationName);
      setOrgName('');
      setOrgSlug('');
      setSlugEdited(false);
      await loadOrgs();
      if (hadNoOrgs) {
        window.dispatchEvent(new CustomEvent(ORG_STATE_CHANGED_EVENT));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setOrgError(
        message.toLowerCase().includes('slug') || message.toLowerCase().includes('conflict')
          ? t('orgSlugConflict')
          : t('orgCreateError'),
      );
    } finally {
      setOrgPending(false);
    }
  }

  async function handleLeaveOrganization(orgId: string) {
    setLeaveOrgPendingId(orgId);
    setLeaveOrgErrors((prev) => ({ ...prev, [orgId]: null }));
    setOrgCreateSuccess(null);
    try {
      await window.nakiros.orgLeave(orgId);
      await loadOrgs();
      window.dispatchEvent(new CustomEvent(ORG_STATE_CHANGED_EVENT));
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setLeaveOrgErrors((prev) => ({ ...prev, [orgId]: message || t('orgLeaveError') }));
    } finally {
      setLeaveOrgPendingId(null);
    }
  }

  async function handleDeleteOrganization(org: OrgInfo) {
    setDeleteOrgPendingId(org.id);
    setDeleteOrgErrors((prev) => ({ ...prev, [org.id]: null }));
    setOrgCreateSuccess(null);
    try {
      await window.nakiros.orgDelete(org.id);
      setOrgToDelete(null);
      await loadOrgs();
      window.dispatchEvent(new CustomEvent(ORG_STATE_CHANGED_EVENT));
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setDeleteOrgErrors((prev) => ({ ...prev, [org.id]: message || t('orgDeleteError') }));
    } finally {
      setDeleteOrgPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="mb-1 mt-0 text-xl font-bold text-foreground">{t('navOrganization')}</h2>
          <p className="m-0 text-sm text-muted-foreground">{t('orgSubtitle')}</p>
        </div>
        {authState?.isAuthenticated && (
          <Button
            type="button"
            size="sm"
            className="self-start"
            onClick={() => {
              setShowCreateOrgForm(true);
              setOrgError(null);
              setOrgCreateSuccess(null);
            }}
          >
            {hasOrganizations ? t('orgCreateAnotherAction') : t('orgCreateAction')}
          </Button>
        )}
      </div>

      {authLoading && (
        <Card className="border-border/80 shadow-none">
          <CardContent className="p-5 sm:p-6">
            <p className="m-0 text-sm text-muted-foreground">…</p>
          </CardContent>
        </Card>
      )}

      {!authLoading && !authState?.isAuthenticated && (
        <Card className="border-border/80 shadow-none">
          <CardContent className="flex flex-col items-start gap-3 p-5 sm:p-6">
            <p className="m-0 text-sm text-muted-foreground">{t('orgNotConnectedHint')}</p>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                void window.nakiros.authSignIn();
              }}
            >
              {t('accountSignIn')}
            </Button>
          </CardContent>
        </Card>
      )}

      {shouldShowCreateOrgForm && (
        <Card className="border-border/80 shadow-none">
          <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
            <p className="m-0 text-sm text-muted-foreground">
              {hasOrganizations ? t('orgCreateAnotherHint') : t('orgNoneHint')}
            </p>
            <Input
              type="text"
              label={t('orgNameLabel')}
              placeholder={t('orgNamePlaceholder')}
              value={orgName}
              onChange={(event) => {
                const nextName = event.target.value;
                setOrgName(nextName);
                if (!slugEdited) {
                  setOrgSlug(slugify(nextName));
                }
                setOrgError(null);
              }}
            />
            <Input
              type="text"
              label={t('orgSlugLabel')}
              hint={t('orgSlugHint')}
              placeholder={t('orgSlugPlaceholder')}
              value={orgSlug}
              onChange={(event) => {
                setOrgSlug(event.target.value);
                setSlugEdited(true);
                setOrgError(null);
              }}
            />
            {orgError && <p className="m-0 text-xs text-destructive">{orgError}</p>}
            {orgCreateSuccess && (
              <p className="m-0 text-xs text-muted-foreground">
                {t('orgCreateSuccess', { name: orgCreateSuccess })}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={orgPending || !orgName.trim() || !orgSlug.trim()}
                onClick={() => {
                  void handleCreateOrganization();
                }}
              >
                {orgPending ? t('orgCreating') : t('orgCreateAction')}
              </Button>
              {hasOrganizations && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowCreateOrgForm(false);
                    setOrgError(null);
                    setOrgCreateSuccess(null);
                    setOrgName('');
                    setOrgSlug('');
                    setSlugEdited(false);
                  }}
                >
                  {t('mcpCancel')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!authLoading && authState?.isAuthenticated && safeOrgs.map((org) => {
        const members = membersByOrgId[org.id];
        const safeMembers = Array.isArray(members) ? members : members === null ? null : [];
        const inviteStatus = getInviteStatus(org.id);
        const inviteError = getInviteError(org.id);
        const deleteOrgError = deleteOrgErrors[org.id];
        const leaveOrgError = leaveOrgErrors[org.id];
        return (
          <Card key={org.id} className="border-border/80 shadow-none">
            <CardContent className="flex flex-col gap-5 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-semibold text-foreground">{org.name}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={org.role === 'admin' ? 'info' : 'muted'}>
                    {getRoleLabel(org.role)}
                  </Badge>
                  {org.role === 'admin' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title={t('orgDeleteAction')}
                      aria-label={t('orgDeleteAction')}
                      disabled={deleteOrgPendingId === org.id}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        setOrgToDelete(org);
                        setDeleteOrgErrors((prev) => ({ ...prev, [org.id]: null }));
                      }}
                    >
                      <Trash2 data-icon="inline-start" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title={t('orgLeaveAction')}
                    aria-label={t('orgLeaveAction')}
                    disabled={leaveOrgPendingId === org.id}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      void handleLeaveOrganization(org.id);
                    }}
                  >
                    <LogOut data-icon="inline-start" />
                  </Button>
                </div>
              </div>

              {deleteOrgError && (
                <p className="m-0 text-xs text-destructive">{deleteOrgError}</p>
              )}

              {leaveOrgError && (
                <p className="m-0 text-xs text-destructive">{leaveOrgError}</p>
              )}

              {org.role === 'admin' && (
                <div className="flex flex-col gap-3 border-t border-border pt-3">
                  <p className="m-0 text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                    {t('orgMembersTitle')}
                  </p>

                  {safeMembers === null && (
                    <p className="m-0 text-xs text-muted-foreground">…</p>
                  )}

                  {safeMembers !== null && safeMembers.length === 0 && (
                    <p className="m-0 text-xs text-muted-foreground">{t('orgMembersEmpty')}</p>
                  )}

                  {safeMembers !== null && safeMembers.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {safeMembers.map((member) => {
                        const key = member.status === 'pending' ? `inv-${member.invitationId}` : `usr-${member.userId}`;
                        const displayEmail =
                          member.email
                          ?? (member.userId === authState.userId ? authState.email : null)
                          ?? member.userId
                          ?? member.invitationId
                          ?? '';
                        const isPending = member.status === 'pending';
                        return (
                          <div
                            key={key}
                            className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
                          >
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <span className="truncate text-sm text-foreground">{displayEmail}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {isPending && (
                                <Badge variant="muted">
                                  {t('orgPendingBadge')}
                                </Badge>
                              )}
                              <Badge variant={member.role === 'admin' ? 'info' : 'muted'}>
                                {getRoleLabel(member.role)}
                              </Badge>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={removingId === key}
                                className="h-6 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => {
                                  void handleRemoveMember(org.id, member);
                                }}
                              >
                                {removingId === key
                                  ? (isPending ? t('orgCancelling') : t('orgRemoving'))
                                  : (isPending ? t('orgCancelInvitation') : t('orgRemoveMember'))}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto]">
                    <Input
                      type="email"
                      label={t('orgInviteEmailLabel')}
                      placeholder={t('orgInviteEmailPlaceholder')}
                      value={getInviteEmail(org.id)}
                      disabled={inviteStatus === 'pending'}
                      onChange={(event) => {
                        setInviteEmails((prev) => ({ ...prev, [org.id]: event.target.value }));
                        setInviteErrors((prev) => ({ ...prev, [org.id]: null }));
                        if (inviteStatus !== 'idle') {
                          setInviteStatuses((prev) => ({ ...prev, [org.id]: 'idle' }));
                        }
                      }}
                      containerClassName="min-w-0"
                    />
                    <Select
                      value={getInviteRole(org.id)}
                      onChange={(event) => {
                        setInviteRoles((prev) => ({ ...prev, [org.id]: event.target.value as OrgRole }));
                      }}
                      options={[
                        { value: 'member', label: t('orgRoleMember') },
                        { value: 'admin', label: t('orgRoleAdmin') },
                      ]}
                      label={t('orgInviteRoleLabel')}
                      containerClassName="gap-1"
                    />
                    <div className="flex items-end">
                      <Button
                        type="button"
                        size="sm"
                        disabled={inviteStatus === 'pending' || !getInviteEmail(org.id).trim()}
                        className="w-full md:w-auto"
                        onClick={() => {
                          void handleInvite(org);
                        }}
                      >
                        {inviteStatus === 'pending' ? t('orgInviting') : t('orgInviteAction')}
                      </Button>
                    </div>
                  </div>
                  {inviteError && (
                    <p className="m-0 text-xs text-destructive">{inviteError}</p>
                  )}
                  {inviteStatus === 'success' && (
                    <p className="m-0 text-xs text-muted-foreground">{t('orgInviteSuccessPending')}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Modal
        isOpen={orgToDelete !== null}
        onClose={() => {
          if (deleteOrgPendingId) return;
          setOrgToDelete(null);
        }}
        title={t('orgDeleteConfirmTitle')}
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm text-muted-foreground">
            {t('orgDeleteConfirmBody', { name: orgToDelete?.name ?? '' })}
          </p>
          <p className="m-0 text-xs text-muted-foreground">{t('orgDeleteConfirmHint')}</p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={deleteOrgPendingId !== null}
              onClick={() => setOrgToDelete(null)}
            >
              {t('mcpCancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!orgToDelete || deleteOrgPendingId !== null}
              onClick={() => {
                if (!orgToDelete) return;
                void handleDeleteOrganization(orgToDelete);
              }}
            >
              {deleteOrgPendingId ? t('orgDeleting') : t('orgDeleteAction')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
