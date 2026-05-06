import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PdfUiContext, usePdfUi } from '@/context/pdf/PdfUiContext';
import type { PdfUiContextValue } from '@/context/pdf/pdfContextTypes';

function Consumer() {
  const ctx = usePdfUi();
  return (
    <div>
      <span data-testid="pro-chat-open">{String(ctx.proChatOpen)}</span>
      <span data-testid="pro-chat-panel-open">{String(ctx.proChatPanelOpen)}</span>
    </div>
  );
}

describe('usePdfUi', () => {
  it('throws when used outside provider', () => {
    expect(() => render(<Consumer />)).toThrow('usePdfUi must be used within a PdfProvider');
  });

  it('returns provider value when context exists', () => {
    const value: PdfUiContextValue = {
      proChatOpen: true,
      setProChatOpen: () => undefined,
      proChatPanelOpen: false,
      setProChatPanelOpen: () => undefined,
    };

    const { getByTestId } = render(
      <PdfUiContext.Provider value={value}>
        <Consumer />
      </PdfUiContext.Provider>,
    );

    expect(getByTestId('pro-chat-open').textContent).toBe('true');
    expect(getByTestId('pro-chat-panel-open').textContent).toBe('false');
  });
});
