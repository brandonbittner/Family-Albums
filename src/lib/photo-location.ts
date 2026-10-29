import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type Coordinates = { lat: number; lng: number };

function coordinate(value: unknown, ref: unknown, negativeRef: 'S' | 'W'): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  // iOS reports a positive value plus an N/S/E/W ref; Android's value is
  // already signed. Only apply the ref to a positive value so neither flips twice.
  return n > 0 && typeof ref === 'string' && ref.toUpperCase() === negativeRef ? -n : n;
}

/** GPS position from an image picker asset's EXIF, if the photo has one. */
export function exifCoordinates(
  exif: Record<string, unknown> | null | undefined,
): Coordinates | null {
  if (!exif) return null;
  const lat = coordinate(exif.GPSLatitude, exif.GPSLatitudeRef, 'S');
  const lng = coordinate(exif.GPSLongitude, exif.GPSLongitudeRef, 'W');
  if (lat === null || lng === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // 0,0 is what stripped or redacted metadata usually looks like.
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/** "Kennett Square, PA" — the town and region, falling back to broader areas. */
export function formatTown(address: Location.LocationGeocodedAddress): string | null {
  const town = address.city ?? address.district ?? address.subregion;
  const parts = [town, address.region].filter((p): p is string => !!p);
  if (parts.length === 0 && address.country) parts.push(address.country);
  // Avoid "New York, New York"-style repeats.
  return [...new Set(parts)].join(', ') || null;
}

/**
 * Android only allows reverse geocoding once location permission is granted;
 * iOS needs no permission for it.
 */
export async function canLookUpTown(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const { granted } = await Location.getForegroundPermissionsAsync();
  return granted;
}

export async function requestTownLookupPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const { granted } = await Location.requestForegroundPermissionsAsync();
  return granted;
}

// The OS geocoder errors when hit with many requests at once, and every card
// in a batch asks as soon as it mounts — so lookups run one at a time, and
// nearby photos (same ~100m) share a result.
const cache = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

export function lookupTown({ lat, lng }: Coordinates): Promise<string | null> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const result = queue.then(async () => {
    const [address] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return address ? formatTown(address) : null;
  });
  queue = result.catch(() => undefined);
  // Don't cache failures, so a later card can try again.
  const tracked = result.catch((e) => {
    cache.delete(key);
    console.error('[lookupTown] reverseGeocodeAsync failed:', e);
    return null;
  });
  cache.set(key, tracked);
  return tracked;
}
