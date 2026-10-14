'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { TopHeader } from '@/components/TopHeader';
import { BottomNav, ActiveTab } from '@/components/BottomNav';
import { LocationsList } from '@/components/LocationsList';
import { RouteBuilder } from '@/components/RouteBuilder';
import { ImportExport } from '@/components/ImportExport';
import { LocationFormModal } from '@/components/LocationFormModal';
import { QuickCoordinateInputModal } from '@/components/QuickCoordinateInputModal';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { RouteCameraModal } from '@/components/RouteCameraModal';
import { ToastContainer, ToastMessage } from '@/components/Toast';
import { LocationPoint } from '@/types/location';
import { RouteCoordinate, RoutePlan } from '@/types/route';
import {
  getStoredLocations,
  getStoredRoutes,
  deleteSingleLocation,
  deleteMultipleLocations,
  getActiveRouteDraft,
} from '@/services/locationStorage';
import { syncWithServer, subscribeToSync } from '@/services/cloudSyncService';

import { useMounted } from '@/hooks/useMounted';

// Dynamically import MapView with SSR disabled to prevent Leaflet window reference errors
const MapView = dynamic(
  () => import('@/components/MapView').then((mod) => mod.MapView),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[calc(100vh-8.5rem)] min-h-[420px] bg-slate-100 flex flex-col items-center justify-center text-slate-500 gap-2">
        <div className="w-8 h-8 rounded-full border-3 border-teal-600 border-t-transparent animate-spin" />
        <p className="text-xs font-semibold">Memuat Peta Interaktif...</p>
      </div>
    ),
  }
);

export default function HomePage() {
  const isMounted = useMounted();
  const [activeTab, setActiveTab] = useState<ActiveTab>('map');
  const [locations, setLocations] = useState<LocationPoint[]>([]);
  const [routes, setRoutes] = useState<RoutePlan[]>([]);

  // Selection & Focus
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [focusedLocationId, setFocusedLocationId] = useState<string | null>(null);
  const [activeRoutePoints, setActiveRoutePoints] = useState<RouteCoordinate[]>([]);
  const [routeBuilderPreselected, setRouteBuilderPreselected] = useState<string[]>([]);

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationPoint | null>(null);
  const [pickedCoordsForForm, setPickedCoordsForForm] = useState<{ lat: number; lng: number } | null>(null);
  const [isQuickCoordModalOpen, setIsQuickCoordModalOpen] = useState(false);
  const [cameraModalLocation, setCameraModalLocation] = useState<LocationPoint | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Delete modal state
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    itemCount?: number;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info', title?: string) => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type, title }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Reload data from storage
  const reloadData = useCallback(() => {
    setLocations(getStoredLocations());
    setRoutes(getStoredRoutes());
  }, []);

  // Initial load after mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setLocations(getStoredLocations());
      setRoutes(getStoredRoutes());

      // Auto-restore active route draft if saved
      const draft = getActiveRouteDraft();
      if (draft && draft.pointIds && draft.pointIds.length >= 2) {
        setRouteBuilderPreselected(draft.pointIds);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Background Cross-Device Sync (Laptop <-> Phone)
  useEffect(() => {
    // 1. Initial silent sync on mount to pull latest points & photos from laptop/phone
    syncWithServer()
      .then(() => reloadData())
      .catch(() => {});

    // 2. Subscribe to sync broadcasts
    const unsubscribe = subscribeToSync((res) => {
      if (res.success) reloadData();
    });

    // 3. Auto-sync polling every 10 seconds to catch edits made on other device
    const interval = setInterval(() => {
      syncWithServer()
        .then((res) => {
          if (res.success) reloadData();
        })
        .catch(() => {});
    }, 10000);

    // 4. Also sync when window/tab regains focus or local change event fires
    const handleFocus = () => {
      syncWithServer()
        .then(() => reloadData())
        .catch(() => {});
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('georoute_local_change', reloadData);

    return () => {
      unsubscribe();
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('georoute_local_change', reloadData);
    };
  }, [reloadData]);

  // Window storage sync
  useEffect(() => {
    const handleStorageChange = () => reloadData();
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [reloadData]);

  // Manual sync trigger
  const handleManualSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const res = await syncWithServer();
      reloadData();
      if (res.success) {
        addToast('Data & foto berhasil disinkronkan antar laptop dan HP!', 'success');
      }
    } catch (err) {
      addToast('Gagal sinkronisasi: ' + (err instanceof Error ? err.message : 'Error koneksi'), 'error');
    } finally {
      setIsSyncing(false);
    }
  }, [reloadData, addToast]);

  // Handle Form open / edit
  const handleOpenAddModal = useCallback(() => {
    setEditingLocation(null);
    setPickedCoordsForForm(null);
    setIsFormModalOpen(true);
  }, []);

  const handleEditLocation = useCallback((loc: LocationPoint) => {
    setEditingLocation(loc);
    setPickedCoordsForForm(null);
    setIsFormModalOpen(true);
  }, []);

  const handleOpenAddModalWithCoords = useCallback((coords: { lat: number; lng: number }) => {
    setEditingLocation(null);
    setPickedCoordsForForm(coords);
    setIsFormModalOpen(true);
  }, []);

  // Location saved callback
  const handleLocationSaved = useCallback((saved: LocationPoint) => {
    reloadData();
    addToast(
      editingLocation ? `Perubahan lokasi "${saved.name}" berhasil disimpan!` : `Lokasi "${saved.name}" berhasil ditambahkan!`,
      'success'
    );
  }, [reloadData, addToast, editingLocation]);

  // Deletion request handlers
  const handleRequestDeleteLocation = useCallback((loc: LocationPoint) => {
    setDeleteModalState({
      isOpen: true,
      title: 'Hapus Titik Lokasi?',
      message: `Apakah Anda yakin ingin menghapus lokasi "${loc.name}"? Data yang dihapus tidak dapat dipulihkan.`,
      itemCount: 1,
      onConfirm: () => {
        deleteSingleLocation(loc.id);
        setSelectedLocationIds((prev) => prev.filter((id) => id !== loc.id));
        reloadData();
        setDeleteModalState((prev) => ({ ...prev, isOpen: false }));
        addToast(`Lokasi "${loc.name}" telah dihapus.`, 'info');
      },
    });
  }, [reloadData, addToast]);

  const handleRequestBatchDelete = useCallback((ids: string[]) => {
    setDeleteModalState({
      isOpen: true,
      title: 'Hapus Banyak Lokasi?',
      message: `Apakah Anda yakin ingin menghapus ${ids.length} lokasi terpilih sekaligus?`,
      itemCount: ids.length,
      onConfirm: () => {
        deleteMultipleLocations(ids);
        setSelectedLocationIds([]);
        reloadData();
        setDeleteModalState((prev) => ({ ...prev, isOpen: false }));
        addToast(`${ids.length} lokasi berhasil dihapus.`, 'info');
      },
    });
  }, [reloadData, addToast]);

  // Selection handlers
  const handleToggleSelectLocation = useCallback((id: string) => {
    setSelectedLocationIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const handleSelectAllLocations = useCallback((ids: string[]) => {
    setSelectedLocationIds(ids);
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedLocationIds([]);
  }, []);

  // Navigation across tabs
  const handleViewOnMap = useCallback((locationId: string) => {
    setFocusedLocationId(locationId);
    setActiveTab('map');
  }, []);

  const handleCreateRouteFromSelected = useCallback((ids: string[]) => {
    setRouteBuilderPreselected(ids);
    setActiveTab('routes');
  }, []);

  const handleAddToRouteFromMap = useCallback((loc: LocationPoint) => {
    setRouteBuilderPreselected((prev) => Array.from(new Set([...prev, loc.id])));
    addToast(`"${loc.name}" ditambahkan ke perencanaan rute.`, 'success');
  }, [addToast]);

  // Stabilized route points callback with deep equality check to prevent infinite re-renders
  const handleViewRouteOnMap = useCallback((points: RouteCoordinate[]) => {
    setActiveRoutePoints((prev) => {
      if (prev.length === points.length) {
        const isIdentical = prev.every(
          (p, idx) => p.id === points[idx].id && p.lat === points[idx].lat && p.lng === points[idx].lng
        );
        if (isIdentical) return prev;
      }
      return points;
    });
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900 font-sans">
      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Top Header */}
      <TopHeader
        onOpenAddModal={handleOpenAddModal}
        onOpenQuickCoordModal={() => setIsQuickCoordModalOpen(true)}
        locationCount={locations.length}
        onTriggerSync={handleManualSync}
        isSyncing={isSyncing}
      />

      {/* Main Tab Content */}
      <main className="flex-1 w-full relative">
        {/* Tab 1: Peta Interaktif */}
        {activeTab === 'map' && (
          <div className="w-full h-full animate-in fade-in">
            <MapView
              locations={locations}
              focusedLocationId={focusedLocationId}
              activeRoutePoints={activeRoutePoints}
              onOpenAddModalWithCoords={handleOpenAddModalWithCoords}
              onEditLocation={handleEditLocation}
              onAddToRoute={handleAddToRouteFromMap}
              onOpenRouteCamera={setCameraModalLocation}
            />
          </div>
        )}

        {/* Tab 2: Daftar Lokasi */}
        {activeTab === 'locations' && (
          <div className="animate-in fade-in">
            <LocationsList
              locations={locations}
              selectedLocationIds={selectedLocationIds}
              onToggleSelectLocation={handleToggleSelectLocation}
              onSelectAllLocations={handleSelectAllLocations}
              onClearSelection={handleClearSelection}
              onEditLocation={handleEditLocation}
              onRequestDeleteLocation={handleRequestDeleteLocation}
              onRequestBatchDelete={handleRequestBatchDelete}
              onViewOnMap={handleViewOnMap}
              onCreateRouteFromSelected={handleCreateRouteFromSelected}
              onOpenAddModal={handleOpenAddModal}
              onShowToast={addToast}
              onLocationUpdated={reloadData}
            />
          </div>
        )}

        {/* Tab 3: Perencana Rute */}
        {activeTab === 'routes' && (
          <div className="animate-in fade-in">
            <RouteBuilder
              locations={locations}
              preselectedLocationIds={routeBuilderPreselected}
              onViewRouteOnMap={handleViewRouteOnMap}
              onShowToast={addToast}
              onLocationUpdated={reloadData}
            />
          </div>
        )}

        {/* Tab 4: Impor / Ekspor & Backup */}
        {activeTab === 'import-export' && (
          <div className="animate-in fade-in">
            <ImportExport
              locations={locations}
              onLocationsUpdated={reloadData}
              onShowToast={addToast}
            />
          </div>
        )}
      </main>

      {/* Bottom Navigation for Mobile Ergonomics */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab !== 'map') {
            setFocusedLocationId(null);
          }
        }}
        locationCount={locations.length}
        routeCount={routes.length}
      />

      {/* Modal Add / Edit Location */}
      <LocationFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSaved={handleLocationSaved}
        initialData={editingLocation}
        initialCoordinates={pickedCoordsForForm}
        onPickFromMap={() => {
          setActiveTab('map');
          addToast('Ketuk lokasi mana saja di peta untuk mengambil koordinat.', 'info');
        }}
      />

      {/* Modal Quick Coordinate Input */}
      <QuickCoordinateInputModal
        isOpen={isQuickCoordModalOpen}
        onClose={() => setIsQuickCoordModalOpen(false)}
        onSaved={(newLoc) => {
          reloadData();
          addToast(`Titik "${newLoc.name}" berhasil disimpan!`, 'success');
        }}
      />

      {/* Modal Delete Confirmation */}
      <DeleteConfirmModal
        isOpen={deleteModalState.isOpen}
        title={deleteModalState.title}
        message={deleteModalState.message}
        itemCount={deleteModalState.itemCount}
        onConfirm={deleteModalState.onConfirm}
        onCancel={() => setDeleteModalState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Global Route Camera Modal (Opened from MapView or quick actions) */}
      <RouteCameraModal
        isOpen={Boolean(cameraModalLocation)}
        onClose={() => setCameraModalLocation(null)}
        initialLocation={cameraModalLocation}
        routeLocations={
          activeRoutePoints.length >= 2
            ? activeRoutePoints.map((pt, idx) => {
                const found = locations.find((l) => l.id === pt.id);
                if (found) return found;
                return {
                  id: pt.id || `pt-${idx}`,
                  name: pt.label || `Titik #${idx + 1}`,
                  latitude: pt.lat,
                  longitude: pt.lng,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
              })
            : locations
        }
        onPhotoSaved={() => {
          reloadData();
        }}
        onShowToast={addToast}
      />
    </div>
  );
}
