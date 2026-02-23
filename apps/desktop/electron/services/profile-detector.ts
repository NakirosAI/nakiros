import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { AgentProfile } from '@tiqora/shared';

export function detectProfile(localPath: string): AgentProfile {
  const pkgPath = join(localPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
      if ('react-native' in deps) return 'mobile-rn';
      if ('react' in deps) return 'frontend-react';
      if ('vue' in deps) return 'frontend-vue';
      if ('@angular/core' in deps) return 'frontend-angular';
      if (
        'express' in deps ||
        'fastify' in deps ||
        '@nestjs/core' in deps ||
        'hapi' in deps ||
        '@hapi/hapi' in deps
      )
        return 'backend-node';
      return 'backend-node';
    } catch {
      return 'backend-node';
    }
  }

  if (existsSync(join(localPath, 'Cargo.toml'))) return 'backend-rust';

  if (
    existsSync(join(localPath, 'pyproject.toml')) ||
    existsSync(join(localPath, 'requirements.txt')) ||
    existsSync(join(localPath, 'setup.py'))
  )
    return 'backend-python';

  if (existsSync(join(localPath, 'go.mod'))) return 'backend-go';

  return 'generic';
}
