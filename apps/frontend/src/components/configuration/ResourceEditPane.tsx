import type { ReactNode } from 'react';

import { MarkdownEditor } from '../markdown/MarkdownEditor';
import { CodeEditorPane } from '../ui/CodeEditorPane';

export type ResourceEditorKind = 'markdown' | 'code';

interface ResourceEditorMainProps {
  value: string;
  onChange(value: string): void;
  editorKind: ResourceEditorKind;
  exists: boolean;
  dirty: boolean;
  submitting: boolean;
  saveLabel: string;
  deleteLabel: string;
  onSave(): void;
  onDelete(): void;
  placeholder?: string;
  editorLabel?: string;
  toolbarLeading?: ReactNode;
}

interface ResourceEditPaneProps extends ResourceEditorMainProps {
  sidebar?: ReactNode;
}

/** Shared edit surface for provider-native configuration resources. */
export function ResourceEditPane({
  sidebar,
  ...editorProps
}: ResourceEditPaneProps) {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <ResourceEditorMain {...editorProps} />
      {sidebar}
    </div>
  );
}

/** Toolbar and editor body, reusable when a screen already owns its layout. */
export function ResourceEditorMain({
  value,
  onChange,
  editorKind,
  exists,
  dirty,
  submitting,
  saveLabel,
  deleteLabel,
  onSave,
  onDelete,
  placeholder,
  editorLabel,
  toolbarLeading,
}: ResourceEditorMainProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 overflow-auto px-7 pb-8 pt-4">
        <div className="flex min-h-8 items-center gap-1.5">
          {toolbarLeading}
          <span className="flex-1" />
          {exists && (
            <button
              type="button"
              onClick={onDelete}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-n-sm border border-n-critical/40 bg-transparent px-3 py-1.5 font-n-mono text-[11.5px] text-n-critical hover:bg-n-critical-soft disabled:opacity-50"
            >
              {deleteLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || submitting}
            className="inline-flex items-center gap-1.5 rounded-n-md border border-n-accent-line bg-n-accent-soft px-3 py-2 font-n-mono text-[12px] text-n-accent-strong hover:bg-n-accent-soft/80 disabled:opacity-50"
          >
            {saveLabel}
          </button>
        </div>

        {editorKind === 'markdown' ? (
          <MarkdownEditor value={value} onChange={onChange} placeholder={placeholder} />
        ) : (
          <div className="flex min-h-[480px] flex-1 overflow-hidden rounded-n-md border border-n-border-subtle bg-n-canvas">
            <CodeEditorPane
              value={value}
              onChange={onChange}
              aria-label={editorLabel}
              placeholder={placeholder}
              className="min-h-[480px] bg-n-canvas text-n-fg caret-n-accent placeholder:text-n-faint"
            />
          </div>
        )}
    </div>
  );
}
