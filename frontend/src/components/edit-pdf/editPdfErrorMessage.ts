import type { EditPdfErrorType, EditPdfTranslate } from './editPdfTypes';

export function getEditPdfErrorMessage(
  errorType: EditPdfErrorType,
  customErrorMsg: string | null,
  maxBytes: number,
  t: EditPdfTranslate,
): string | null {
  if (customErrorMsg && errorType === 'CUSTOM') return customErrorMsg;
  if (customErrorMsg && errorType === 'REORDER_ERROR') return `${t('error')}: ${customErrorMsg}`;

  switch (errorType) {
    case 'INVALID_TYPE':
      return t('invalidFileType');
    case 'SIZE_EXCEEDED':
      return `${t('fileSizeExceeded')} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`;
    case 'PANEL_ERROR':
      return t('panelPdfError');
    case 'SELECT_PDF_FIRST':
      return t('selectPdfFirst');
    case 'EMPTY_PDF':
      return t('emptyPdfError');
    case 'SAVE_ERROR':
      return t('saveError');
    case 'REORDER_ERROR':
      return t('reorderError');
    default:
      return null;
  }
}
