'use client';
import React from 'react';
import { Navigation, Plus, WifiOff, MapPinPlus, RefreshCw, Cloud } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface TopHeaderProps {
  onOpenAddModal: () => void;
  onOpenQuickCoordModal: () => void;
  locationCount: number;
  onTriggerSync?: () => void;
  isSyncing?: boolean;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  onOpenAddModal,
  onOpenQuickCoordModal,
  locationCount,
  onTriggerSync,
  isSyncing,
}) => {
  const isOnline = useOnlineStatus();

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs pt-safe">
      <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between gap-2">
        {/* Brand */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center text-white shadow-sm flex-shrink-0">
            <Navigation className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-slate-900 tracking-tight leading-tight truncate">
              GeoRoute Planner
            </h1>
            <p className="text-[11px] text-slate-500 leading-none truncate flex items-center gap-1.5">
              <span>{locationCount} titik</span>
              <span className="text-slate-300">•</span>
              <span className="text-purple-600 font-medium hidden xs:inline">Sinkron Laptop & HP</span>
            </p>
          </div>
        </div>

        {/* Offline Badge if disconnected */}
        {!isOnline && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-800 text-[11px] font-medium animate-pulse">
            <WifiOff className="w-3 h-3 text-amber-700" />
            <span className="hidden sm:inline">Mode Offline</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {onTriggerSync && (
            <button
              onClick={onTriggerSync}
              disabled={isSyncing}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-purple-200 bg-purple-50/80 hover:bg-purple-100 text-purple-800 text-xs font-semibold transition"
              title="Sinkronkan data dan foto antara Laptop dan HP"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-purple-600 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Sinkron...' : 'Sinkron'}</span>
            </button>
          )}

          <PWAInstallButton />

          <button
            onClick={onOpenQuickCoordModal}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition"
            title="Tempel koordinat cepat (-5.397, 105.266)"
          >
            <MapPinPlus className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenAddModal}
            className="flex items-center gap-1 rounded-lg bg-teal-600 hover:bg-teal-700 active:bg-teal-800 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xs transition"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden xs:inline">Tambah Lokasi</span>
          </button>
        </div>
      </div>
    </header>
  );
};
