import { useEffect } from 'react';

/**
 * Loads server chat session list when authenticated; clears IDs when logged out.
 */
export function useAuthenticatedChatSessions(
  authStatus: string,
  loadChatSessions: () => Promise<void>,
  onLoggedOut: () => void,
): void {
  useEffect(() => {
    if (authStatus === 'authenticated') {
      void loadChatSessions();
    } else {
      onLoggedOut();
    }
  }, [authStatus, loadChatSessions, onLoggedOut]);
}
