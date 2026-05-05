import { describe, it, expect } from 'vitest';
import { getEditPdfErrorMessage } from '../editPdfErrorMessage';
import type { EditPdfErrorType } from '../editPdfTypes';

const t = (key: string) => key;

describe('getEditPdfErrorMessage', () => {
  const maxBytes = 5 * 1024 * 1024;

  it('returns custom message for CUSTOM', () => {
    expect(getEditPdfErrorMessage('CUSTOM', 'oops', maxBytes, t)).toBe('oops');
  });

  it('prefixes custom message for REORDER_ERROR', () => {
    expect(getEditPdfErrorMessage('REORDER_ERROR', 'bad', maxBytes, t)).toBe('error: bad');
  });

  it.each<[EditPdfErrorType, string]>([
    ['INVALID_TYPE', 'invalidFileType'],
    ['PANEL_ERROR', 'panelPdfError'],
    ['SELECT_PDF_FIRST', 'selectPdfFirst'],
    ['EMPTY_PDF', 'emptyPdfError'],
    ['SAVE_ERROR', 'saveError'],
    ['REORDER_ERROR', 'reorderError'],
  ])('maps %s to translation key', (errorType, expectedKey) => {
    expect(getEditPdfErrorMessage(errorType, null, maxBytes, t)).toBe(expectedKey);
  });

  it('formats SIZE_EXCEEDED with max MB', () => {
    expect(getEditPdfErrorMessage('SIZE_EXCEEDED', null, maxBytes, t)).toBe(
      'fileSizeExceeded (Max: 5 MB)',
    );
  });

  it('returns null for NONE', () => {
    expect(getEditPdfErrorMessage('NONE', null, maxBytes, t)).toBeNull();
  });
});
