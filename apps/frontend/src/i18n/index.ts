import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import frCommon from './locales/fr/common.json';
import frHome from './locales/fr/home.json';
import frDashboard from './locales/fr/dashboard.json';
import frSidebar from './locales/fr/sidebar.json';
import frBoard from './locales/fr/board.json';
import frSettings from './locales/fr/settings.json';
import frOnboarding from './locales/fr/onboarding.json';
import frToast from './locales/fr/toast.json';
import frFeedback from './locales/fr/feedback.json';
import frContext from './locales/fr/context.json';
import frOverview from './locales/fr/overview.json';
import frTicket from './locales/fr/ticket.json';
import frAgent from './locales/fr/agent.json';
import frWorkspaceSetup from './locales/fr/workspace-setup.json';
import frSpec from './locales/fr/spec.json';
import frSkills from './locales/fr/skills.json';
import frConversations from './locales/fr/conversations.json';
import frRecommendations from './locales/fr/recommendations.json';
import frScan from './locales/fr/scan.json';
import frAudit from './locales/fr/audit.json';
import frEvals from './locales/fr/evals.json';
import frFix from './locales/fr/fix.json';
import frNakirosSkills from './locales/fr/nakiros-skills.json';
import frGlobalSkills from './locales/fr/global-skills.json';
import frPluginSkills from './locales/fr/plugin-skills.json';
import frBundledConflicts from './locales/fr/bundled-conflicts.json';
import frVersion from './locales/fr/version.json';

import enCommon from './locales/en/common.json';
import enHome from './locales/en/home.json';
import enDashboard from './locales/en/dashboard.json';
import enSidebar from './locales/en/sidebar.json';
import enBoard from './locales/en/board.json';
import enSettings from './locales/en/settings.json';
import enOnboarding from './locales/en/onboarding.json';
import enToast from './locales/en/toast.json';
import enFeedback from './locales/en/feedback.json';
import enContext from './locales/en/context.json';
import enOverview from './locales/en/overview.json';
import enTicket from './locales/en/ticket.json';
import enAgent from './locales/en/agent.json';
import enWorkspaceSetup from './locales/en/workspace-setup.json';
import enSpec from './locales/en/spec.json';
import enSkills from './locales/en/skills.json';
import enConversations from './locales/en/conversations.json';
import enRecommendations from './locales/en/recommendations.json';
import enScan from './locales/en/scan.json';
import enAudit from './locales/en/audit.json';
import enEvals from './locales/en/evals.json';
import enFix from './locales/en/fix.json';
import enNakirosSkills from './locales/en/nakiros-skills.json';
import enGlobalSkills from './locales/en/global-skills.json';
import enPluginSkills from './locales/en/plugin-skills.json';
import enBundledConflicts from './locales/en/bundled-conflicts.json';
import enVersion from './locales/en/version.json';
import { resolveLanguage } from '../utils/language';
import type { ResolvedLanguage } from '@nakiros/shared';

const resources = {
  fr: {
    common: frCommon,
    home: frHome,
    dashboard: frDashboard,
    sidebar: frSidebar,
    board: frBoard,
    settings: frSettings,
    onboarding: frOnboarding,
    toast: frToast,
    feedback: frFeedback,
    context: frContext,
    overview: frOverview,
    ticket: frTicket,
    agent: frAgent,
    'workspace-setup': frWorkspaceSetup,
    spec: frSpec,
    skills: frSkills,
    conversations: frConversations,
    recommendations: frRecommendations,
    scan: frScan,
    audit: frAudit,
    evals: frEvals,
    fix: frFix,
    'nakiros-skills': frNakirosSkills,
    'global-skills': frGlobalSkills,
    'plugin-skills': frPluginSkills,
    'bundled-conflicts': frBundledConflicts,
    version: frVersion,
  },
  en: {
    common: enCommon,
    home: enHome,
    dashboard: enDashboard,
    sidebar: enSidebar,
    board: enBoard,
    settings: enSettings,
    onboarding: enOnboarding,
    toast: enToast,
    feedback: enFeedback,
    context: enContext,
    overview: enOverview,
    ticket: enTicket,
    agent: enAgent,
    'workspace-setup': enWorkspaceSetup,
    spec: enSpec,
    skills: enSkills,
    conversations: enConversations,
    recommendations: enRecommendations,
    scan: enScan,
    audit: enAudit,
    evals: enEvals,
    fix: enFix,
    'nakiros-skills': enNakirosSkills,
    'global-skills': enGlobalSkills,
    'plugin-skills': enPluginSkills,
    'bundled-conflicts': enBundledConflicts,
    version: enVersion,
  },
};

async function detectInitialLanguage(): Promise<ResolvedLanguage> {
  try {
    return await window.nakiros.getSystemLanguage();
  } catch {
    return resolveLanguage('system');
  }
}

export const i18nReady = (async () => {
  const lng = await detectInitialLanguage();
  await i18n.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });
})();

export default i18n;
