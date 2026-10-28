import { supabase } from './supabase';

/**
 * Where an artifact is from. Picked places carry Google's id, address and
 * coordinates; a place the user typed themselves (e.g. "Grandma's house") has
 * only a name.
 */
export type ArtifactLocation = {
  name: string;
  address: string | null;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
};

export type PlaceSuggestion = {
  placeId: string;
  name: string;
  address: string | null;
};

export function customLocation(name: string): ArtifactLocation {
  return { name: name.trim(), address: null, placeId: null, lat: null, lng: null };
}

function languageCode(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

async function invokePlaces<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('places', {
    body: { ...body, languageCode: languageCode() },
  });
  if (error || !data) throw error ?? new Error('places returned no data');
  return data;
}

/**
 * Suggestions for what the user has typed so far. Pass the same sessionToken
 * for every call in one search, and to the final getPlaceDetails call.
 */
export async function searchPlaces(
  input: string,
  sessionToken: string,
): Promise<PlaceSuggestion[]> {
  const { suggestions } = await invokePlaces<{ suggestions: PlaceSuggestion[] }>({
    action: 'autocomplete',
    input,
    sessionToken,
  });
  return suggestions;
}

/** Resolves a picked suggestion to its full address and coordinates. */
export async function getPlaceDetails(
  suggestion: PlaceSuggestion,
  sessionToken: string,
): Promise<ArtifactLocation> {
  const { place } = await invokePlaces<{ place: Omit<ArtifactLocation, 'name'> }>({
    action: 'details',
    placeId: suggestion.placeId,
    sessionToken,
  });
  // The name comes from the suggestion — see the billing note in the places function.
  const address = place.address ?? suggestion.address;
  // Fall back to the first part of the address so a picked place is never nameless.
  const name = suggestion.name.trim() || address?.split(',')[0]?.trim() || '';
  return { ...place, name, address };
}
