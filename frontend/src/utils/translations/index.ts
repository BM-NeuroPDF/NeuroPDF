import { authTranslations } from './auth';
import { chatTranslations } from './chat';
import { commonTranslations } from './common';
import { errorsTranslations } from './errors';
import { pdfTranslations } from './pdf';
import type { Language } from '../translations.types';

export const translations = {
  tr: {
    ...commonTranslations.tr,
    ...authTranslations.tr,
    ...pdfTranslations.tr,
    ...chatTranslations.tr,
    ...errorsTranslations.tr,
  },
  en: {
    ...commonTranslations.en,
    ...authTranslations.en,
    ...pdfTranslations.en,
    ...chatTranslations.en,
    ...errorsTranslations.en,
  },
} as const;

export type TranslationKey = keyof (typeof translations)['tr'];
export type TranslateFn = (key: TranslationKey) => string;
export type { Language };
