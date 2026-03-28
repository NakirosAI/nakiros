import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { StoredWorkspace } from '@nakiros/shared';
import { EmptyPanel } from '../context/ContextPanelParts';

interface Props {
  workspace: StoredWorkspace;
  onNavigateToProduct?: () => void;
}

export default function StoryHubContextTab({ workspace, onNavigateToProduct }: Props) {
  const { t, i18n } = useTranslation('delivery');

  const hasContext = Boolean(workspace.context?.global);

  if (!hasContext) {
    return (
      <div className="p-4 overflow-y-auto h-full">
        <EmptyPanel
          icon={<BookOpen size={24} />}
          title={t('context.emptyTitle')}
          subtitle={t('context.emptyDesc')}
        />
        {onNavigateToProduct && (
          <div className="flex justify-center mt-2">
            <button
              type="button"
              onClick={onNavigateToProduct}
              className="text-xs font-medium text-[var(--primary)] hover:underline"
            >
              {t('context.goToProduct')}
            </button>
          </div>
        )}
      </div>
    );
  }

  const locale = i18n.language === 'fr' ? fr : undefined;
  const generatedAtDisplay = workspace.context?.generatedAt
    ? t('context.generatedAt', {
        time: formatDistanceToNow(new Date(workspace.context.generatedAt), {
          addSuffix: true,
          locale,
        }),
      })
    : null;

  return (
    <div className="p-4 overflow-y-auto h-full">
      {generatedAtDisplay && (
        <p className="mb-3 text-[11px] text-[var(--text-muted)]">{generatedAtDisplay}</p>
      )}
      <div className="prose prose-sm max-w-none text-[var(--text)]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {workspace.context!.global!}
        </ReactMarkdown>
      </div>
    </div>
  );
}
