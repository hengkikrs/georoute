'use client';

import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  itemCount?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  title,
  message,
  itemCount,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="p-5 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
            <Trash2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{message}</p>
          {itemCount !== undefined && itemCount > 1 && (
            <div className="mt-2.5 inline-block px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold">
              {itemCount} item akan dihapus
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-xs font-semibold text-white shadow-sm transition"
          >
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
};
