import type { LanguagePreference, ResolvedLanguage, ResolvedTheme } from '@tiqora/shared';

type Dictionary = {
  loadingWorkspace: string;
  workspaceLoadError: string;
  appName: string;
  home: {
    title: string;
    subtitle: string;
    openWorkspace: string;
    openWorkspaceHint: string;
    createWorkspace: string;
    createWorkspaceHint: string;
    recent: string;
    noRecent: string;
    now: string;
    minutesAgo: (n: number) => string;
    hoursAgo: (n: number) => string;
    daysAgo: (n: number) => string;
  };
  dashboard: {
    home: string;
    chatAgent: string;
    newWorkspace: string;
    openWorkspace: string;
    closeTab: string;
    noOtherWorkspace: string;
    openedWorkspaceTabs: string;
    repoCount: (n: number) => string;
    topologyMono: string;
    topologyMulti: string;
    noRepo: string;
  };
  sidebar: {
    overview: string;
    product: string;
    delivery: string;
    settings: string;
  };
  board: {
    searchPlaceholder: string;
    newTicket: string;
    noTicketsTitle: string;
    noTicketsHint: string;
    createFirstTicket: string;
    emptyColumn: string;
    emptyColumnSearch: string;
  };
  settings: {
    title: string;
    subtitle: string;
    appearanceTitle: string;
    themeLabel: string;
    themeSystem: string;
    themeLight: string;
    themeDark: string;
    resolvedTheme: (theme: ResolvedTheme) => string;
    languageTitle: string;
    languageLabel: string;
    languageSystem: string;
    languageFrench: string;
    languageEnglish: string;
    agentProviderTitle: string;
    agentCliStatusTitle: string;
    agentCliStatusChecking: string;
    agentCliStatusMissingWarning: string;
    agentCliStatusVersionUnknown: string;
    agentProviderClaude: string;
    agentProviderCodex: string;
    agentProviderCursor: string;
    saveSuccess: string;
    saveError: string;
    mcpServerTitle: string;
    mcpServerLabel: string;
    mcpServerPlaceholder: string;
    mcpServerHint: string;
    agentsTitle: string;
    agentsSubtitle: string;
    repoLabel: string;
    noRepoConfigured: string;
    noTiqoraConfig: string;
    targetsLabel: string;
    envCursor: string;
    envCodex: string;
    envClaude: string;
    envDetected: string;
    envNotDetected: string;
    installAction: string;
    refreshing: string;
    installing: string;
    installSuccess: string;
    installError: string;
    installResult: (summary: string) => string;
    globalAgentsTitle: string;
    globalAgentsSubtitle: string;
    globalAgentsStatus: (installed: number, total: number) => string;
    globalAgentsInstallAction: string;
    globalAgentsInstalling: string;
    globalAgentsSuccess: (added: number, updated: number) => string;
    globalAgentsError: string;
    // Project settings
    projectTitle: string;
    projectSubtitle: string;
    mcpTitle: string;
    mcpSubtitle: string;
    mcpAdd: string;
    mcpName: string;
    mcpCommand: string;
    mcpArgs: string;
    mcpEnvVars: string;
    mcpEnvKey: string;
    mcpEnvValue: string;
    mcpAddEnvVar: string;
    mcpSave: string;
    mcpCancel: string;
    mcpDelete: string;
    docsTitle: string;
    docsSubtitle: string;
    docsAddFile: string;
    docsAddUrl: string;
    docsLabelPlaceholder: string;
    docsUrlPlaceholder: string;
    docsDelete: string;
    // Navigation sections
    navGeneral: string;
    navGit: string;
    navPM: string;
    navMCPs: string;
    navContext: string;
    workflowAvailabilityTitle: string;
    workflowAvailabilitySubtitle: string;
    workflowStatusStable: string;
    workflowStatusBeta: string;
    workflowBetaHint: string;
    // General section
    projectNameLabel: string;
    docLangLabel: string;
    docLangHint: string;
    // Git section
    gitTitle: string;
    gitSubtitle: string;
    branchPatternLabel: string;
    branchPatternPlaceholder: string;
    reposTitle: string;
    reposAdd: string;
    reposClone: string;
    repoRemove: string;
    cloneUrlPlaceholder: string;
    cloneDestLabel: string;
    cloneDestNone: string;
    cloneAction: string;
    cloneInProgress: string;
    cloneSuccess: string;
    cloneError: string;
    repoRole: string;
    repoProfile: string;
    // PM Tool section
    pmTitle: string;
    pmSubtitle: string;
    pmNone: string;
    jiraUrl: string;
    jiraProjectKey: string;
    jiraBoardId: string;
    jiraOAuthSoon: string;
    pmComingSoon: string;
    // Jira OAuth
    jiraAuthSection: string;
    jiraConnectBtn: string;
    jiraConnecting: string;
    jiraConnectedAs: (name: string, url: string) => string;
    jiraDisconnect: string;
    jiraSyncSection: string;
    jiraSyncBtn: string;
    jiraSyncing: string;
    jiraSyncSuccess: (imported: number, updated: number) => string;
    jiraSyncError: string;
    jiraAuthError: string;
    jiraStatusChecking: string;
    // Jira project picker
    jiraProjectLabel: string;
    jiraProjectPlaceholder: string;
    jiraProjectLoading: string;
  };
  toast: {
    contextCopied: (ticketId: string) => string;
    contextCopyError: string;
  };
};

const fr: Dictionary = {
  loadingWorkspace: "Chargement de l'espace de travail…",
  workspaceLoadError: 'Impossible de charger les workspaces locaux. Vérifie les permissions dossier.',
  appName: 'Tiqora',
  home: {
    title: 'Tiqora',
    subtitle: "Orchestration multi-repo avec un flux local rapide. Les workspaces sont stockés localement par Tiqora, avec repos optionnels.",
    openWorkspace: 'Ouvrir un workspace',
    openWorkspaceHint: 'Sélectionner un dossier repo ou un dossier Tiqora',
    createWorkspace: 'Créer un workspace',
    createWorkspaceHint: 'Configurer un nouveau projet guidé',
    recent: 'Workspaces récents',
    noRecent: 'Aucun workspace récent. Commence par créer ton premier workspace.',
    now: "à l'instant",
    minutesAgo: (n) => `il y a ${n} min`,
    hoursAgo: (n) => `il y a ${n}h`,
    daysAgo: (n) => `il y a ${n}j`,
  },
  dashboard: {
    home: 'Accueil',
    chatAgent: 'Chat IA',
    newWorkspace: 'Nouveau',
    openWorkspace: 'Ouvrir un workspace',
    closeTab: 'Fermer',
    noOtherWorkspace: 'Tous les workspaces sont déjà ouverts.',
    openedWorkspaceTabs: 'Workspaces ouverts',
    repoCount: (n) => `${n} repo${n > 1 ? 's' : ''}`,
    topologyMono: 'Mono-repo',
    topologyMulti: 'Multi-repo',
    noRepo: 'Aucun repo dans ce workspace.',
  },
  sidebar: {
    overview: 'Overview',
    product: 'Product',
    delivery: 'Delivery',
    settings: 'Réglages',
  },
  board: {
    searchPlaceholder: 'Rechercher un ticket (id ou titre)',
    newTicket: 'Nouveau ticket',
    noTicketsTitle: 'Aucun ticket pour le moment',
    noTicketsHint: 'Commence par une tâche backlog pour lancer le workflow.',
    createFirstTicket: 'Créer le premier ticket',
    emptyColumn: 'Aucun ticket.',
    emptyColumnSearch: 'Aucun résultat dans cette colonne.',
  },
  settings: {
    title: 'Paramètres interface',
    subtitle: "Personnalise l'apparence et la langue de l'application.",
    appearanceTitle: 'Apparence',
    themeLabel: 'Thème',
    themeSystem: 'Système',
    themeLight: 'Clair',
    themeDark: 'Sombre',
    resolvedTheme: (theme) => `Thème actif: ${theme === 'dark' ? 'sombre' : 'clair'}`,
    languageTitle: 'Langue',
    languageLabel: "Langue de l'interface",
    languageSystem: 'Système',
    languageFrench: 'Français',
    languageEnglish: 'English',
    agentProviderTitle: "Moteur d'agent",
    agentCliStatusTitle: 'CLIs détectés',
    agentCliStatusChecking: 'Détection des CLIs…',
    agentCliStatusMissingWarning: "Le provider sélectionné n'est pas installé localement.",
    agentCliStatusVersionUnknown: 'version inconnue',
    agentProviderClaude: 'Claude Code CLI',
    agentProviderCodex: 'Codex CLI',
    agentProviderCursor: 'Cursor Agent CLI',
    saveSuccess: 'Préférences enregistrées.',
    saveError: "Impossible d'enregistrer les préférences.",
    mcpServerTitle: 'Serveur MCP',
    mcpServerLabel: 'URL du serveur MCP',
    mcpServerPlaceholder: 'http://localhost:3737',
    mcpServerHint: 'Laissez vide pour utiliser le serveur local.',
    agentsTitle: 'Agents CLI',
    agentsSubtitle: 'Installe ou mets à jour les commandes/agents Tiqora dans les repos du workspace.',
    repoLabel: 'Repo cible',
    noRepoConfigured: "Aucun repo configuré dans ce workspace.",
    noTiqoraConfig: "Ce repo n'a pas de fichier .tiqora.yaml (l'installation peut être incomplète).",
    targetsLabel: 'Environnements',
    envCursor: 'Cursor',
    envCodex: 'Codex',
    envClaude: 'Claude Code',
    envDetected: 'détecté',
    envNotDetected: 'non détecté',
    installAction: 'Installer / Mettre à jour',
    refreshing: 'Actualisation…',
    installing: 'Installation…',
    installSuccess: 'Installation terminée.',
    installError: "Échec de l'installation.",
    installResult: (summary) => `Résultat: ${summary}`,
    globalAgentsTitle: 'Commandes CLI globales',
    globalAgentsSubtitle: 'Installe les commandes Tiqora dans ~/.claude/commands, ~/.codex/prompts et ~/.cursor/commands — disponibles dans tous les repos sans installation par repo.',
    globalAgentsStatus: (installed, total) => `${installed}/${total} commandes installées`,
    globalAgentsInstallAction: 'Installer globalement',
    globalAgentsInstalling: 'Installation…',
    globalAgentsSuccess: (added, updated) => `Terminé — ${added} ajoutées, ${updated} mises à jour`,
    globalAgentsError: "Échec de l'installation globale.",
    projectTitle: 'Réglages projet',
    projectSubtitle: 'Configure les MCPs, la documentation LLM et les agents pour ce workspace.',
    mcpTitle: 'MCPs (Model Context Protocol)',
    mcpSubtitle: 'Serveurs MCP disponibles pour les agents dans ce workspace.',
    mcpAdd: '+ Ajouter un MCP',
    mcpName: 'Nom',
    mcpCommand: 'Commande',
    mcpArgs: 'Arguments (un par ligne)',
    mcpEnvVars: "Variables d'environnement",
    mcpEnvKey: 'Clé',
    mcpEnvValue: 'Valeur',
    mcpAddEnvVar: '+ Variable',
    mcpSave: 'Enregistrer',
    mcpCancel: 'Annuler',
    mcpDelete: 'Supprimer',
    docsTitle: 'Contexte LLM',
    docsSubtitle: "Fichiers ou URLs fournis aux agents comme contexte (llms.txt, CLAUDE.md, docs de bibliothèques…).",
    docsAddFile: '+ Fichier local',
    docsAddUrl: '+ URL',
    docsLabelPlaceholder: 'Ex: PrimeVue docs',
    docsUrlPlaceholder: 'https://...',
    docsDelete: 'Supprimer',
    navGeneral: 'Général',
    navGit: 'Git',
    navPM: 'PM Tool',
    navMCPs: 'MCPs',
    navContext: 'Contexte LLM',
    workflowAvailabilityTitle: 'Disponibilité des workflows',
    workflowAvailabilitySubtitle: 'Visibilité des workflows Tiqora dans cette version.',
    workflowStatusStable: 'Stable',
    workflowStatusBeta: 'Beta',
    workflowBetaHint: 'Fallback:',
    projectNameLabel: 'Nom du projet',
    docLangLabel: 'Langue des documents',
    docLangHint: "Langue utilisée par les agents pour les commentaires, commits et documentation générée.",
    gitTitle: 'Git',
    gitSubtitle: 'Configuration des dépôts et du modèle de branches pour les agents.',
    branchPatternLabel: 'Modèle de branche',
    branchPatternPlaceholder: 'ex: feature/*',
    reposTitle: 'Repos',
    reposAdd: 'Ouvrir un dossier',
    reposClone: 'Cloner un repo',
    repoRemove: 'Retirer',
    cloneUrlPlaceholder: 'git@github.com:org/repo.git',
    cloneDestLabel: 'Destination',
    cloneDestNone: 'Choisir un dossier…',
    cloneAction: 'Cloner',
    cloneInProgress: 'Clonage en cours…',
    cloneSuccess: 'Repo cloné avec succès.',
    cloneError: 'Erreur lors du clonage.',
    repoRole: 'Rôle',
    repoProfile: 'Profil',
    pmTitle: 'Outils de gestion de projet',
    pmSubtitle: 'Connecte ce workspace à un outil PM pour synchroniser les tickets et le temps passé.',
    pmNone: 'Aucun',
    jiraUrl: 'URL Jira',
    jiraProjectKey: 'Clé projet',
    jiraBoardId: 'ID Board',
    jiraOAuthSoon: '🔗 Connexion OAuth bientôt disponible. Les informations sont stockées localement.',
    pmComingSoon: 'Bientôt disponible.',
    jiraAuthSection: 'Connexion',
    jiraConnectBtn: 'Se connecter à Jira',
    jiraConnecting: 'Connexion en cours…',
    jiraConnectedAs: (name, url) => `Connecté en tant que ${name} sur ${url}`,
    jiraDisconnect: 'Déconnecter',
    jiraSyncSection: 'Synchronisation',
    jiraSyncBtn: 'Synchroniser les tickets',
    jiraSyncing: 'Synchronisation…',
    jiraSyncSuccess: (imported, updated) => `${imported} créé(s), ${updated} mis à jour`,
    jiraSyncError: 'Erreur lors de la synchronisation.',
    jiraAuthError: 'Erreur de connexion Jira.',
    jiraStatusChecking: 'Vérification…',
    jiraProjectLabel: 'Projet Jira',
    jiraProjectPlaceholder: 'Sélectionner un projet…',
    jiraProjectLoading: 'Chargement des projets…',
  },
  toast: {
    contextCopied: (ticketId) => `Contexte ${ticketId} copié`,
    contextCopyError: 'Échec de la copie du contexte. Réessaie.',
  },
};

const en: Dictionary = {
  loadingWorkspace: 'Loading workspace…',
  workspaceLoadError: 'Unable to load local workspaces. Check folder permissions.',
  appName: 'Tiqora',
  home: {
    title: 'Tiqora',
    subtitle: 'Multi-repo orchestration with a fast local workflow. Workspaces are stored locally by Tiqora, with repos as optional links.',
    openWorkspace: 'Open workspace',
    openWorkspaceHint: 'Select a repo folder or Tiqora workspace folder',
    createWorkspace: 'Create workspace',
    createWorkspaceHint: 'Configure a new guided project',
    recent: 'Recent workspaces',
    noRecent: 'No recent workspace. Start by creating your first one.',
    now: 'just now',
    minutesAgo: (n) => `${n} min ago`,
    hoursAgo: (n) => `${n}h ago`,
    daysAgo: (n) => `${n}d ago`,
  },
  dashboard: {
    home: 'Home',
    chatAgent: 'AI Chat',
    newWorkspace: 'New',
    openWorkspace: 'Open workspace',
    closeTab: 'Close',
    noOtherWorkspace: 'All workspaces are already open.',
    openedWorkspaceTabs: 'Opened workspaces',
    repoCount: (n) => `${n} repo${n > 1 ? 's' : ''}`,
    topologyMono: 'Mono-repo',
    topologyMulti: 'Multi-repo',
    noRepo: 'No repository in this workspace.',
  },
  sidebar: {
    overview: 'Overview',
    product: 'Product',
    delivery: 'Delivery',
    settings: 'Settings',
  },
  board: {
    searchPlaceholder: 'Search ticket (id or title)',
    newTicket: 'New ticket',
    noTicketsTitle: 'No ticket yet',
    noTicketsHint: 'Start with a backlog task to kick off your workflow.',
    createFirstTicket: 'Create first ticket',
    emptyColumn: 'No ticket.',
    emptyColumnSearch: 'No results in this column.',
  },
  settings: {
    title: 'Interface settings',
    subtitle: 'Customize app appearance and language.',
    appearanceTitle: 'Appearance',
    themeLabel: 'Theme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    resolvedTheme: (theme) => `Active theme: ${theme}`,
    languageTitle: 'Language',
    languageLabel: 'Interface language',
    languageSystem: 'System',
    languageFrench: 'Français',
    languageEnglish: 'English',
    agentProviderTitle: 'Agent engine',
    agentCliStatusTitle: 'Detected CLIs',
    agentCliStatusChecking: 'Detecting CLIs…',
    agentCliStatusMissingWarning: 'The selected provider is not installed locally.',
    agentCliStatusVersionUnknown: 'unknown version',
    agentProviderClaude: 'Claude Code CLI',
    agentProviderCodex: 'Codex CLI',
    agentProviderCursor: 'Cursor Agent CLI',
    saveSuccess: 'Preferences saved.',
    saveError: 'Unable to save preferences.',
    mcpServerTitle: 'MCP Server',
    mcpServerLabel: 'MCP Server URL',
    mcpServerPlaceholder: 'http://localhost:3737',
    mcpServerHint: 'Leave empty to use the local server.',
    agentsTitle: 'CLI Agents',
    agentsSubtitle: 'Install or update Tiqora commands/agents in workspace repositories.',
    repoLabel: 'Target repository',
    noRepoConfigured: 'No repository configured in this workspace.',
    noTiqoraConfig: 'This repository has no .tiqora.yaml file (installation may be incomplete).',
    targetsLabel: 'Environments',
    envCursor: 'Cursor',
    envCodex: 'Codex',
    envClaude: 'Claude Code',
    envDetected: 'detected',
    envNotDetected: 'not detected',
    installAction: 'Install / Update',
    refreshing: 'Refreshing…',
    installing: 'Installing…',
    installSuccess: 'Installation complete.',
    installError: 'Installation failed.',
    installResult: (summary) => `Result: ${summary}`,
    globalAgentsTitle: 'Global CLI commands',
    globalAgentsSubtitle: 'Install Tiqora commands in ~/.claude/commands, ~/.codex/prompts, and ~/.cursor/commands — available in all repos without per-repo installation.',
    globalAgentsStatus: (installed, total) => `${installed}/${total} commands installed`,
    globalAgentsInstallAction: 'Install globally',
    globalAgentsInstalling: 'Installing…',
    globalAgentsSuccess: (added, updated) => `Done — ${added} added, ${updated} updated`,
    globalAgentsError: 'Global installation failed.',
    projectTitle: 'Project settings',
    projectSubtitle: 'Configure MCPs, LLM documentation and agents for this workspace.',
    mcpTitle: 'MCPs (Model Context Protocol)',
    mcpSubtitle: 'MCP servers available to agents in this workspace.',
    mcpAdd: '+ Add MCP',
    mcpName: 'Name',
    mcpCommand: 'Command',
    mcpArgs: 'Arguments (one per line)',
    mcpEnvVars: 'Environment variables',
    mcpEnvKey: 'Key',
    mcpEnvValue: 'Value',
    mcpAddEnvVar: '+ Variable',
    mcpSave: 'Save',
    mcpCancel: 'Cancel',
    mcpDelete: 'Delete',
    docsTitle: 'LLM Context',
    docsSubtitle: 'Files or URLs provided to agents as context (llms.txt, CLAUDE.md, library docs…).',
    docsAddFile: '+ Local file',
    docsAddUrl: '+ URL',
    docsLabelPlaceholder: 'Ex: PrimeVue docs',
    docsUrlPlaceholder: 'https://...',
    docsDelete: 'Delete',
    navGeneral: 'General',
    navGit: 'Git',
    navPM: 'PM Tool',
    navMCPs: 'MCPs',
    navContext: 'LLM Context',
    workflowAvailabilityTitle: 'Workflow availability',
    workflowAvailabilitySubtitle: 'Visibility of Tiqora workflows in this release.',
    workflowStatusStable: 'Stable',
    workflowStatusBeta: 'Beta',
    workflowBetaHint: 'Fallback:',
    projectNameLabel: 'Project name',
    docLangLabel: 'Document language',
    docLangHint: 'Language used by agents for comments, commits and generated documentation.',
    gitTitle: 'Git',
    gitSubtitle: 'Repository configuration and branch pattern for agents.',
    branchPatternLabel: 'Branch pattern',
    branchPatternPlaceholder: 'e.g. feature/*',
    reposTitle: 'Repositories',
    reposAdd: 'Open folder',
    reposClone: 'Clone a repo',
    repoRemove: 'Remove',
    cloneUrlPlaceholder: 'git@github.com:org/repo.git',
    cloneDestLabel: 'Destination',
    cloneDestNone: 'Choose a folder…',
    cloneAction: 'Clone',
    cloneInProgress: 'Cloning…',
    cloneSuccess: 'Repository cloned successfully.',
    cloneError: 'Clone failed.',
    repoRole: 'Role',
    repoProfile: 'Profile',
    pmTitle: 'Project management tools',
    pmSubtitle: 'Connect this workspace to a PM tool to sync tickets and time tracking.',
    pmNone: 'None',
    jiraUrl: 'Jira URL',
    jiraProjectKey: 'Project key',
    jiraBoardId: 'Board ID',
    jiraOAuthSoon: '🔗 OAuth connection coming soon. Information is stored locally for now.',
    pmComingSoon: 'Coming soon.',
    jiraAuthSection: 'Authentication',
    jiraConnectBtn: 'Connect to Jira',
    jiraConnecting: 'Connecting…',
    jiraConnectedAs: (name, url) => `Connected as ${name} on ${url}`,
    jiraDisconnect: 'Disconnect',
    jiraSyncSection: 'Sync',
    jiraSyncBtn: 'Sync tickets',
    jiraSyncing: 'Syncing…',
    jiraSyncSuccess: (imported, updated) => `${imported} created, ${updated} updated`,
    jiraSyncError: 'Sync failed.',
    jiraAuthError: 'Jira authentication error.',
    jiraStatusChecking: 'Checking…',
    jiraProjectLabel: 'Jira project',
    jiraProjectPlaceholder: 'Select a project…',
    jiraProjectLoading: 'Loading projects…',
  },
  toast: {
    contextCopied: (ticketId) => `${ticketId} context copied`,
    contextCopyError: 'Failed to copy context. Try again.',
  },
};

export const MESSAGES: Record<ResolvedLanguage, Dictionary> = { fr, en };

export function resolveLanguage(preference: LanguagePreference, systemLanguage = navigator.language): ResolvedLanguage {
  if (preference === 'fr' || preference === 'en') return preference;
  return systemLanguage.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
