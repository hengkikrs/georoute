'use client';

import React from 'react';
import { Map, MapPin, Route, Database } from 'lucide-react';

export type ActiveTab = 'map' | 'locations' | 'routes' | 'import-export';

interface BottomNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  locationCount: number;
  routeCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  locationCount,
  routeCount,
}) => {
  const tabs = [
    {
      id: 'map' as ActiveTab,
      label: 'Peta',
      icon: Map,
      badge: null,
    },
    {
      id: 'locations' as ActiveTab,
      label: 'Daftar Lokasi',
      icon: MapPin,
      badge: locationCount > 0 ? locationCount : null,
    },
    {
      id: 'routes' as ActiveTab,
      label: 'Rute',
      icon: Route,
      badge: routeCount > 0 ? routeCount : null,
    },
    {
      id: 'import-export' as ActiveTab,
      label: 'Impor/Ekspor',
      icon: Database,
      badge: null,
    },
  ];

  return (
    <nav
      aria-label="Navigasi Utama"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg pb-safe"
    >
      <div className="max-w-md mx-auto flex items-center justify-around h-16 px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center w-full h-full min-h-[48px] px-1 transition-colors select-none ${
                isActive
                  ? 'text-teal-700 font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform duration-200 ${
                    isActive ? 'scale-110 stroke-[2.4]' : 'stroke-[1.8]'
                  }`}
                />
                {tab.badge !== null && (
                  <span className="absolute -top-1 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-teal-600 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-1 tracking-tight truncate max-w-[76px]">
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute bottom-1 w-6 h-0.5 rounded-full bg-teal-600" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
