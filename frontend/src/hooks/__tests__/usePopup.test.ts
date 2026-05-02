import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePopup } from '../usePopup';

describe('usePopup', () => {
  it('initializes with closed popup', () => {
    const { result } = renderHook(() => usePopup());

    expect(result.current.popup.open).toBe(false);
    expect(result.current.popup.type).toBe('info');
    expect(result.current.popup.message).toBe('');
  });

  it('shows error popup', () => {
    const { result } = renderHook(() => usePopup());

    act(() => {
      result.current.showError('Test error message');
    });

    expect(result.current.popup.open).toBe(true);
    expect(result.current.popup.type).toBe('error');
    expect(result.current.popup.message).toBe('Test error message');
  });

  it('shows success popup', () => {
    const { result } = renderHook(() => usePopup());

    act(() => {
      result.current.showSuccess('Operation successful');
    });

    expect(result.current.popup.open).toBe(true);
    expect(result.current.popup.type).toBe('success');
    expect(result.current.popup.message).toBe('Operation successful');
  });

  it('shows info popup', () => {
    const { result } = renderHook(() => usePopup());

    act(() => {
      result.current.showInfo('Information message');
    });

    expect(result.current.popup.open).toBe(true);
    expect(result.current.popup.type).toBe('info');
    expect(result.current.popup.message).toBe('Information message');
  });

  it('closes popup', () => {
    const { result } = renderHook(() => usePopup());

    // Show popup first
    act(() => {
      result.current.showError('Test error');
    });

    expect(result.current.popup.open).toBe(true);

    // Close popup
    act(() => {
      result.current.close();
    });

    expect(result.current.popup.open).toBe(false);
    // Message should still be there
    expect(result.current.popup.message).toBe('Test error');
  });

  it('can change popup type', () => {
    const { result } = renderHook(() => usePopup());

    act(() => {
      result.current.showError('Error');
    });
    expect(result.current.popup.type).toBe('error');

    act(() => {
      result.current.showSuccess('Success');
    });
    expect(result.current.popup.type).toBe('success');

    act(() => {
      result.current.showInfo('Info');
    });
    expect(result.current.popup.type).toBe('info');
  });
});
