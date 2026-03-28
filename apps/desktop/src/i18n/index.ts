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
import frAuth from './locales/fr/auth.json';
import frWorkspaceSetup from './locales/fr/workspace-setup.json';
import frBacklog from './locales/fr/backlog.json';
import frDelivery from './locales/fr/delivery.json';
import frSpec from './locales/fr/spec.json';

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
import enAuth from './locales/en/auth.json';
import enWorkspaceSetup from './locales/en/workspace-setup.json';
import enBacklog from './locales/en/backlog.json';
import enDelivery from './locales/en/delivery.json';
import enSpec from './locales/en/spec.json';
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
    auth: frAuth,
    'workspace-setup': frWorkspaceSetup,
    backlog: frBacklog,
    delivery: frDelivery,
    spec: frSpec,
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
    auth: enAuth,
    'workspace-setup': enWorkspaceSetup,
    backlog: enBacklog,
    delivery: enDelivery,
    spec: enSpec,
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
