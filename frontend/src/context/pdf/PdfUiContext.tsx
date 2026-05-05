'use client';

import { createContext, useContext } from 'react';
import type { PdfUiContextValue } from './pdfContextTypes';

export const PdfUiContext = createContext<PdfUiContextValue | undefined>(undefined);

export function usePdfUi(): PdfUiContextValue {
  const context = useContext(PdfUiContext);
  if (!context) {
    throw new Error('usePdfUi must be used within a PdfProvider');
  }
  return context;
}
