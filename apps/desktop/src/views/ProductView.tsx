import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Clock, FileText, FolderOpen, Layers, Sparkles, X } from 'lucide-react';
import clsx from 'clsx';
import type {
  ArtifactChangeProposal,
  OnboardingChatLaunchRequest,
  ProductArtifactType,
  ProductArtifactVersion,
  StoredWorkspace,
} from '@nakiros/shared';
import { MarkdownViewer } from '../components/ui/MarkdownViewer';
import ProductDocChat from '../components/product/ProductDocChat';
import { Badge, Button } from '../components/ui';
import type { ArtifactReviewMutation } from '../hooks/useArtifactReview';
import { formatTokens } from '../components/context/ContextPanelParts';

interface Props {
  workspace: StoredWorkspace;
  onLaunchChat?(request: OnboardingChatLaunchRequest): void;
  onArtifactChangeProposal?: (event: {
    proposal: ArtifactChangeProposal;
    conversationId?: string | null;
    triggerMessageId?: string | null;
    baselineContentOverride?: string | null;
    alreadyApplied?: boolean;
  }) => void;
  lastArtifactReviewMutation?: ArtifactReviewMutation | null;
}

type SaveStatus = 'saved' | 'saving' | 'unsaved';

interface ProductDocSelection {
  path: string;
  title: string;
  treeLabel: string;
  artifactType: ProductArtifactType;
  kindLabel: string;
}

interface ProductTreeNode {
  kind: 'directory' | 'file';
  name: string;
  path: string;
  artifactType?: ProductArtifactType;
  children: ProductTreeNode[];
}

interface FeatureSummary {
  slug: string;
  title: string;
  primary: ProductDocSelection;
  allDocs: ProductDocSelection[];
  designDocs: ProductDocSelection[];
  storyDocs: ProductDocSelection[];
  hasSpec: boolean;
  badgeLabel: string;
  badgeClassName: string;
  subtitle: string;
}

const TREE_DEPTH_PADDING: Record<number, string> = {
  0: 'pl-3',
  1: 'pl-6',
  2: 'pl-9',
  3: 'pl-12',
  4: 'pl-16',
  5: 'pl-20',
};

function humanizeSegment(segment: string): string {
  const normalized = segment.replace(/[-_]+/g, ' ').trim();
  if (!normalized) return segment;
  const upperMap: Record<string, string> = {
    api: 'API',
    dod: 'DoD',
    nfr: 'NFR',
    ux: 'UX',
  };

  return normalized
    .split(' ')
    .filter(Boolean)
    .map((part) => upperMap[part.toLowerCase()] ?? (part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

function artifactTypeFromPath(path: string): ProductArtifactType {
  if (path.startsWith('features/') && path.includes('/stories/')) return 'story';
  if (path.startsWith('features/') && (path.includes('/design/') || /\/ux(\/|$)/.test(path))) return 'ux-design';
  if (path.startsWith('design/')) return 'ux-design';
  if (path.startsWith('architecture/')) return 'architecture';
  if (path.startsWith('sprints/')) return 'sprint';
  if (path.startsWith('features/')) return 'feature-spec';
  return 'prd';
}

function nodeWeight(parentPath: string, node: ProductTreeNode): number {
  const bareName = node.kind === 'file' ? node.name.replace(/\.md$/i, '') : node.name;

  if (!parentPath) {
    const rootWeights: Record<string, number> = {
      product: 0,
      personas: 1,
      dod: 2,
      nfr: 3,
      design: 4,
      features: 5,
      architecture: 6,
      sprints: 7,
    };
    return rootWeights[bareName] ?? 100;
  }

  if (parentPath === 'design') {
    const weights: Record<string, number> = { 'design-system': 0, navigation: 1 };
    return weights[bareName] ?? 100;
  }

  if (parentPath === 'architecture') {
    const weights: Record<string, number> = { index: 0, stack: 1, conventions: 2, api: 3 };
    return weights[bareName] ?? 100;
  }

  if (parentPath.startsWith('features/') && parentPath.split('/').length === 2) {
    const weights: Record<string, number> = { feature: 0, design: 1, stories: 2 };
    return weights[bareName] ?? 100;
  }

  return 100;
}

function sortTreeNodes(nodes: ProductTreeNode[], parentPath = ''): ProductTreeNode[] {
  for (const node of nodes) {
    if (node.kind === 'directory') {
      node.children = sortTreeNodes(node.children, node.path);
    }
  }

  return [...nodes].sort((left, right) => {
    const leftWeight = nodeWeight(parentPath, left);
    const rightWeight = nodeWeight(parentPath, right);
    if (leftWeight !== rightWeight) return leftWeight - rightWeight;
    if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { numeric: true });
  });
}

function buildTree(paths: string[]): ProductTreeNode[] {
  const root: ProductTreeNode = { kind: 'directory', name: '', path: '', children: [] };

  for (const filePath of paths) {
    const segments = filePath.split('/').filter(Boolean);
    let current = root;

    segments.forEach((segment, index) => {
      const currentPath = segments.slice(0, index + 1).join('/');
      const isLeaf = index === segments.length - 1;
      const targetKind: ProductTreeNode['kind'] = isLeaf ? 'file' : 'directory';
      let child = current.children.find((node) => node.name === segment && node.kind === targetKind);

      if (!child) {
        child = {
          kind: targetKind,
          name: segment,
          path: currentPath,
          artifactType: isLeaf ? artifactTypeFromPath(filePath) : undefined,
          children: [],
        };
        current.children.push(child);
      }

      current = child;
    });
  }

  return sortTreeNodes(root.children);
}

function selectionFromPath(path: string, translate: (key: string) => string): ProductDocSelection {
  const segments = path.split('/').filter(Boolean);
  const basename = segments[segments.length - 1] ?? path;
  const artifactType = artifactTypeFromPath(path);

  let title = humanizeSegment(basename);
  if (path === 'product') title = translate('productFileTitle');
  else if (path === 'personas') title = translate('personasFileTitle');
  else if (path === 'dod') title = translate('dodFileTitle');
  else if (path === 'nfr') title = translate('nfrFileTitle');
  else if (path === 'design/design-system') title = translate('designSystemFileTitle');
  else if (path === 'design/navigation') title = translate('navigationFileTitle');
  else if (path === 'architecture/index') title = translate('architectureIndexFileTitle');
  else if (path === 'architecture/stack') title = translate('architectureStackFileTitle');
  else if (path === 'architecture/conventions') title = translate('architectureConventionsFileTitle');
  else if (path === 'architecture/api') title = translate('architectureApiFileTitle');
  else if (path === 'sprints/current') title = translate('currentSprintFileTitle');
  else if (path.startsWith('features/') && basename === 'feature' && segments[1]) title = humanizeSegment(segments[1]!);

  const kindLabelByType: Record<ProductArtifactType, string> = {
    prd: translate('productKindWorkspace'),
    'feature-spec': translate('productKindFeature'),
    'ux-design': translate('productKindDesign'),
    architecture: translate('productKindArchitecture'),
    story: translate('productKindStory'),
    sprint: translate('productKindSprint'),
  };

  return {
    path,
    title,
    treeLabel: `${basename}.md`,
    artifactType,
    kindLabel: kindLabelByType[artifactType],
  };
}

async function loadArtifactPaths(workspace: StoredWorkspace): Promise<string[]> {
  return window.nakiros.artifactListContextFiles(workspace);
}

function buildFeatureSummaries(featuresNode: ProductTreeNode | undefined, translate: (key: string) => string): FeatureSummary[] {
  if (!featuresNode) return [];

  return featuresNode.children
    .filter((node) => node.kind === 'directory')
    .map((featureNode) => {
      const collectedPaths: string[] = [];

      const walk = (node: ProductTreeNode) => {
        if (node.kind === 'file') {
          collectedPaths.push(node.path);
          return;
        }
        node.children.forEach(walk);
      };

      walk(featureNode);

      const docs = collectedPaths
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
        .map((path) => selectionFromPath(path, translate));

      const specDoc = docs.find((doc) => doc.path === `${featureNode.path}/feature`);
      const designDocs = docs.filter((doc) =>
        doc.path.startsWith(`${featureNode.path}/design/`) || /\/ux(\/|$)/.test(doc.path),
      );
      const storyDocs = docs.filter((doc) => doc.path.startsWith(`${featureNode.path}/stories/`));
      const primary = specDoc ?? designDocs[0] ?? storyDocs[0] ?? docs[0]!;

      let badgeLabel = 'Draft';
      let badgeClassName = 'bg-[rgba(88,166,255,0.12)] text-[#58a6ff]';
      if ((specDoc && designDocs.length > 0 && storyDocs.length > 0) || storyDocs.length >= 5) {
        badgeLabel = 'Done';
        badgeClassName = 'bg-[rgba(63,185,80,0.12)] text-[var(--success)]';
      } else if (specDoc || designDocs.length > 0 || storyDocs.length > 0) {
        badgeLabel = 'WIP';
        badgeClassName = 'bg-[rgba(210,153,34,0.15)] text-[var(--warning)]';
      }

      const subtitleParts: string[] = [];
      if (specDoc) subtitleParts.push('Spec');
      if (designDocs.length > 0) subtitleParts.push('UX');
      if (storyDocs.length > 0) subtitleParts.push(`${storyDocs.length} stor${storyDocs.length > 1 ? 'ies' : 'y'}`);
      const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : `${docs.length} docs`;

      return {
        slug: featureNode.name,
        title: humanizeSegment(featureNode.name),
        primary,
        allDocs: docs,
        designDocs,
        storyDocs,
        hasSpec: Boolean(specDoc),
        badgeLabel,
        badgeClassName,
        subtitle,
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title, undefined, { numeric: true }));
}

export default function ProductView({
  workspace,
  onArtifactChangeProposal,
  lastArtifactReviewMutation,
}: Props) {
  const { t } = useTranslation('context');

  const [artifactPaths, setArtifactPaths] = useState<string[]>([]);
  const [contextFileSizes, setContextFileSizes] = useState<Map<string, number>>(new Map());
  const [contextTotalBytes, setContextTotalBytes] = useState<number | null>(null);
  const [selection, setSelection] = useState<ProductDocSelection | null>(null);
  const [docContent, setDocContent] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [showChat, setShowChat] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<ProductArtifactVersion[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [absoluteFilePath, setAbsoluteFilePath] = useState<string>('');
  const [activeFeatureSlug, setActiveFeatureSlug] = useState<string | null>(null);
  const [activeFeatureTab, setActiveFeatureTab] = useState<'spec' | 'ux' | 'stories'>('spec');

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docContentRef = useRef<string | null>(null);
  const selectionRef = useRef<ProductDocSelection | null>(null);

  const treeNodes = buildTree(artifactPaths);
  const rootFiles = treeNodes.filter((node) => node.kind === 'file');
  const designNode = treeNodes.find((node) => node.kind === 'directory' && node.name === 'design');
  const featuresNode = treeNodes.find((node) => node.kind === 'directory' && node.name === 'features');
  const architectureNode = treeNodes.find((node) => node.kind === 'directory' && node.name === 'architecture');
  const sprintsNode = treeNodes.find((node) => node.kind === 'directory' && node.name === 'sprints');
  const otherNodes = treeNodes.filter((node) => (
    node.kind === 'directory'
    && node.name !== 'design'
    && node.name !== 'features'
    && node.name !== 'architecture'
    && node.name !== 'sprints'
  ));
  const featureSummaries = buildFeatureSummaries(featuresNode, t);
  const activeFeatureSummary = featureSummaries.find((f) => f.slug === activeFeatureSlug) ?? null;

  useEffect(() => {
    docContentRef.current = docContent;
  }, [docContent]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    void window.nakiros.artifactListContextFilesWithSizes(workspace)
      .then((files) => {
        setArtifactPaths(files.map((f) => f.path));
        const sizeMap = new Map(files.map((f) => [f.path, f.sizeBytes]));
        setContextFileSizes(sizeMap);
        setContextTotalBytes(files.reduce((sum, f) => sum + f.sizeBytes, 0));
      })
      .catch(() => {
        setArtifactPaths([]);
        setContextFileSizes(new Map());
        setContextTotalBytes(null);
      });
  }, [workspace]);

  useEffect(() => {
    if (!selection) {
      setDocContent(null);
      setAbsoluteFilePath('');
      setVersions([]);
      setLoadingContent(false);
      return;
    }

    let cancelled = false;
    setLoadingContent(true);

    void window.nakiros.artifactGetFilePath(workspace, selection.path)
      .then((filePath) => {
        if (!cancelled) setAbsoluteFilePath(filePath);
      })
      .catch(() => {
        if (!cancelled) setAbsoluteFilePath('');
      });

    void window.nakiros.artifactReadFile(workspace, selection.path)
      .then((content) => {
        if (cancelled) return;
        setDocContent(content ?? '');
        setSaveStatus('saved');
      })
      .catch(() => {
        if (!cancelled) setDocContent('');
      })
      .finally(() => {
        if (!cancelled) setLoadingContent(false);
      });

    void window.nakiros.artifactListVersions(workspace.id, selection.path)
      .then((nextVersions) => {
        if (!cancelled) setVersions(nextVersions);
      })
      .catch(() => {
        if (!cancelled) setVersions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [selection?.path, workspace, workspace.id]);

  useEffect(() => {
    if (!lastArtifactReviewMutation) return;
    if (lastArtifactReviewMutation.target.kind !== 'workspace_doc') return;
    const currentSelection = selectionRef.current;
    if (!currentSelection) return;
    if (!lastArtifactReviewMutation.target.absolutePath.endsWith(`${currentSelection.path}.md`)) return;

    void window.nakiros.artifactReadFile(workspace, currentSelection.path)
      .then((content) => {
        if (content !== null) {
          setDocContent(content);
          setSaveStatus('saved');
          void loadArtifactPaths(workspace)
            .then((paths) => setArtifactPaths(paths))
            .catch(() => setArtifactPaths([]));
        }
      })
      .catch(() => {});
  }, [lastArtifactReviewMutation, workspace]);

  function handleEditorChange(markdown: string) {
    if (markdown === docContentRef.current) return;

    setDocContent(markdown);
    setSaveStatus('unsaved');

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const currentSelection = selectionRef.current;
    if (!currentSelection) return;

    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus('saving');

      void window.nakiros.artifactSaveVersion(workspace.id, workspace, {
        artifactPath: currentSelection.path,
        artifactType: currentSelection.artifactType,
        content: markdown,
      }).then(() => {
        setSaveStatus('saved');
        void loadArtifactPaths(workspace)
          .then((paths) => setArtifactPaths(paths))
          .catch(() => setArtifactPaths([]));
        void window.nakiros.artifactListVersions(workspace.id, currentSelection.path)
          .then(setVersions)
          .catch(() => {});
      });
    }, 1200);
  }

  function handleRestoreVersion(version: ProductArtifactVersion) {
    setDocContent(version.content);
    setSaveStatus('unsaved');
    setShowHistory(false);
  }

  function selectFeature(feature: FeatureSummary) {
    setActiveFeatureSlug(feature.slug);
    setActiveFeatureTab('spec');
    setShowHistory(false);
    setShowChat(false);
    setSelection(feature.primary);
  }

  function switchFeatureTab(tab: 'spec' | 'ux' | 'stories') {
    if (!activeFeatureSummary) return;
    setActiveFeatureTab(tab);
    setShowHistory(false);
    if (tab === 'spec') {
      setSelection(activeFeatureSummary.primary);
    } else if (tab === 'ux') {
      setSelection(activeFeatureSummary.designDocs[0] ?? null);
    } else {
      setSelection(null);
    }
  }

  function renderTreeNode(node: ProductTreeNode, depth: number): ReactNode {
    if (node.kind === 'directory') {
      const isActive = selection?.path === node.path || selection?.path.startsWith(`${node.path}/`);

      return (
        <div key={`dir-${node.path}`}>
          <div
            className={clsx(
              'flex items-center gap-2 py-2 pr-3 text-left',
              TREE_DEPTH_PADDING[depth] ?? TREE_DEPTH_PADDING[5],
              isActive ? 'text-[var(--text)]' : 'text-[var(--text-muted)]',
            )}
          >
            <ChevronDown size={12} className="shrink-0 opacity-60" />
            <FolderOpen size={13} className="shrink-0" />
            <div className="min-w-0 flex-1 truncate text-[11px] font-semibold">{node.name}/</div>
          </div>
          {node.children.map((child) => renderTreeNode(child, depth + 1))}
        </div>
      );
    }

    const item = selectionFromPath(node.path, t);
    const isSelected = selection?.path === item.path;
    const sizeBytes = contextFileSizes.get(item.path);
    const tokenBadge = sizeBytes != null && sizeBytes > 0 ? `~${formatTokens(sizeBytes)}` : null;

    return (
      <button
        key={item.path}
        type="button"
        onClick={() => {
          setActiveFeatureSlug(null);
          setSelection(item);
          setShowHistory(false);
        }}
        className={clsx(
          'flex w-full items-center gap-2 border-l-2 py-2 pr-3 text-left transition-colors',
          TREE_DEPTH_PADDING[depth] ?? TREE_DEPTH_PADDING[5],
          isSelected
            ? 'border-l-[var(--primary)] bg-[rgba(20,184,166,0.08)] text-[var(--text)]'
            : 'border-l-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text)]',
        )}
      >
        <FileText size={13} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium">{item.treeLabel}</div>
        </div>
        {tokenBadge && (
          <span className="shrink-0 text-[9px] text-[var(--text-muted)]">{tokenBadge}</span>
        )}
      </button>
    );
  }


  function renderDocButton(item: ProductDocSelection, depth: number, muted = false): ReactNode {
    const isSelected = selection?.path === item.path;
    const sizeBytes = contextFileSizes.get(item.path);
    const tokenBadge = sizeBytes != null && sizeBytes > 0 ? `~${formatTokens(sizeBytes)}` : null;

    return (
      <button
        key={item.path}
        type="button"
        onClick={() => {
          setActiveFeatureSlug(null);
          setSelection(item);
          setShowHistory(false);
        }}
        className={clsx(
          'flex w-full items-center gap-2 border-l-2 py-2 pr-3 text-left transition-colors',
          TREE_DEPTH_PADDING[depth] ?? TREE_DEPTH_PADDING[5],
          isSelected
            ? 'border-l-[var(--primary)] bg-[rgba(20,184,166,0.08)] text-[var(--text)]'
            : muted
              ? 'border-l-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text)]'
              : 'border-l-transparent bg-transparent text-[var(--text)] hover:bg-[var(--bg-muted)] hover:text-[var(--text)]',
        )}
      >
        <FileText size={13} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium">{item.treeLabel}</div>
        </div>
        {tokenBadge && (
          <span className="shrink-0 text-[9px] text-[var(--text-muted)]">{tokenBadge}</span>
        )}
      </button>
    );
  }

  function renderSectionTitle(label: string): ReactNode {
    return (
      <div className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {label}
      </div>
    );
  }

  const saveStatusLabel = saveStatus === 'saving'
    ? t('docEditorSaving')
    : saveStatus === 'unsaved'
      ? t('docEditorUnsaved')
      : t('docEditorSaved');

  function handleInternalLinkClick(href: string) {
    const currentPath = selectionRef.current?.path ?? '';
    const currentDir = currentPath.includes('/') ? currentPath.slice(0, currentPath.lastIndexOf('/')) : '';
    const segments = [...(currentDir ? currentDir.split('/') : []), ...href.replace(/\.md$/i, '').split('/')];
    const resolved: string[] = [];
    for (const part of segments) {
      if (part === '.') continue;
      if (part === '..') resolved.pop();
      else if (part) resolved.push(part);
    }
    const resolvedPath = resolved.join('/');
    if (artifactPaths.includes(resolvedPath)) {
      setActiveFeatureSlug(null);
      setSelection(selectionFromPath(resolvedPath, t));
      setShowHistory(false);
    }
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-1 overflow-hidden">
      <div className="flex w-80 shrink-0 flex-col overflow-hidden border-r border-[var(--line)] bg-[var(--bg-soft)]">
        <div className="shrink-0 border-b border-[var(--line)] px-3 py-3">
          <div className="flex items-center gap-1.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">context/</div>
            {contextTotalBytes != null && contextTotalBytes > 0 && (
              <span className="rounded bg-[var(--bg-soft)] px-1 py-px text-[9px] text-[var(--text-muted)]">
                ~{formatTokens(contextTotalBytes)} tokens
              </span>
            )}
          </div>
          <div className="mt-1 text-[12px] text-[var(--text-muted)]">{workspace.name}</div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {treeNodes.length === 0 ? (
            <div className="px-3 py-4 text-[12px] text-[var(--text-muted)]">{t('productTreeEmpty')}</div>
          ) : (
            <>
              {rootFiles.length > 0 && (
                <>
                  {renderSectionTitle(t('productVisionSection'))}
                  {rootFiles.map((node) => renderDocButton(selectionFromPath(node.path, t), 0))}
                </>
              )}

              {designNode && (
                <>
                  {renderSectionTitle(t('productDesignSection'))}
                  {designNode.children.map((node) => renderTreeNode(node, 1))}
                </>
              )}

              {featuresNode && (
                <>
                  {renderSectionTitle(t('productFeaturesSection'))}
                  <div className="space-y-1 px-2">
                    {featureSummaries.map((feature) => {
                      const isActiveFeature = activeFeatureSlug === feature.slug;
                      return (
                        <button
                          key={feature.slug}
                          type="button"
                          onClick={() => selectFeature(feature)}
                          className={clsx(
                            'flex w-full items-center gap-2 rounded-[10px] border px-3 py-2 text-left transition-colors',
                            isActiveFeature
                              ? 'border-[var(--primary)] bg-[rgba(20,184,166,0.08)] text-[var(--text)]'
                              : 'border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text)]',
                          )}
                        >
                          <Layers size={14} className="shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-semibold text-[var(--text)]">{feature.title}</div>
                            <div className="truncate text-[10px] text-[var(--text-muted)]">
                              {feature.subtitle}
                              {(() => {
                                const total = feature.allDocs.reduce((sum, doc) => sum + (contextFileSizes.get(doc.path) ?? 0), 0);
                                return total > 0 ? ` · ~${formatTokens(total)}` : null;
                              })()}
                            </div>
                          </div>
                          <span className={clsx('shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold', feature.badgeClassName)}>
                            {feature.badgeLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {architectureNode && (
                <>
                  {renderSectionTitle(t('productArchitectureSection'))}
                  {architectureNode.children.map((node) => renderTreeNode(node, 1))}
                </>
              )}

              {sprintsNode && (
                <>
                  {renderSectionTitle(t('productSprintsSection'))}
                  {sprintsNode.children.map((node) => renderTreeNode(node, 1))}
                </>
              )}

              {otherNodes.map((node) => (
                <div key={node.path}>
                  {renderSectionTitle(humanizeSegment(node.name))}
                  {node.children.map((child) => renderTreeNode(child, 1))}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {activeFeatureSlug && activeFeatureSummary ? (
        /* ── Feature detail view with tabs ── */
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Feature header */}
          <div className="shrink-0 border-b border-[var(--line)] bg-[var(--bg-soft)] px-5 pt-4">
            <div className="mb-3 flex items-start gap-3">
              <Layers size={20} className="mt-0.5 shrink-0 text-[var(--primary)]" />
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-bold text-[var(--text)]">{activeFeatureSummary.title}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={clsx('rounded px-1.5 py-0.5 text-[10px] font-bold', activeFeatureSummary.badgeClassName)}>
                    {activeFeatureSummary.badgeLabel}
                  </span>
                  {activeFeatureSummary.hasSpec && (
                    <span className="rounded border border-[var(--line)] bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                      {t('productFeatureMetaSpec')}
                    </span>
                  )}
                  {activeFeatureSummary.designDocs.length > 0 && (
                    <span className="rounded border border-[var(--line)] bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                      {t('productFeatureMetaUX')}
                    </span>
                  )}
                  {activeFeatureSummary.storyDocs.length > 0 && (
                    <span className="rounded border border-[var(--line)] bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                      {activeFeatureSummary.storyDocs.length} stories
                    </span>
                  )}
                </div>
              </div>
              <Button size="sm" variant="default" onClick={() => setShowChat((v) => !v)}>
                <Sparkles data-icon="inline-start" size={12} />
                {showChat ? t('productAgentClose') : t('productAgentOpen')}
              </Button>
            </div>
            {/* Tabs */}
            <div className="flex">
              {(['spec', 'ux', 'stories'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => switchFeatureTab(tab)}
                  className={clsx(
                    'border-b-2 px-4 py-2 text-[12px] font-semibold transition-colors',
                    activeFeatureTab === tab
                      ? 'border-[var(--primary)] text-[var(--primary)]'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]',
                  )}
                >
                  {tab === 'spec' && t('productFeatureTabSpec')}
                  {tab === 'ux' && t('productFeatureTabUX')}
                  {tab === 'stories' && (
                    <>
                      {t('productFeatureTabStories')}
                      {activeFeatureSummary.storyDocs.length > 0 && (
                        <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded bg-[var(--bg-muted)] px-1 text-[10px] font-bold text-[var(--text-muted)]">
                          {activeFeatureSummary.storyDocs.length}
                        </span>
                      )}
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          {activeFeatureTab === 'stories' && !selection ? (
            /* Stories list */
            <div className="flex-1 overflow-y-auto bg-[var(--bg)] p-5">
              {activeFeatureSummary.storyDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <FileText size={28} className="opacity-30" />
                  <p className="text-[13px] font-semibold text-[var(--text)]">{t('productFeatureNoStories')}</p>
                  <p className="text-[12px] text-[var(--text-muted)]">{t('productFeatureNoStoriesBody')}</p>
                  <Button size="sm" variant="default" onClick={() => setShowChat(true)}>
                    <Sparkles data-icon="inline-start" size={12} />
                    {t('productCreateWithAgent')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeFeatureSummary.storyDocs.map((doc) => (
                    <button
                      key={doc.path}
                      type="button"
                      onClick={() => setSelection(doc)}
                      className="flex w-full items-start gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] px-4 py-3 text-left transition-colors hover:border-[var(--line-strong)]"
                    >
                      <span className="mt-0.5 shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
                        {doc.path.split('/').pop()?.replace(/\.md$/i, '') ?? ''}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-semibold text-[var(--text)]">{doc.title}</div>
                      </div>
                      <FileText size={12} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Editor panel (spec, ux, or story detail) */
            <div className="flex flex-1 overflow-hidden">
              <div className={clsx('grid min-w-0 flex-1 overflow-hidden', showChat ? 'grid-cols-[minmax(0,1fr)_380px]' : 'grid-cols-1')}>
                <div className="flex min-w-0 flex-col overflow-hidden border-r border-[var(--line)]">
                  {/* Back to list (stories tab only) */}
                  {activeFeatureTab === 'stories' && selection && (
                    <div className="shrink-0 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-1.5">
                      <button
                        type="button"
                        onClick={() => setSelection(null)}
                        className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
                      >
                        ← {t('productFeatureBackToList')}
                      </button>
                    </div>
                  )}
                  {selection ? (
                    <>
                      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-2">
                        <div className="flex flex-1 items-center gap-2">
                          <Badge variant="muted" className="text-[10px]">{selection.treeLabel}</Badge>
                          <span className={clsx(
                            'text-[10px]',
                            saveStatus === 'unsaved' && 'text-[#f59e0b]',
                            saveStatus === 'saving' && 'italic text-[var(--text-muted)]',
                            saveStatus === 'saved' && 'text-[var(--text-muted)]',
                          )}>
                            {saveStatusLabel}
                          </span>
                        </div>
                        {versions.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowHistory((v) => !v)}
                            className={clsx(
                              'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors',
                              showHistory
                                ? 'border-[var(--primary)] bg-[rgba(20,184,166,0.08)] text-[var(--primary)]'
                                : 'border-[var(--line)] bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]',
                            )}
                          >
                            <Clock size={11} />
                            v{versions[versions.length - 1]?.version ?? 1}
                          </button>
                        )}
                      </div>
                      {loadingContent ? (
                        <div className="flex flex-1 items-center justify-center bg-[var(--bg)]">
                          <p className="text-[12px] italic text-[var(--text-muted)]">Chargement…</p>
                        </div>
                      ) : docContent === '' || docContent === null ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[var(--bg)] px-6 text-center">
                          <div className="opacity-20"><FileText size={32} /></div>
                          <div>
                            <p className="text-[13px] font-semibold text-[var(--text)]">{t('productEmptyDocTitle')}</p>
                            <p className="mt-1 text-[12px] text-[var(--text-muted)]">{t('productEmptyDocBody')}</p>
                          </div>
                          <Button size="sm" variant="default" onClick={() => setShowChat(true)}>
                            <Sparkles data-icon="inline-start" size={12} />
                            {t('productCreateWithAgent')}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex-1 overflow-hidden">
                          <MarkdownViewer content={docContent} className="h-full" onInternalLinkClick={handleInternalLinkClick} />
                        </div>
                      )}
                    </>
                  ) : (
                    /* Empty state for spec/ux tabs */
                    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[var(--bg)] px-6 text-center">
                      <div className="opacity-20"><FileText size={32} /></div>
                      <div>
                        <p className="text-[13px] font-semibold text-[var(--text)]">
                          {activeFeatureTab === 'ux' ? t('productFeatureNoUX') : t('productFeatureNoSpec')}
                        </p>
                        <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                          {activeFeatureTab === 'ux' ? t('productFeatureNoUXBody') : t('productFeatureNoSpecBody')}
                        </p>
                      </div>
                      <Button size="sm" variant="default" onClick={() => setShowChat(true)}>
                        <Sparkles data-icon="inline-start" size={12} />
                        {t('productCreateWithAgent')}
                      </Button>
                    </div>
                  )}
                </div>

                {showChat && absoluteFilePath && docContent !== null && selection && (
                  <div className="min-w-0 overflow-hidden">
                    <ProductDocChat
                      workspace={workspace}
                      absolutePath={absoluteFilePath}
                      artifactType={selection.artifactType}
                      artifactTitle={selection.title}
                      onClose={() => setShowChat(false)}
                      onArtifactChangeProposal={onArtifactChangeProposal}
                    />
                  </div>
                )}
              </div>

              {showHistory && versions.length > 0 && (
                <div className="flex w-64 shrink-0 flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--bg-soft)]">
                  <div className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-3 py-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                      {t('productHistoryTitle')}
                    </span>
                    <button type="button" onClick={() => setShowHistory(false)} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                      <X size={13} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto py-1">
                    {[...versions].reverse().map((version) => (
                      <button
                        key={version.id}
                        type="button"
                        onClick={() => handleRestoreVersion(version)}
                        className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-[var(--bg-muted)]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-[var(--text)]">v{version.version}</span>
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {new Date(version.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        {version.author && (
                          <span className="text-[10px] text-[var(--text-muted)]">{version.author}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : !selection ? (
        /* Global empty state */
        <div className="flex flex-1 items-center justify-center bg-[var(--bg)]">
          <div className="flex flex-col items-center gap-3 text-center">
            <Layers size={32} className="opacity-20" />
            <p className="text-[13px] font-medium text-[var(--text)]">{t('productSelectionEmptyTitle')}</p>
            <p className="text-[12px] text-[var(--text-muted)]">{t('productSelectionEmptyBody')}</p>
          </div>
        </div>
      ) : (
        /* Non-feature doc editor */
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[var(--bg-soft)] px-5 py-3">
            <FileText size={16} className="shrink-0 text-[var(--text-muted)]" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[14px] font-bold text-[var(--text)]">{selection.title}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="muted" className="text-[10px]">
                  {selection.kindLabel}
                </Badge>
                <span className="truncate text-[10px] text-[var(--text-muted)]">
                  {`context/${selection.path}.md`}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {versions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowHistory((value) => !value)}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors',
                    showHistory
                      ? 'border-[var(--primary)] bg-[rgba(20,184,166,0.08)] text-[var(--primary)]'
                      : 'border-[var(--line)] bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]',
                  )}
                >
                  <Clock size={11} />
                  v{versions[versions.length - 1]?.version ?? 1}
                </button>
              )}
              <Button size="sm" variant="default" onClick={() => setShowChat((value) => !value)}>
                <Sparkles data-icon="inline-start" size={12} />
                {showChat ? t('productAgentClose') : t('productAgentOpen')}
              </Button>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            <div className={clsx('grid min-w-0 flex-1 overflow-hidden', showChat ? 'grid-cols-[minmax(0,1fr)_380px]' : 'grid-cols-1')}>
              <div className="flex min-w-0 flex-col overflow-hidden border-r border-[var(--line)]">
                <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-2">
                  <div className="flex flex-1 items-center gap-2">
                    <Badge variant="muted" className="text-[10px]">
                      {selection.treeLabel}
                    </Badge>
                    <span
                      className={clsx(
                        'text-[10px]',
                        saveStatus === 'unsaved' && 'text-[#f59e0b]',
                        saveStatus === 'saving' && 'italic text-[var(--text-muted)]',
                        saveStatus === 'saved' && 'text-[var(--text-muted)]',
                      )}
                    >
                      {saveStatusLabel}
                    </span>
                  </div>
                </div>

                {loadingContent ? (
                  <div className="flex flex-1 items-center justify-center bg-[var(--bg)]">
                    <p className="text-[12px] italic text-[var(--text-muted)]">Chargement…</p>
                  </div>
                ) : docContent === '' || docContent === null ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[var(--bg)] px-6 text-center">
                    <div className="opacity-20">
                      <FileText size={32} />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-[var(--text)]">{t('productEmptyDocTitle')}</p>
                      <p className="mt-1 text-[12px] text-[var(--text-muted)]">{t('productEmptyDocBody')}</p>
                    </div>
                    <Button size="sm" variant="default" onClick={() => setShowChat(true)}>
                      <Sparkles data-icon="inline-start" size={12} />
                      {t('productCreateWithAgent')}
                    </Button>
                  </div>
                ) : (
                  <div className="flex-1 overflow-hidden">
                    <MarkdownViewer content={docContent} className="h-full" onInternalLinkClick={handleInternalLinkClick} />
                  </div>
                )}
              </div>

              {showChat && absoluteFilePath && docContent !== null && (
                <div className="min-w-0 overflow-hidden">
                  <ProductDocChat
                    workspace={workspace}
                    absolutePath={absoluteFilePath}
                    artifactType={selection.artifactType}
                    artifactTitle={selection.title}
                    onClose={() => setShowChat(false)}
                    onArtifactChangeProposal={onArtifactChangeProposal}
                  />
                </div>
              )}
            </div>

            {showHistory && versions.length > 0 && (
              <div className="flex w-64 shrink-0 flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--bg-soft)]">
                <div className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-3 py-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    {t('productHistoryTitle')}
                  </span>
                  <button type="button" onClick={() => setShowHistory(false)} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                    <X size={13} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto py-1">
                  {[...versions].reverse().map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => handleRestoreVersion(version)}
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-[var(--bg-muted)]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[var(--text)]">v{version.version}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {new Date(version.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {version.author && (
                        <span className="text-[10px] text-[var(--text-muted)]">{version.author}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
