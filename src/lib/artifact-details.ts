import { EMPTY_PARTIAL_DATE, normalizePartialDate, type PartialDate } from './partial-date';
import type { Coordinates } from './photo-location';
import type { ArtifactLocation } from './places';
import { supabase } from './supabase';
import type { Database } from '@/types/database';

type ArtifactRow = Database['public']['Tables']['artifacts']['Row'];

/** User-entered details for one artifact. */
export type ArtifactDetails = {
  caption: string;
  date: PartialDate;
  location: ArtifactLocation | null;
};

export const EMPTY_ARTIFACT_DETAILS: ArtifactDetails = {
  caption: '',
  date: EMPTY_PARTIAL_DATE,
  location: null,
};

/** One card on the details screen — a freshly picked asset or an existing artifact. */
export type DetailsItem = {
  key: string;
  /** Local or signed URL of an image to render. */
  previewUri: string | null;
  isVideo: boolean;
  /** Capture time from the file's EXIF data — offered to the user, never assumed. */
  metadataDate: Date | null;
  /** GPS position from the file's EXIF data — offered as a town, never assumed. */
  metadataCoords: Coordinates | null;
  details: ArtifactDetails;
};

/** The `artifacts` columns that hold user-entered details. */
export function detailsToColumns(details: ArtifactDetails) {
  const date = normalizePartialDate(details.date);
  return {
    caption: details.caption.trim() || null,
    date_year: date.year,
    date_month: date.month,
    date_day: date.day,
    location_name: details.location?.name || null,
    location_address: details.location?.address ?? null,
    location_place_id: details.location?.placeId ?? null,
    location_lat: details.location?.lat ?? null,
    location_lng: details.location?.lng ?? null,
  } satisfies Database['public']['Tables']['artifacts']['Update'];
}

export function detailsFromRow(row: ArtifactRow): ArtifactDetails {
  return {
    caption: row.caption ?? '',
    date: normalizePartialDate({ year: row.date_year, month: row.date_month, day: row.date_day }),
    location: row.location_name
      ? {
          name: row.location_name,
          address: row.location_address,
          placeId: row.location_place_id,
          lat: row.location_lat,
          lng: row.location_lng,
        }
      : null,
  };
}

export async function saveArtifactDetails(artifactId: string, details: ArtifactDetails) {
  const { error } = await supabase
    .from('artifacts')
    .update(detailsToColumns(details))
    .eq('id', artifactId);
  if (error) throw error;
}
