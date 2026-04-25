import type { Project } from '@nakiros/shared';

import { ProposalsList } from '../components/recommendations/ProposalsList';

interface Props {
  project: Project;
}

export default function RecommendationsView({ project }: Props) {
  return <ProposalsList projectId={project.id} />;
}
