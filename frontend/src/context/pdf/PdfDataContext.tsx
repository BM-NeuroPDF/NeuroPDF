'use client';

import { createContext, useContext } from 'react';
import type { PdfDataContextValue } from './pdfContextTypes';

export const PdfDataContext = createContext<PdfDataContextValue | undefined>(undefined);

export function usePdfData(): PdfDataContextValue {
  const context = useContext(PdfDataContext);
  if (!context) {
    throw new Error('usePdfData must be used within a PdfProvider');
  }
  return context;
}
