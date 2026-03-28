export type ProductArtifactType = 'prd' | 'feature-spec' | 'ux-design' | 'architecture' | 'story' | 'sprint';

export interface ProductArtifactVersion {
  id: string;
  workspaceId: string;
  artifactPath: string;
  artifactType: ProductArtifactType;
  epicId: string | null;
  content: string;
  author: string | null;
  version: number;
  createdAt: number;
}

export interface SaveProductArtifactInput {
  artifactPath: string;
  artifactType: ProductArtifactType;
  epicId?: string | null;
  content: string;
}
