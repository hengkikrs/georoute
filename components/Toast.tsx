'use client';

import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title?: string;
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-14 left-0 right-0 z-50 pointer-events-none flex flex-col items-center px-4 space-y-2">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 max-w-sm w-full p-3 rounded-xl shadow-lg border transition-all duration-200 animate-in fade-in slide-in-from-top-2 ${
              isSuccess
                ? 'bg-teal-900/95 border-teal-700 text-teal-50'
                : isError
                ? 'bg-rose-900/95 border-rose-700 text-rose-50'
                : 'bg-slate-900/95 border-slate-700 text-slate-50'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {isSuccess && <CheckCircle2 className="w-5 h-5 text-teal-300 flex-shrink-0" />}
              {isError && <AlertCircle className="w-5 h-5 text-rose-300 flex-shrink-0" />}
              {!isSuccess && !isError && <Info className="w-5 h-5 text-sky-300 flex-shrink-0" />}
              <div className="min-w-0">
                {toast.title && <p className="text-xs font-semibold leading-tight">{toast.title}</p>}
                <p className="text-xs opacity-90 leading-normal break-words">{toast.message}</p>
              </div>
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="p-1 rounded-lg hover:bg-white/10 text-white/80 transition flex-shrink-0"
              aria-label="Tutup notifikasi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
