import type { translations } from '@/utils/translations';

export type EditPdfTranslate = (key: keyof (typeof translations)['tr']) => string;

export type EditPdfPageItem = {
  id: string;
  pageNumber: number;
};

export type EditPdfErrorType =
  | 'NONE'
  | 'INVALID_TYPE'
  | 'SIZE_EXCEEDED'
  | 'CUSTOM'
  | 'EMPTY_PDF'
  | 'SELECT_PDF_FIRST'
  | 'REORDER_ERROR'
  | 'SAVE_ERROR'
  | 'PANEL_ERROR';
