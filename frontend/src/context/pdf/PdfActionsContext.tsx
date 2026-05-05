'use client';

import { createContext, useContext } from 'react';
import type { PdfActionsContextValue } from './pdfContextTypes';

export const PdfActionsContext = createContext<PdfActionsContextValue | undefined>(undefined);

export function usePdfActions(): PdfActionsContextValue {
  const context = useContext(PdfActionsContext);
  if (!context) {
    throw new Error('usePdfActions must be used within a PdfProvider');
  }
  return context;
}
