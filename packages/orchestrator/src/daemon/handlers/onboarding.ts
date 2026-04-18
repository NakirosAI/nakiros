import { detectEditors, nakirosConfigExists } from '../../services/onboarding-installer.js';
import type { HandlerRegistry } from './index.js';

export const onboardingHandlers: HandlerRegistry = {
  'onboarding:detectEditors': () => detectEditors(),
  'onboarding:nakirosConfigExists': () => nakirosConfigExists(),
};
