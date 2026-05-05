'use client';

/**
 * PDF domain: split contexts + facade exports.
 * Implementation lives in `./pdf/*` (≤250 lines per module).
 */

import { useContext } from 'react';
import type { PdfContextMerged } from './pdf/pdfContextTypes';
import { PdfDataContext, usePdfData } from './pdf/PdfDataContext';
import { PdfUiContext, usePdfUi } from './pdf/PdfUiContext';
import { PdfActionsContext, usePdfActions } from './pdf/PdfActionsContext';
import { PdfProvider } from './pdf/PdfProvider';

export { PdfProvider, usePdfData, usePdfUi, usePdfActions };
export type { Message } from './pdf/pdfModel';
export type {
  PdfActionsContextValue,
  PdfContextMerged,
  PdfDataContextValue,
  PdfUiContextValue,
} from './pdf/pdfContextTypes';
export { pdfReducer, STORAGE_KEY, type PdfCoreState, type PdfAction } from './pdf/pdfModel';

/**
 * @deprecated Use `usePdfData`, `usePdfUi`, and `usePdfActions` so components
 * subscribe only to the slice they need. Panel-only UI updates then skip
 * consumers that depend only on PDF bytes / chat payload (see `docs/perf/pdf-context-profiler-notes.md`).
 */
export function usePdf(): PdfContextMerged {
  const data = useContext(PdfDataContext);
  const ui = useContext(PdfUiContext);
  const actions = useContext(PdfActionsContext);
  if (!data || !ui || !actions) {
    throw new Error('usePdf must be used within a PdfProvider');
  }
  return { ...data, ...ui, ...actions };
}
