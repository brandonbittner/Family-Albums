import { router } from 'expo-router';

import type { SelectedArtifact } from './upload-artifacts';

// Hands picked artifacts to the details screen and back. Assets (with local
// URIs and EXIF) are too large for route params, so — like artifact-store —
// they live in module state for the duration of one details session.

export type DetailsSession = {
  artifacts: SelectedArtifact[];
  resolve: (result: SelectedArtifact[] | null) => void;
};

let _session: DetailsSession | null = null;

/**
 * Opens the artifact details screen for the given selections. Resolves with the
 * selections (saved cards carry the user's details, the rest keep their defaults),
 * or null if the user cancelled the upload.
 */
export function collectArtifactDetails(
  artifacts: SelectedArtifact[],
): Promise<SelectedArtifact[] | null> {
  _session?.resolve(null);
  return new Promise((resolve) => {
    _session = { artifacts, resolve };
    router.push('/artifact-details');
  });
}

export function getDetailsSession(): DetailsSession | null {
  return _session;
}

/** Ends the current session. Safe to call more than once — only the first call counts. */
export function finishDetailsSession(result: SelectedArtifact[] | null) {
  const session = _session;
  _session = null;
  session?.resolve(result);
}
