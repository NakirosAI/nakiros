export interface Assignment {
  id: string;
  title: string;
  assignedAt: string;
  assignedBy?: string;
  repoName: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface InboxItem {
  assignment: Assignment;
  readAt?: string;
}
