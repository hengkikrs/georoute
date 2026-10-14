export interface CoordinateValidationResult {
  isValid: boolean;
  latitude?: number;
  longitude?: number;
  errorMessage?: string;
}

/**
 * Validates numeric latitude and longitude values
 */
export function validateCoordinates(
  lat: number | string | undefined | null,
  lng: number | string | undefined | null
): CoordinateValidationResult {
  if (lat === undefined || lat === null || lat === '' || lng === undefined || lng === null || lng === '') {
    return {
      isValid: false,
      errorMessage: 'Latitude dan Longitude tidak boleh kosong.',
    };
  }

  const numLat = typeof lat === 'number' ? lat : parseFloat(String(lat).replace(',', '.').trim());
  const numLng = typeof lng === 'number' ? lng : parseFloat(String(lng).replace(',', '.').trim());

  if (Number.isNaN(numLat) || !Number.isFinite(numLat)) {
    return {
      isValid: false,
      errorMessage: 'Latitude harus berupa angka valid.',
    };
  }

  if (Number.isNaN(numLng) || !Number.isFinite(numLng)) {
    return {
      isValid: false,
      errorMessage: 'Longitude harus berupa angka valid.',
    };
  }

  if (numLat < -90 || numLat > 90) {
    return {
      isValid: false,
      errorMessage: `Latitude (${numLat}) di luar rentang valid (-90 hingga +90).`,
    };
  }

  if (numLng < -180 || numLng > 180) {
    return {
      isValid: false,
      errorMessage: `Longitude (${numLng}) di luar rentang valid (-180 hingga +180).`,
    };
  }

  return {
    isValid: true,
    latitude: numLat,
    longitude: numLng,
  };
}

/**
 * Parses quick coordinate input like:
 * "-5.397140, 105.266790" or "-5.397140; 105.266790" or "Lat: -5.39, Lng: 105.26"
 */
export function parseQuickCoordinates(input: string): CoordinateValidationResult {
  if (!input || !input.trim()) {
    return {
      isValid: false,
      errorMessage: 'Masukkan teks koordinat.',
    };
  }

  // Remove common prefix words like lat, lng, latitude, longitude
  const cleaned = input
    .replace(/latitude[:=]?/gi, '')
    .replace(/longitude[:=]?/gi, '')
    .replace(/lat[:=]?/gi, '')
    .replace(/lng[:=]?/gi, '')
    .replace(/lon[:=]?/gi, '')
    .trim();

  // Try to match two floating point numbers (supporting optional negative sign)
  // Format 1: separated by comma, semicolon, space, or slash
  const separatorMatch = cleaned.split(/[,;\t/|\s]+/).filter(Boolean);

  if (separatorMatch.length >= 2) {
    const latStr = separatorMatch[0].replace(',', '.');
    const lngStr = separatorMatch[1].replace(',', '.');
    return validateCoordinates(latStr, lngStr);
  }

  return {
    isValid: false,
    errorMessage: 'Format koordinat tidak dikenali. Gunakan format contoh: -5.397140, 105.266790',
  };
}

/**
 * Formats coordinates for display (e.g. -5.397140, 105.266790)
 */
export function formatCoordinatePair(lat: number, lng: number, precision: number = 6): string {
  return `${lat.toFixed(precision)}, ${lng.toFixed(precision)}`;
}

/**
 * Calculates Haversine distance in kilometers between two lat/lng coordinates
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radius of the Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates total straight-line distance along a path of points in km
 */
export function calculatePathDistanceKm(
  points: { latitude: number; longitude: number }[]
): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += calculateHaversineDistanceKm(
      points[i].latitude,
      points[i].longitude,
      points[i + 1].latitude,
      points[i + 1].longitude
    );
  }
  return total;
}
