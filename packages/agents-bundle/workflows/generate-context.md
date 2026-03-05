name: generate-context
description: "Generate workspace context files: per-repo architecture docs and workspace-level synthesis (global-context, pm-context)."
author: "Nakiros"

# Workflow engine bootstrap
config_source: "{project-root}/.nakiros.yaml"
date: system-generated

# Workflow components
installed_path: "{project-root}/~/.nakiros/workflows/4-implementation/generate-context"
steps_path: "{installed_path}/steps"

# Runtime paths
project_config: "{project-root}/.nakiros.yaml"
profile_config: "~/.nakiros/config.yaml"
workspace_config: "{project-root}/.nakiros.workspace.yaml"

# Output paths — per repo
per_repo_context_dir: "{repo_localPath}/_nakiros/context"
per_repo_architecture: "{per_repo_context_dir}/architecture.md"

# Output paths — workspace level (global ~/.nakiros/workspaces/{workspace_name}/)
workspace_output_dir: "~/.nakiros/workspaces/{workspace_name}"
global_output: "{workspace_output_dir}/global-context.md"
pm_output: "{workspace_output_dir}/pm-context.md"
inter_repo_output: "{workspace_output_dir}/inter-repo.md"

# Findings paths — temporary, written by sub-agents, cleaned up after synthesis
arch_findings: "{per_repo_context_dir}/.findings/arch.json"
pm_findings: "{workspace_output_dir}/.findings/pm.json"
inter_repo_findings: "{workspace_output_dir}/.findings/inter-repo.json"

# Defaults
default_communication_language: "Français"
default_document_language: "English"
