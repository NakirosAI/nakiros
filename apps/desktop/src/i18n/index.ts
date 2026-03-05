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

void i18n.use(initReactI18next).init({
  resources: {
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
    },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
