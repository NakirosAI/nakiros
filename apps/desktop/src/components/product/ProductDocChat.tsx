import { useMemo, useState } from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';
import type {
  ArtifactChangeProposal,
  ArtifactContext,
  ProductArtifactType,
  StoredWorkspace,
} from '@nakiros/shared';
import AgentPanel from '../AgentPanel';

interface Props {
  workspace: StoredWorkspace;
  absolutePath: string;
  artifactType: ProductArtifactType;
  artifactTitle: string;
  onClose(): void;
  onArtifactChangeProposal?: (event: {
    proposal: ArtifactChangeProposal;
    conversationId?: string | null;
    triggerMessageId?: string | null;
    baselineContentOverride?: string | null;
    alreadyApplied?: boolean;
  }) => void | Promise<void>;
}

const AGENT_BY_TYPE: Record<ProductArtifactType, { agentId: string; command: string; label: string }> = {
  prd: { agentId: 'pm', command: '/nak-agent-pm', label: 'Agent PM' },
  'feature-spec': { agentId: 'pm', command: '/nak-agent-pm', label: 'Agent PM' },
  'ux-design': { agentId: 'ux-designer', command: '/nak-agent-ux-designer', label: 'UX Designer' },
  architecture: { agentId: 'architect', command: '/nak-agent-architect', label: 'Architect' },
  story: { agentId: 'sm', command: '/nak-agent-sm', label: 'SM' },
  sprint: { agentId: 'sm', command: '/nak-agent-sm', label: 'SM' },
};

export default function ProductDocChat({
  workspace,
  absolutePath,
  artifactType,
  artifactTitle,
  onClose,
  onArtifactChangeProposal,
}: Props) {
  // resetKey allows "Nouveau" to restart the agent session
  const [resetKey, setResetKey] = useState(0);

  const agentDef = AGENT_BY_TYPE[artifactType];

  const launchRequest = useMemo(() => {
    const artifactContext: ArtifactContext = {
      target: { kind: 'workspace_doc', absolutePath },
      mode: 'diff',
      sourceSurface: 'product',
      title: artifactTitle,
    };
    return {
      requestId: `product-doc-${artifactType}-${absolutePath}-${resetKey}`,
      title: artifactTitle,
      agentId: agentDef.agentId,
      command: agentDef.command,
      initialMessage: agentDef.command,
      artifactContext,
    };
  }, [absolutePath, artifactTitle, artifactType, agentDef, resetKey]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg)]">
      {/* Compact header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2">
        <Sparkles size={13} className="shrink-0 text-[var(--primary)]" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--text)]">
          {agentDef.label} — {artifactTitle}
        </span>
        <button
          type="button"
          onClick={() => setResetKey((k) => k + 1)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text)]"
          aria-label="Nouvelle session"
          title="Nouvelle session"
        >
          <RefreshCw size={12} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text)]"
          aria-label="Fermer"
        >
          <X size={14} />
        </button>
      </div>

      {/* Agent launches immediately */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <AgentPanel
          key={launchRequest.requestId}
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          repos={workspace.repos}
          workspacePath={workspace.workspacePath}
          hideTabs
          launchChatRequest={launchRequest}
          onArtifactChangeProposal={onArtifactChangeProposal}
        />
      </div>
    </div>
  );
}
