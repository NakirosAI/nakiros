import type { AgentProfile } from '@tiqora/shared';

export const PROFILE_LABELS: Record<AgentProfile, string> = {
  'frontend-react': 'React',
  'frontend-vue': 'Vue',
  'frontend-angular': 'Angular',
  'backend-node': 'Node.js',
  'backend-python': 'Python',
  'backend-rust': 'Rust',
  'backend-go': 'Go',
  'mobile-rn': 'React Native',
  fullstack: 'Fullstack',
  generic: 'Générique',
};

export const PROFILE_COLORS: Record<AgentProfile, string> = {
  'frontend-react': '#61dafb',
  'frontend-vue': '#42b883',
  'frontend-angular': '#dd0031',
  'backend-node': '#68a063',
  'backend-python': '#3776ab',
  'backend-rust': '#ce4a00',
  'backend-go': '#00add8',
  'mobile-rn': '#0088cc',
  fullstack: '#8b5cf6',
  generic: '#6b7280',
};
