export type ArtifactEntry = {
  id: string;
  media_type: string;
  original_content_type: string;
};

let _artifacts: ArtifactEntry[] = [];
let _initialIndex = 0;

export function setArtifactList(artifacts: ArtifactEntry[], initialIndex: number) {
  _artifacts = artifacts;
  _initialIndex = initialIndex;
}

export function getArtifactList(): { artifacts: ArtifactEntry[]; initialIndex: number } {
  return { artifacts: _artifacts, initialIndex: _initialIndex };
}
