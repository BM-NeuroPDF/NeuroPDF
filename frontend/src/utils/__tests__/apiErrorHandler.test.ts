import { describe, it, expect, vi } from 'vitest';
import { handleApiError } from '../apiErrorHandler';

describe('handleApiError', () => {
  it('maps 401 to session message', () => {
    const showError = vi.fn();
    handleApiError(401, showError);
    expect(showError).toHaveBeenCalledWith(
      'Session expired. Please login again.'
    );
  });

  it('maps 403 to access denied', () => {
    const showError = vi.fn();
    handleApiError(403, showError);
    expect(showError).toHaveBeenCalledWith('Access denied.');
  });

  it('maps 500 to server error', () => {
    const showError = vi.fn();
    handleApiError(500, showError);
    expect(showError).toHaveBeenCalledWith(
      'Server error. Please try again later.'
    );
  });

  it('maps unknown status to generic message', () => {
    const showError = vi.fn();
    handleApiError(418, showError);
    expect(showError).toHaveBeenCalledWith('Unexpected error occurred.');
  });
});
