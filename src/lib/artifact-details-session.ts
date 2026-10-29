import { router } from 'expo-router';

import type { DetailsItem } from './artifact-details';

// Hands items to the details screen and back. Picked assets (with local URIs
// and EXIF) are too large for route params, so — like artifact-store — they
// live in module state for the duration of one details session.

export type DetailsSession = {
  artifacts: DetailsItem[];
  resolve: (result: DetailsItem[] | null) => void;
};

let _session: DetailsSession | null = null;

/**
 * Opens the artifact details screen for the given items. Resolves with the
 * same items (saved cards carry the user's details, the rest keep theirs),
 * or null if the user cancelled.
 */
export function collectArtifactDetails<T extends DetailsItem>(artifacts: T[]): Promise<T[] | null> {
  _session?.resolve(null);
  return new Promise((resolve) => {
    // The screen only ever hands back the items it was given, with new details.
    _session = { artifacts, resolve: resolve as DetailsSession['resolve'] };
    router.push('/artifact-details');
  });
}

export function getDetailsSession(): DetailsSession | null {
  return _session;
}

/** Ends the current session. Safe to call more than once — only the first call counts. */
export function finishDetailsSession(result: DetailsItem[] | null) {
  const session = _session;
  _session = null;
  session?.resolve(result);
}
