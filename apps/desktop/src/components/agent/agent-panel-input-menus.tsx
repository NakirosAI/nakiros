import clsx from 'clsx';
import type { RefObject } from 'react';

export interface SlashCommandMenuOption {
  id: string;
  command: string;
  label: string;
  kind: 'agent' | 'workflow';
}

export interface MentionMenuOption {
  tag: string;
  token: string;
  label: string;
  inConversation: boolean;
}

export interface ProjectScopeMenuOption {
  id: string;
  token: string;
  label: string;
  isWorkspace: boolean;
}

interface AgentInputMenusProps {
  showSlashCommands: boolean;
  filteredSlashCommands: SlashCommandMenuOption[];
  highlightedSlashIndex: number;
  activeSlashItemRef: RefObject<HTMLButtonElement | null>;
  onSelectSlashCommand: (command: string) => void;
  onHighlightSlashCommand: (index: number) => void;
  showMentionMenu: boolean;
  mentionOptions: MentionMenuOption[];
  filteredMentionOptions: MentionMenuOption[];
  highlightedMentionIndex: number;
  activeMentionItemRef: RefObject<HTMLButtonElement | null>;
  onSelectMention: (tag: string) => void;
  onHighlightMention: (index: number) => void;
  showProjectScopeMenu: boolean;
  filteredProjectScopeOptions: ProjectScopeMenuOption[];
  highlightedProjectScopeIndex: number;
  activeProjectScopeItemRef: RefObject<HTMLButtonElement | null>;
  onSelectProjectScope: (token: string) => void;
  onHighlightProjectScope: (index: number) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function AgentInputMenus({
  showSlashCommands,
  filteredSlashCommands,
  highlightedSlashIndex,
  activeSlashItemRef,
  onSelectSlashCommand,
  onHighlightSlashCommand,
  showMentionMenu,
  mentionOptions,
  filteredMentionOptions,
  highlightedMentionIndex,
  activeMentionItemRef,
  onSelectMention,
  onHighlightMention,
  showProjectScopeMenu,
  filteredProjectScopeOptions,
  highlightedProjectScopeIndex,
  activeProjectScopeItemRef,
  onSelectProjectScope,
  onHighlightProjectScope,
  t,
}: AgentInputMenusProps) {
  if (showSlashCommands) {
    return (
      <div className={SLASH_MENU_CLASS}>
        <div className={SLASH_MENU_HEADER_CLASS}>
          <span>{t('slashCommands')}</span>
          <span>{t('slashHint')}</span>
        </div>
        {filteredSlashCommands.length === 0 ? (
          <div className={SLASH_MENU_EMPTY_CLASS}>{t('slashNoMatch')}</div>
        ) : (
          <div className="max-h-[220px] overflow-y-auto">
            {filteredSlashCommands.map((command, index) => {
              const active = index === highlightedSlashIndex;
              return (
                <button
                  key={command.id}
                  type="button"
                  aria-selected={active}
                  ref={active ? activeSlashItemRef : undefined}
                  className={slashMenuItemClass(active)}
                  onMouseEnter={() => onHighlightSlashCommand(index)}
                  onClick={() => onSelectSlashCommand(command.command)}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={slashMenuCursorClass(active)} />
                    <div className="min-w-0">
                      <div className={slashMenuCommandClass(active)}>{command.command}</div>
                      <div className={slashMenuLabelClass(active)}>{command.label}</div>
                    </div>
                  </div>
                  <span className={slashMenuKindBadgeClass(active)}>
                    {command.kind === 'workflow' ? t('workflows') : t('agent')}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (showMentionMenu) {
    return (
      <div className={SLASH_MENU_CLASS}>
        <div className={SLASH_MENU_HEADER_CLASS}>
          <span>{t('mentionAgents')}</span>
          <span>{t('mentionHint')}</span>
        </div>
        {mentionOptions.length === 0 ? (
          <div className={SLASH_MENU_EMPTY_CLASS}>{t('mentionNoMeetingAgents')}</div>
        ) : filteredMentionOptions.length === 0 ? (
          <div className={SLASH_MENU_EMPTY_CLASS}>{t('mentionNoMatch')}</div>
        ) : (
          <div className="max-h-[220px] overflow-y-auto">
            {filteredMentionOptions.map((option, index) => {
              const active = index === highlightedMentionIndex;
              return (
                <button
                  key={option.tag}
                  type="button"
                  aria-selected={active}
                  ref={active ? activeMentionItemRef : undefined}
                  className={slashMenuItemClass(active)}
                  onMouseEnter={() => onHighlightMention(index)}
                  onClick={() => onSelectMention(option.tag)}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={slashMenuCursorClass(active)} />
                    <div className="min-w-0">
                      <div className={slashMenuCommandClass(active)}>{option.token}</div>
                      <div className={slashMenuLabelClass(active)}>{option.label}</div>
                    </div>
                  </div>
                  <span className={slashMenuKindBadgeClass(active)}>
                    {option.inConversation ? t('mentionActiveBadge') : t('mentionInviteBadge')}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (showProjectScopeMenu) {
    return (
      <div className={SLASH_MENU_CLASS}>
        <div className={SLASH_MENU_HEADER_CLASS}>
          <span>{t('projectScopes')}</span>
          <span>{t('projectHint')}</span>
        </div>
        {filteredProjectScopeOptions.length === 0 ? (
          <div className={SLASH_MENU_EMPTY_CLASS}>{t('projectNoMatch')}</div>
        ) : (
          <div className="max-h-[220px] overflow-y-auto">
            {filteredProjectScopeOptions.map((option, index) => {
              const active = index === highlightedProjectScopeIndex;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-selected={active}
                  ref={active ? activeProjectScopeItemRef : undefined}
                  className={slashMenuItemClass(active)}
                  onMouseEnter={() => onHighlightProjectScope(index)}
                  onClick={() => onSelectProjectScope(option.token)}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={slashMenuCursorClass(active)} />
                    <div className="min-w-0">
                      <div className={slashMenuCommandClass(active)}>#{option.token}</div>
                      <div className={slashMenuLabelClass(active)}>{option.label}</div>
                    </div>
                  </div>
                  <span className={slashMenuKindBadgeClass(active)}>
                    {option.isWorkspace ? t('allProjectsBadge') : t('projectBadge')}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return null;
}

const SLASH_MENU_CLASS = 'mb-2 rounded-[12px] border border-[var(--line)] bg-[var(--bg-card)]';
const SLASH_MENU_HEADER_CLASS =
  'flex items-center justify-between border-b border-[var(--line)] px-2.5 py-1 text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]';
const SLASH_MENU_EMPTY_CLASS = 'px-2.5 py-2 text-[11px] text-[var(--text-muted)]';
const SLASH_KIND_BADGE_CLASS =
  'rounded-[9px] border border-[var(--line)] bg-[var(--bg-soft)] px-1.5 py-px text-[10px] text-[var(--text-muted)]';

function slashMenuItemClass(active: boolean): string {
  return clsx(
    'flex w-full items-center justify-between gap-2 border-none border-b border-[var(--line)] bg-transparent px-2.5 py-2 text-left last:border-b-0',
    active && 'bg-[var(--primary-soft)] shadow-[inset_0_0_0_1px_var(--primary)]',
  );
}

function slashMenuCursorClass(active: boolean): string {
  return clsx(
    'h-6 w-[3px] shrink-0 rounded-full bg-[var(--primary)] transition-opacity',
    active ? 'opacity-100' : 'opacity-0',
  );
}

function slashMenuCommandClass(active: boolean): string {
  return clsx(
    'truncate font-mono text-[11px]',
    active ? 'font-bold text-[var(--primary)]' : 'text-[var(--text)]',
  );
}

function slashMenuLabelClass(active: boolean): string {
  return clsx(
    'truncate text-[10px]',
    active ? 'text-[var(--text)]' : 'text-[var(--text-muted)]',
  );
}

function slashMenuKindBadgeClass(active: boolean): string {
  return clsx(
    SLASH_KIND_BADGE_CLASS,
    active && 'border-[var(--primary)] text-[var(--primary)]',
  );
}
