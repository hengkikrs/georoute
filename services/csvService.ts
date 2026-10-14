import { LocationPoint } from '@/types/location';
import { RoutePlan } from '@/types/route';
import { validateCoordinates } from '@/utils/coordinateValidation';
import { getStoredLocations, getStoredRoutes, saveLocationsToStorage, saveRoutesToStorage } from './locationStorage';

export interface CsvImportRowResult {
  rowNumber: number;
  data: Partial<LocationPoint>;
  isValid: boolean;
  isDuplicate: boolean;
  errors: string[];
}

export interface CsvImportSummary {
  totalRows: number;
  validRows: CsvImportRowResult[];
  invalidRows: CsvImportRowResult[];
  duplicateCount: number;
}

/**
 * Detects delimiter in the CSV text (comma, semicolon, or tab)
 */
function detectDelimiter(firstLine: string): string {
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  if (semicolonCount > commaCount && semicolonCount > tabCount) return ';';
  if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
  return ',';
}

/**
 * Standard CSV parser that respects quoted fields containing commas/delimiters and escaped quotes
 */
function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parses and validates CSV content for location import
 */
export function parseAndValidateCsv(
  csvContent: string,
  existingLocations: LocationPoint[] = []
): CsvImportSummary {
  // Strip BOM if present
  let cleanContent = csvContent;
  if (cleanContent.charCodeAt(0) === 0xfeff) {
    cleanContent = cleanContent.slice(1);
  }

  // Split into lines (handling \r\n, \r, and \n)
  const lines = cleanContent.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { totalRows: 0, validRows: [], invalidRows: [], duplicateCount: 0 };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]/g, '')
  );

  // Map header column indices
  let nameIdx = headers.findIndex((h) => ['nama', 'name', 'namalokasi', 'title'].includes(h));
  let latIdx = headers.findIndex((h) => ['lat', 'latitude', 'latitud', 'lintang'].includes(h));
  let lngIdx = headers.findIndex((h) => ['lng', 'lon', 'longitude', 'longitud', 'bujur'].includes(h));
  let catIdx = headers.findIndex((h) => ['category', 'kategori', 'tipe', 'type'].includes(h));
  let addrIdx = headers.findIndex((h) => ['address', 'alamat', 'deskripsi', 'description', 'desc'].includes(h));
  let notesIdx = headers.findIndex((h) => ['notes', 'catatan', 'keterangan', 'note'].includes(h));

  // Fallback heuristic if headers not recognized by keyword: first 3 columns are name, lat, lng
  if (nameIdx === -1 && latIdx === -1 && lngIdx === -1 && headers.length >= 3) {
    nameIdx = 0;
    latIdx = 1;
    lngIdx = 2;
    catIdx = headers.length > 3 ? 3 : -1;
    addrIdx = headers.length > 4 ? 4 : -1;
    notesIdx = headers.length > 5 ? 5 : -1;
  }

  const validRows: CsvImportRowResult[] = [];
  const invalidRows: CsvImportRowResult[] = [];
  let duplicateCount = 0;

  // Process data lines (line 2 onwards)
  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const values = parseCsvLine(lines[i], delimiter);

    // If completely empty line, skip
    if (values.every((v) => !v)) continue;

    const errors: string[] = [];
    const rawName = nameIdx !== -1 && values[nameIdx] !== undefined ? values[nameIdx].trim() : '';
    const rawLat = latIdx !== -1 && values[latIdx] !== undefined ? values[latIdx].trim() : '';
    const rawLng = lngIdx !== -1 && values[lngIdx] !== undefined ? values[lngIdx].trim() : '';
    const rawCat = catIdx !== -1 && values[catIdx] !== undefined ? values[catIdx].trim() : '';
    const rawAddr = addrIdx !== -1 && values[addrIdx] !== undefined ? values[addrIdx].trim() : '';
    const rawNotes = notesIdx !== -1 && values[notesIdx] !== undefined ? values[notesIdx].trim() : '';

    if (!rawName) {
      errors.push('Nama lokasi tidak boleh kosong.');
    }

    const coordVal = validateCoordinates(rawLat, rawLng);
    if (!coordVal.isValid) {
      errors.push(coordVal.errorMessage || 'Koordinat tidak valid.');
    }

    let isDuplicate = false;
    if (coordVal.isValid && coordVal.latitude !== undefined && coordVal.longitude !== undefined) {
      const matchExisting = existingLocations.some(
        (loc) =>
          Math.abs(loc.latitude - coordVal.latitude!) < 0.00005 &&
          Math.abs(loc.longitude - coordVal.longitude!) < 0.00005
      );
      if (matchExisting) {
        isDuplicate = true;
        duplicateCount++;
      }
    }

    const rowResult: CsvImportRowResult = {
      rowNumber: rowNum,
      data: {
        name: rawName,
        latitude: coordVal.latitude,
        longitude: coordVal.longitude,
        category: rawCat || 'Survei',
        address: rawAddr,
        notes: rawNotes,
      },
      isValid: errors.length === 0,
      isDuplicate,
      errors,
    };

    if (errors.length === 0) {
      validRows.push(rowResult);
    } else {
      invalidRows.push(rowResult);
    }
  }

  return {
    totalRows: validRows.length + invalidRows.length,
    validRows,
    invalidRows,
    duplicateCount,
  };
}

/**
 * Generates CSV string for exporting location points
 */
export function exportLocationsToCsv(locations: LocationPoint[]): string {
  const header = ['Nama', 'Latitude', 'Longitude', 'Kategori', 'Alamat', 'Catatan'];

  const rows = locations.map((loc) => {
    return [
      `"${(loc.name || '').replace(/"/g, '""')}"`,
      loc.latitude.toString(),
      loc.longitude.toString(),
      `"${(loc.category || '').replace(/"/g, '""')}"`,
      `"${(loc.address || '').replace(/"/g, '""')}"`,
      `"${(loc.notes || '').replace(/"/g, '""')}"`,
    ].join(',');
  });

  // UTF-8 BOM ensures Excel parses Indonesian accents and formatting without distortion
  return '\uFEFF' + [header.join(','), ...rows].join('\r\n');
}

/**
 * Triggers browser file download
 */
export function downloadFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * JSON Full Backup structure
 */
export interface JsonBackupPayload {
  app: string;
  version: string;
  exportedAt: string;
  locations: LocationPoint[];
  routes: RoutePlan[];
}

export function createJsonBackup(): string {
  const payload: JsonBackupPayload = {
    app: 'GeoRoute Planner',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    locations: getStoredLocations(),
    routes: getStoredRoutes(),
  };
  return JSON.stringify(payload, null, 2);
}

export function restoreFromJsonBackup(
  jsonString: string,
  mode: 'merge' | 'replace' = 'merge'
): { success: boolean; locationsRestored: number; routesRestored: number; message: string } {
  try {
    const data = JSON.parse(jsonString) as JsonBackupPayload;

    if (!data || !Array.isArray(data.locations)) {
      return {
        success: false,
        locationsRestored: 0,
        routesRestored: 0,
        message: 'Format file JSON tidak valid. Data lokasi tidak ditemukan.',
      };
    }

    const currentLocations = getStoredLocations();
    const currentRoutes = getStoredRoutes();

    if (mode === 'replace') {
      saveLocationsToStorage(data.locations);
      saveRoutesToStorage(Array.isArray(data.routes) ? data.routes : []);
      return {
        success: true,
        locationsRestored: data.locations.length,
        routesRestored: Array.isArray(data.routes) ? data.routes.length : 0,
        message: `Berhasil mengganti data dengan ${data.locations.length} lokasi dan ${data.routes?.length || 0} rute.`,
      };
    }

    // Merge mode
    const locationMap = new Map<string, LocationPoint>();
    currentLocations.forEach((loc) => locationMap.set(loc.id, loc));

    data.locations.forEach((newLoc) => {
      if (!locationMap.has(newLoc.id)) {
        locationMap.set(newLoc.id, newLoc);
      }
    });

    const mergedLocations = Array.from(locationMap.values());
    saveLocationsToStorage(mergedLocations);

    const routeMap = new Map<string, RoutePlan>();
    currentRoutes.forEach((r) => routeMap.set(r.id, r));
    if (Array.isArray(data.routes)) {
      data.routes.forEach((newRoute) => {
        if (!routeMap.has(newRoute.id)) {
          routeMap.set(newRoute.id, newRoute);
        }
      });
    }

    const mergedRoutes = Array.from(routeMap.values());
    saveRoutesToStorage(mergedRoutes);

    return {
      success: true,
      locationsRestored: mergedLocations.length - currentLocations.length,
      routesRestored: mergedRoutes.length - currentRoutes.length,
      message: `Berhasil menggabungkan data (${mergedLocations.length - currentLocations.length} lokasi baru ditambahkan).`,
    };
  } catch (err) {
    return {
      success: false,
      locationsRestored: 0,
      routesRestored: 0,
      message: 'Gagal memproses file JSON: ' + (err instanceof Error ? err.message : 'Error tidak diketahui'),
    };
  }
}

/**
 * Exports CSV specifically containing edited/documented photos and location survey metadata
 */
export function exportEditedPhotosCsv(
  locations: LocationPoint[],
  onlyWithPhotos = false
): string {
  const filtered = onlyWithPhotos
    ? locations.filter((loc) => Boolean(loc.imageUrl || (loc.images && loc.images.length > 0)))
    : locations;

  const header = [
    'No',
    'ID Lokasi',
    'Nama Lokasi',
    'Latitude',
    'Longitude',
    'Kategori',
    'Alamat',
    'Catatan Lapangan',
    'Status Foto',
    'Jumlah Foto',
    'File / URL Foto',
    'Waktu Diperbarui',
    'Tautan Google Maps',
  ];

  const rows = filtered.map((loc, idx) => {
    const hasPhoto = Boolean(loc.imageUrl || (loc.images && loc.images.length > 0));
    const photoCount = loc.images && loc.images.length > 0 ? loc.images.length : (loc.imageUrl ? 1 : 0);
    const photoUrl = loc.imageUrl || (loc.images && loc.images[0]) || '';
    const photoStatus = hasPhoto ? 'Sudah Ada Foto' : 'Belum Ada Foto';
    
    // Format timestamp nicely
    let formattedDate = loc.updatedAt || loc.createdAt || '';
    try {
      if (formattedDate) {
        const d = new Date(formattedDate);
        formattedDate = d.toLocaleString('id-ID', {
          timeZone: 'Asia/Jakarta',
          dateStyle: 'medium',
          timeStyle: 'short',
        });
      }
    } catch {
      // keep raw
    }

    const gmapsLink = `https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`;

    // Clean photo display for CSV: if it's base64, don't dump 500KB into CSV cell, summarize as [Base64 Data Image] or file URL
    let photoCell = photoUrl;
    if (photoUrl.startsWith('data:image/')) {
      photoCell = '[Gambar Base64 Lokal - Tersimpan di Applet]';
    }

    return [
      (idx + 1).toString(),
      `"${loc.id.replace(/"/g, '""')}"`,
      `"${(loc.name || '').replace(/"/g, '""')}"`,
      loc.latitude.toString(),
      loc.longitude.toString(),
      `"${(loc.category || '').replace(/"/g, '""')}"`,
      `"${(loc.address || '').replace(/"/g, '""')}"`,
      `"${(loc.notes || '').replace(/"/g, '""')}"`,
      `"${photoStatus}"`,
      photoCount.toString(),
      `"${photoCell.replace(/"/g, '""')}"`,
      `"${formattedDate.replace(/"/g, '""')}"`,
      `"${gmapsLink}"`,
    ].join(',');
  });

  return '\uFEFF' + [header.join(','), ...rows].join('\r\n');
}

