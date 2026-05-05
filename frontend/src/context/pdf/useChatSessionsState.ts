import { useCallback, useState } from 'react';
import { fetchChatSessions, type ChatSessionListItem } from '@/utils/api';

export function useChatSessionsState(authStatus: string) {
  const [chatSessions, setChatSessions] = useState<ChatSessionListItem[]>([]);
  const [chatSessionsLoading, setChatSessionsLoading] = useState(false);

  const loadChatSessions = useCallback(async () => {
    if (authStatus !== 'authenticated') {
      setChatSessions([]);
      return;
    }
    setChatSessionsLoading(true);
    try {
      const data = await fetchChatSessions();
      setChatSessions(data.sessions ?? []);
    } catch {
      setChatSessions([]);
    } finally {
      setChatSessionsLoading(false);
    }
  }, [authStatus]);

  return {
    chatSessions,
    setChatSessions,
    chatSessionsLoading,
    loadChatSessions,
  };
}
