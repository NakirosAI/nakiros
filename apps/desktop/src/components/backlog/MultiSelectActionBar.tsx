import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui';

interface MultiSelectActionBarProps {
  selectedCount: number;
  sprints: BacklogSprint[];
  onAssign(sprintId: string): void;
  onClearSelection(): void;
}

export default function MultiSelectActionBar({
  selectedCount,
  sprints,
  onAssign,
  onClearSelection,
}: MultiSelectActionBarProps) {
  const { t } = useTranslation('backlog');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const assignableSprints = sprints.filter((s) => s.status === 'planning' || s.status === 'active');

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  if (selectedCount === 0) return null;

  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-card)] px-4 py-2.5 shadow-lg">
      <span className="text-sm font-medium text-[var(--text)]">
        {t('storiesSelected', { count: selectedCount })}
      </span>

      <div className="relative" ref={dropdownRef}>
        <Button
          size="sm"
          onClick={() => setDropdownOpen((v) => !v)}
          disabled={assignableSprints.length === 0}
        >
          {t('assignToSprintButton')}
        </Button>

        {dropdownOpen && assignableSprints.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 min-w-[180px] rounded-lg border border-[var(--line)] bg-[var(--bg-card)] py-1 shadow-lg">
            {assignableSprints.map((sprint) => (
              <button
                key={sprint.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--bg-soft)]"
                onClick={() => {
                  setDropdownOpen(false);
                  onAssign(sprint.id);
                }}
              >
                {sprint.name}
                <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold ${sprint.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                  {sprint.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
        onClick={onClearSelection}
      >
        {t('clearSelection')}
      </button>
    </div>
  );
}
