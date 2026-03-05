name: project-understanding-confidence
description: "Assess AI onboarding confidence on an existing project by scanning repos/docs, scoring understanding readiness, and listing missing context."
author: "Nakiros"

# Workflow engine bootstrap
config_source: "{project-root}/.nakiros.yaml"
date: system-generated

# Workflow components
installed_path: "{project-root}/~/.nakiros/workflows/4-implementation/project-understanding-confidence"
instructions: "{installed_path}/instructions.xml"
validation: "{installed_path}/checklist.md"

# Runtime paths
project_config: "{project-root}/.nakiros.yaml"
profile_config: "~/.nakiros/config.yaml"
workspace_config: "{project-root}/.nakiros.workspace.yaml"
steps_dir: "{project-root}/.nakiros/workflows/steps"
workspace_confidence_dir: "{project-root}/.nakiros/workspace/confidence"
default_execution_repository_mode: "workspace-control"

# Defaults
default_communication_language: "Français"
default_document_language: "English"

# Scoring model
score_threshold_confident: 85
score_threshold_partial: 65
minimum_repo_coverage_percent: 100
weight_skill_coverage: 20
weight_project_understanding: 25
weight_documentation_ticket_readiness: 20
weight_testability_readiness: 20
weight_operational_readiness: 15
