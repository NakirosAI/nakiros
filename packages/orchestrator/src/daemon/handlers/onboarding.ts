import {
  detectEditors,
  installNakiros,
  nakirosConfigExists,
  type DetectedEditor,
} from '../../services/onboarding-installer.js';
import type { HandlerRegistry } from './index.js';

export const onboardingHandlers: HandlerRegistry = {
  'onboarding:detectEditors': () => detectEditors(),
  'onboarding:nakirosConfigExists': () => nakirosConfigExists(),
  'onboarding:install': (args) => installNakiros(args[0] as DetectedEditor[]),
};
