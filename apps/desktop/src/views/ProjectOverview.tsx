import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, MessageSquare, Sparkles, Clock } from 'lucide-react';
import type { Project, ProjectConversation, Skill } from '@nakiros/shared';

interface Props {
  project: Project;
}

export default function ProjectOverview({ project }: Props) {
  const { t } = useTranslation('dashboard');
  const [conversations, setConversations] = useState<ProjectConversation[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      window.nakiros.listProjectConversations(project.id),
      window.nakiros.listProjectSkills(project.id),
    ]).then(([convs, sk]) => {
      setConversations(convs);
      setSkills(sk);
      setLoading(false);
    });
  }, [project.id]);

  const recentConversations = conversations.slice(0, 5);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="mb-1 text-lg font-bold text-[var(--text-primary)]">{project.name}</h2>
      <p className="mb-6 text-sm text-[var(--text-muted)]">{project.projectPath}</p>

      {/* Stats cards */}
      <div className="mb-8 grid grid-cols-4 gap-4">
        <StatCard
          icon={<MessageSquare size={18} />}
          label="Sessions"
          value={String(conversations.length)}
        />
        <StatCard
          icon={<Sparkles size={18} />}
          label="Skills"
          value={String(skills.length)}
        />
        <StatCard
          icon={<FolderOpen size={18} />}
          label="Provider"
          value={project.provider}
        />
        <StatCard
          icon={<Clock size={18} />}
          label="Last activity"
          value={project.lastActivityAt ? new Date(project.lastActivityAt).toLocaleDateString() : '—'}
        />
      </div>

      {/* Skills list */}
      {skills.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Skills ({skills.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {skills.map((skill) => (
              <div
                key={skill.name}
                className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-2"
              >
                <Sparkles size={14} className="text-[var(--primary)]" />
                <span className="text-sm font-medium">{skill.name}</span>
                <div className="flex gap-1">
                  {skill.hasEvals && <Badge label="evals" />}
                  {skill.hasReferences && <Badge label="refs" />}
                  {skill.hasTemplates && <Badge label="tpl" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent conversations */}
      {recentConversations.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Recent conversations
          </h3>
          <div className="flex flex-col gap-2">
            {recentConversations.map((conv) => (
              <div
                key={conv.sessionId}
                className="rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {conv.summary}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {new Date(conv.lastMessageAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-1 flex gap-3 text-xs text-[var(--text-muted)]">
                  <span>{conv.messageCount} messages</span>
                  {conv.gitBranch && <span>{conv.gitBranch}</span>}
                  {conv.toolsUsed.length > 0 && (
                    <span>{conv.toolsUsed.length} tools</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-4 py-3">
      <div className="mb-1 flex items-center gap-2 text-[var(--text-muted)]">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <span className="text-xl font-bold text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
      {label}
    </span>
  );
}
