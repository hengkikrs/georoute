'use client';

import React, { useState } from 'react';
import { Download, HelpCircle, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 active:bg-teal-800 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition"
        title="Pasang aplikasi di layar utama HP"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50/80 hover:bg-teal-100 px-2.5 py-1.5 text-xs font-medium text-teal-800 transition"
        >
          <Smartphone className="w-3.5 h-3.5 text-teal-600" />
          <span>Install iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-teal-600" />
                  Pasang di iPhone / iPad
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center">1</div>
                  <p>Buka menu <strong>Bagikan (Share)</strong> di bilah bawah browser Safari.</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center">2</div>
                  <p>Gulir ke bawah dan ketuk <strong>Tambahkan ke Layar Utama (Add to Home Screen)</strong>.</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center">3</div>
                  <p>Ketuk <strong>Tambah</strong> di sudut kanan atas untuk membuka aplikasi secara fullscreen.</p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition"
              >
                Mengerti
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
