'use client';

import { useSyncExternalStore } from 'react';

function subscribeOnline(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function getServerSnapshot() {
  return true;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeOnline, getSnapshot, getServerSnapshot);
}
