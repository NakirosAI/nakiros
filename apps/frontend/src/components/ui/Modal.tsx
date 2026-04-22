import { type ReactNode, useEffect } from 'react';
import clsx from 'clsx';

export type ModalSize = 'sm' | 'md' | 'lg';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  size?: ModalSize;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  className?: string;
  children: ReactNode;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  className,
  children,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="ui-modal-overlay fixed inset-0 z-[1000] flex items-center justify-center p-4"
      onClick={closeOnOverlayClick ? onClose : undefined}
      role="presentation"
    >
      <div
        className={clsx(
          'ui-modal-panel w-full rounded-xl border p-5 shadow-lg',
          SIZE_CLASSES[size],
          className,
        )}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {(title || showCloseButton) && (
          <header className="mb-4 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 text-sm font-bold text-[var(--text)]">
              {title}
            </div>
            {showCloseButton && (
              <button
                className="shrink-0 rounded border border-transparent px-2 py-0.5 text-lg leading-none text-[var(--text-muted)] hover:border-[var(--line)] hover:text-[var(--text)]"
                onClick={onClose}
                type="button"
                aria-label="Close"
              >
                ×
              </button>
            )}
          </header>
        )}

        {children}
      </div>
    </div>
  );
}
