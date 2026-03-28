import type { KeyboardEvent } from 'react';

interface KeyboardMenuArgs<T> {
  isVisible: boolean;
  items: T[];
  highlightedIndex: number;
  selectItem: (item: T) => void;
  updateHighlightedIndex: (updater: (prev: number) => number) => void;
}

export interface AgentInputKeydownArgs<TSlash, TMention, TProject> {
  event: KeyboardEvent<HTMLTextAreaElement>;
  hasActiveTab: boolean;
  showSlashCommands: boolean;
  slashMenu: KeyboardMenuArgs<TSlash>;
  showMentionMenu: boolean;
  mentionMenu: KeyboardMenuArgs<TMention>;
  showProjectScopeMenu: boolean;
  projectScopeMenu: KeyboardMenuArgs<TProject>;
  sendMessage: () => void;
}

function handleKeyboardMenu<T>(
  event: KeyboardEvent<HTMLTextAreaElement>,
  args: KeyboardMenuArgs<T>,
): boolean {
  if (!args.isVisible) return false;

  if (event.key === 'ArrowDown') {
    if (args.items.length > 0) {
      event.preventDefault();
      args.updateHighlightedIndex((prev) => (prev + 1) % args.items.length);
      return true;
    }
    return false;
  }

  if (event.key === 'ArrowUp') {
    if (args.items.length > 0) {
      event.preventDefault();
      args.updateHighlightedIndex((prev) => (prev - 1 + args.items.length) % args.items.length);
      return true;
    }
    return false;
  }

  if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
    const nextItem = args.items[args.highlightedIndex] ?? args.items[0];
    if (nextItem) {
      event.preventDefault();
      args.selectItem(nextItem);
      return true;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      return true;
    }
  }

  return false;
}

export function handleAgentInputKeydown<TSlash, TMention, TProject>(
  args: AgentInputKeydownArgs<TSlash, TMention, TProject>,
): boolean {
  if (args.hasActiveTab && args.showSlashCommands) {
    const handled = handleKeyboardMenu(args.event, args.slashMenu);
    if (handled) return true;
  }

  if (args.hasActiveTab && !args.showSlashCommands && args.showMentionMenu) {
    const handled = handleKeyboardMenu(args.event, args.mentionMenu);
    if (handled) return true;
  }

  if (args.hasActiveTab && !args.showSlashCommands && !args.showMentionMenu && args.showProjectScopeMenu) {
    const handled = handleKeyboardMenu(args.event, args.projectScopeMenu);
    if (handled) return true;
  }

  if (args.event.key === 'Enter' && !args.event.shiftKey && args.hasActiveTab) {
    args.event.preventDefault();
    args.sendMessage();
    return true;
  }

  return false;
}
