import { RouteCoordinate } from '@/types/route';
import { calculateHaversineDistanceKm } from '@/utils/coordinateValidation';

/**
 * Optimizes the visiting sequence of waypoints between an origin and destination
 * using Nearest Neighbor TSP followed by 2-Opt path uncrossing.
 *
 * Origin and Destination remain fixed at the start and end of the route.
 * Waypoints in between are reordered to minimize the total straight-line distance.
 */
export function optimizeWaypointsOrder(
  origin: RouteCoordinate,
  waypoints: RouteCoordinate[],
  destination: RouteCoordinate
): RouteCoordinate[] {
  if (waypoints.length <= 1) {
    return [...waypoints];
  }

  // 1. Nearest Neighbor Heuristic
  const unvisited = [...waypoints];
  const ordered: RouteCoordinate[] = [];
  let currentPos = origin;

  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let shortestDist = calculateHaversineDistanceKm(
      currentPos.lat,
      currentPos.lng,
      unvisited[0].lat,
      unvisited[0].lng
    );

    for (let i = 1; i < unvisited.length; i++) {
      const dist = calculateHaversineDistanceKm(
        currentPos.lat,
        currentPos.lng,
        unvisited[i].lat,
        unvisited[i].lng
      );
      if (dist < shortestDist) {
        shortestDist = dist;
        nearestIndex = i;
      }
    }

    const nextPoint = unvisited.splice(nearestIndex, 1)[0];
    ordered.push(nextPoint);
    currentPos = nextPoint;
  }

  // 2. 2-Opt optimization for paths with 4 or more intermediate waypoints
  if (ordered.length >= 4) {
    let improved = true;
    let iterations = 0;
    const maxIterations = 50;

    const fullPath = [origin, ...ordered, destination];

    while (improved && iterations < maxIterations) {
      improved = false;
      iterations++;

      // Check waypoint index swaps (indices 1 to fullPath.length - 2)
      for (let i = 1; i < fullPath.length - 2; i++) {
        for (let k = i + 1; k < fullPath.length - 1; k++) {
          const currentDist =
            calculateHaversineDistanceKm(
              fullPath[i - 1].lat,
              fullPath[i - 1].lng,
              fullPath[i].lat,
              fullPath[i].lng
            ) +
            calculateHaversineDistanceKm(
              fullPath[k].lat,
              fullPath[k].lng,
              fullPath[k + 1].lat,
              fullPath[k + 1].lng
            );

          const newDist =
            calculateHaversineDistanceKm(
              fullPath[i - 1].lat,
              fullPath[i - 1].lng,
              fullPath[k].lat,
              fullPath[k].lng
            ) +
            calculateHaversineDistanceKm(
              fullPath[i].lat,
              fullPath[i].lng,
              fullPath[k + 1].lat,
              fullPath[k + 1].lng
            );

          if (newDist < currentDist - 0.001) {
            // Reverse order between i and k
            const reversedSlice = fullPath.slice(i, k + 1).reverse();
            fullPath.splice(i, reversedSlice.length, ...reversedSlice);
            improved = true;
          }
        }
      }
    }

    // Return the reordered waypoints (excluding origin and destination)
    return fullPath.slice(1, -1);
  }

  return ordered;
}
