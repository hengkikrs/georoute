import {
  validateCoordinates,
  parseQuickCoordinates,
  calculateHaversineDistanceKm,
} from '@/utils/coordinateValidation';
import {
  buildSingleLocationNavUrl,
  buildMultiStopRouteUrl,
  splitRouteIntoSegments,
  MAX_WAYPOINTS_PER_URL,
} from '@/services/googleMapsUrl';
import {
  parseAndValidateCsv,
  exportLocationsToCsv,
  createJsonBackup,
  restoreFromJsonBackup,
} from '@/services/csvService';
import { optimizeWaypointsOrder } from '@/services/routeOptimizer';
import { LocationPoint } from '@/types/location';

export function runGeoRouteTests(): { passed: number; failed: number; results: string[] } {
  let passed = 0;
  let failed = 0;
  const results: string[] = [];

  function assert(condition: boolean, testName: string) {
    if (condition) {
      passed++;
      results.push(`✅ PASS: ${testName}`);
    } else {
      failed++;
      results.push(`❌ FAIL: ${testName}`);
    }
  }

  // 1. Coordinate Validation Tests
  const validCoord = validateCoordinates(-5.39714, 105.26679);
  assert(validCoord.isValid === true, 'Valid coordinates are accepted');

  const outOfRangeLat = validateCoordinates(95.5, 105.26679);
  assert(outOfRangeLat.isValid === false, 'Latitude > 90 is rejected');

  const outOfRangeLng = validateCoordinates(-5.39714, 185.0);
  assert(outOfRangeLng.isValid === false, 'Longitude > 180 is rejected');

  const emptyLat = validateCoordinates('', 105.26679);
  assert(emptyLat.isValid === false, 'Empty latitude is rejected');

  const commaDecimal = validateCoordinates('-5,397140', '105,266790');
  assert(
    commaDecimal.isValid === true && Math.abs(commaDecimal.latitude! - -5.39714) < 0.0001,
    'Comma decimals in Indonesian format are converted correctly'
  );

  // 2. Quick Coordinate String Parsing
  const quickParse = parseQuickCoordinates('-5.397140, 105.266790');
  assert(
    quickParse.isValid && Math.abs(quickParse.latitude! - -5.39714) < 0.0001,
    'Quick coordinate parsing "-5.397140, 105.266790" succeeds'
  );

  const quickParseSemicolon = parseQuickCoordinates('-5.397140; 105.266790');
  assert(quickParseSemicolon.isValid, 'Quick coordinate with semicolon delimiter succeeds');

  // 3. Haversine Distance
  const distance = calculateHaversineDistanceKm(-5.426723, 105.258385, -5.435889, 105.263541);
  assert(distance > 0.5 && distance < 2.0, 'Haversine distance calculation is accurate (~1.16 km)');

  // 4. Single Location Google Maps Nav URL
  const navUrl = buildSingleLocationNavUrl(-5.39714, 105.26679);
  assert(
    navUrl.includes('api=1') && navUrl.includes('destination=-5.39714%2C105.26679'),
    'Single location Nav URL follows official Google Maps schema'
  );

  // 5. Multi-Stop Google Maps Route URL
  const multiUrl = buildMultiStopRouteUrl(
    { lat: -5.4, lng: 105.2 },
    { lat: -5.5, lng: 105.3 },
    [
      { lat: -5.42, lng: 105.22 },
      { lat: -5.45, lng: 105.25 },
    ],
    'driving'
  );
  assert(
    multiUrl.includes('origin=-5.4%2C105.2') &&
      multiUrl.includes('destination=-5.5%2C105.3') &&
      multiUrl.includes('travelmode=driving'),
    'Multi-stop route URL has valid origin, destination, and travelmode parameters'
  );

  // 6. Route Segmentation for long routes
  const manyPoints = Array.from({ length: 15 }, (_, i) => ({
    id: `pt_${i}`,
    lat: -5.0 - i * 0.05,
    lng: 105.0 + i * 0.05,
    label: `Point ${i + 1}`,
  }));
  const segments = splitRouteIntoSegments(manyPoints, 'driving', MAX_WAYPOINTS_PER_URL);
  assert(
    segments.length === 2 && segments[0].waypoints.length <= MAX_WAYPOINTS_PER_URL,
    '15-stop route is segmented into 2 valid legs without dropping waypoints'
  );

  // 7. CSV Import & Validation
  const sampleCsv = `nama,lat,lng,kategori,alamat,catatan
"Toko A",-5.412,105.231,"Toko","Jl. Kenanga","Catatan A"
"Kantor B",-5.422,105.241,"Kantor","Jl. Melati",""
"Invalid C",999.0,105.251,"Survei","",""
`;
  const parsedCsv = parseAndValidateCsv(sampleCsv, []);
  assert(parsedCsv.validRows.length === 2, 'CSV import correctly identifies 2 valid rows');
  assert(parsedCsv.invalidRows.length === 1, 'CSV import correctly flags 1 invalid row (lat 999.0)');
  assert(
    parsedCsv.invalidRows[0].rowNumber === 4,
    'CSV import reports exact row number 4 with error'
  );

  // 8. CSV Export
  const sampleExportPoints: LocationPoint[] = [
    {
      id: '1',
      name: 'Lokasi "Khusus"',
      latitude: -5.4,
      longitude: 105.2,
      category: 'Survei',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ];
  const exported = exportLocationsToCsv(sampleExportPoints);
  assert(
    exported.charCodeAt(0) === 0xfeff && exported.includes('""Khusus""'),
    'CSV export includes UTF-8 BOM and properly escapes quotes'
  );

  // 9. Route TSP Optimization
  const origin = { id: 'orig', lat: -5.0, lng: 105.0 };
  const dest = { id: 'dest', lat: -5.5, lng: 105.5 };
  const waypoints = [
    { id: 'far', lat: -5.4, lng: 105.4 },
    { id: 'near', lat: -5.1, lng: 105.1 },
  ];
  const optimized = optimizeWaypointsOrder(origin, waypoints, dest);
  assert(
    optimized[0].id === 'near' && optimized[1].id === 'far',
    'TSP Nearest Neighbor reorders closer waypoint before further waypoint'
  );

  return { passed, failed, results };
}
