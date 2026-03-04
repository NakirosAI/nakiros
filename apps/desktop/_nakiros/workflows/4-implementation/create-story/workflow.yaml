name: create-story
description: "Elicit and create implementation-ready story with PM persona, clear acceptance criteria, and scope boundaries"
author: "Nakiros"

# Workflow engine bootstrap (required by ~/.nakiros/core/tasks/workflow.xml)
config_source: "{project-root}/.nakiros.yaml"
date: system-generated

# Workflow components
installed_path: "{project-root}/~/.nakiros/workflows/4-implementation/create-story"
instructions: "{installed_path}/instructions.xml"
validation: "{installed_path}/checklist.md"

# Runtime paths
story_artifact_dir: "{project-root}/.nakiros/workflows/stories"
created_story_file: "{story_artifact_dir}/{{ticketId}}.json"

# PM defaults
pm_in_progress_status: "In Progress"
pm_review_status: "In Review"
pm_done_status: "Done"

# Defaults applied by instructions.xml after config merge
default_user_name: "Developer"
default_idle_threshold_minutes: 15
default_communication_language: "Français"
default_document_language: "English"
