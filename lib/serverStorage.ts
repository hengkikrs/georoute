import fs from 'fs';
import path from 'path';
import { LocationPoint } from '@/types/location';
import { RoutePlan } from '@/types/route';

const DATA_DIR = path.join(process.cwd(), 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const LOCATIONS_FILE = path.join(DATA_DIR, 'locations.json');
const ROUTES_FILE = path.join(DATA_DIR, 'routes.json');
const META_FILE = path.join(DATA_DIR, 'meta.json');

// Sample initial data if server starts with empty storage
const INITIAL_SAMPLE_LOCATIONS: LocationPoint[] = [
  {
    id: 'loc_sample_1',
    name: 'Tugu Adipura (Gajah)',
    latitude: -5.426723,
    longitude: 105.258385,
    category: 'Survei',
    address: 'Jl. Raden Intan, Enggal, Bandar Lampung',
    notes: 'Titik nol / landmark pusat kota',
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
  },
  {
    id: 'loc_sample_2',
    name: 'Kantor Pos Pahoman',
    latitude: -5.435889,
    longitude: 105.263541,
    category: 'Kantor',
    address: 'Jl. K.H. Ahmad Dahlan, Pahoman',
    notes: 'Pemberhentian logistik',
    createdAt: '2026-10-01T08:15:00.000Z',
    updatedAt: '2026-10-01T08:15:00.000Z',
  },
  {
    id: 'loc_sample_3',
    name: 'Pusat Logistik Teluk Betung',
    latitude: -5.448912,
    longitude: 105.271895,
    category: 'Gudang',
    address: 'Jl. Ikan Hiu, Teluk Betung Selatan',
    notes: 'Gudang distribusi selatan',
    createdAt: '2026-10-01T08:30:00.000Z',
    updatedAt: '2026-10-01T08:30:00.000Z',
  },
  {
    id: 'loc_sample_4',
    name: 'Toko Mitra Kedaton',
    latitude: -5.388145,
    longitude: 105.253908,
    category: 'Toko',
    address: 'Jl. Teuku Umar No. 42, Kedaton',
    notes: 'Kunjungan pengecekan stok display',
    createdAt: '2026-10-01T08:45:00.000Z',
    updatedAt: '2026-10-01T08:45:00.000Z',
  },
  {
    id: 'loc_sample_5',
    name: 'Pelanggan Rajabasa Baru',
    latitude: -5.366421,
    longitude: 105.242115,
    category: 'Pelanggan',
    address: 'Jl. ZA. Pagar Alam, Rajabasa',
    notes: 'Pemeriksaan koordinat POI pelanggan prioritas',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
  },
];

export function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export function getServerLocations(): LocationPoint[] {
  ensureDirectories();
  try {
    if (!fs.existsSync(LOCATIONS_FILE)) {
      fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(INITIAL_SAMPLE_LOCATIONS, null, 2), 'utf-8');
      return INITIAL_SAMPLE_LOCATIONS;
    }
    const raw = fs.readFileSync(LOCATIONS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error reading server locations:', err);
    return [];
  }
}

export function saveServerLocations(locations: LocationPoint[]) {
  ensureDirectories();
  fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(locations, null, 2), 'utf-8');
  updateServerMeta();
}

export function getServerRoutes(): RoutePlan[] {
  ensureDirectories();
  try {
    if (!fs.existsSync(ROUTES_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(ROUTES_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error reading server routes:', err);
    return [];
  }
}

export function saveServerRoutes(routes: RoutePlan[]) {
  ensureDirectories();
  fs.writeFileSync(ROUTES_FILE, JSON.stringify(routes, null, 2), 'utf-8');
  updateServerMeta();
}

export function updateServerMeta(): { lastUpdated: string } {
  ensureDirectories();
  const meta = { lastUpdated: new Date().toISOString() };
  try {
    fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing meta file:', err);
  }
  return meta;
}

export function getServerMeta(): { lastUpdated: string } {
  ensureDirectories();
  try {
    if (fs.existsSync(META_FILE)) {
      return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
    }
  } catch {
    // fallback
  }
  return { lastUpdated: new Date().toISOString() };
}

/**
 * Saves a base64 or binary image file to server uploads directory
 * Returns relative API URL: /api/images/[filename]
 */
export function saveImageFile(dataUrlOrBuffer: string | Buffer, customFilename?: string): string {
  ensureDirectories();

  let buffer: Buffer;
  let ext = 'jpg';

  if (typeof dataUrlOrBuffer === 'string') {
    const match = dataUrlOrBuffer.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (match) {
      ext = match[1] === 'jpeg' ? 'jpg' : match[1];
      buffer = Buffer.from(match[2], 'base64');
    } else {
      // not a data URL or already a URL
      return dataUrlOrBuffer;
    }
  } else {
    buffer = dataUrlOrBuffer;
  }

  const filename = customFilename || `photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);

  fs.writeFileSync(filepath, buffer);
  return `/api/images/${filename}`;
}

/**
 * Normalizes location list by converting any raw base64 data URLs in imageUrl / images into static /api/images files
 * This keeps the JSON file small and lightning fast across phone and laptop!
 */
export function processLocationImages(locations: LocationPoint[]): LocationPoint[] {
  return locations.map((loc) => {
    let updatedLoc = { ...loc };

    if (updatedLoc.imageUrl && updatedLoc.imageUrl.startsWith('data:image/')) {
      const savedUrl = saveImageFile(updatedLoc.imageUrl);
      updatedLoc.imageUrl = savedUrl;
    }

    if (Array.isArray(updatedLoc.images)) {
      updatedLoc.images = updatedLoc.images.map((img) => {
        if (img && img.startsWith('data:image/')) {
          return saveImageFile(img);
        }
        return img;
      });
    }

    return updatedLoc;
  });
}
