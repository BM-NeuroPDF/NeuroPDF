'use client';

import { useState } from 'react';

export function usePopup() {
  const [popup, setPopup] = useState({
    open: false,
    type: 'info' as 'error' | 'info' | 'success',
    message: '',
  });

  const showError = (message: string) => {
    setPopup({ open: true, type: 'error', message });
  };

  const showInfo = (message: string) => {
    setPopup({ open: true, type: 'info', message });
  };

  const showSuccess = (message: string) => {
    setPopup({ open: true, type: 'success', message });
  };

  const close = () => {
    setPopup((p) => ({ ...p, open: false }));
  };

  return {
    popup,
    showError,
    showInfo,
    showSuccess,
    close,
  };
}
