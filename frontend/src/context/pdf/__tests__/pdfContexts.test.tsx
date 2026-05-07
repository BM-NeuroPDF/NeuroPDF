import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { PdfActionsContext, usePdfActions } from '@/context/pdf/PdfActionsContext';
import { PdfDataContext, usePdfData } from '@/context/pdf/PdfDataContext';

describe('pdf context hooks', () => {
  it('throws when usePdfActions is outside provider', () => {
    expect(() => renderHook(() => usePdfActions())).toThrow('usePdfActions must be used within a PdfProvider');
  });

  it('returns PdfActionsContext value from provider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PdfActionsContext.Provider value={{ savePdf: () => undefined, setPdfFile: () => undefined }}>
        {children}
      </PdfActionsContext.Provider>
    );
    const { result } = renderHook(() => usePdfActions(), { wrapper });
    expect(typeof result.current.savePdf).toBe('function');
    expect(typeof result.current.setPdfFile).toBe('function');
  });

  it('throws when usePdfData is outside provider', () => {
    expect(() => renderHook(() => usePdfData())).toThrow('usePdfData must be used within a PdfProvider');
  });

  it('returns PdfDataContext value from provider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PdfDataContext.Provider
        value={{
          pdfFile: null,
          processedBlob: null,
          extractedText: null,
          summaryText: null,
          currentOperation: null,
          operationResult: null,
          mergeFiles: [],
        }}
      >
        {children}
      </PdfDataContext.Provider>
    );
    const { result } = renderHook(() => usePdfData(), { wrapper });
    expect(result.current.pdfFile).toBeNull();
    expect(result.current.mergeFiles).toEqual([]);
  });
});
