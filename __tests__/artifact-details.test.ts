import { detailsFromRow, detailsToColumns, type ArtifactDetails } from '@/lib/artifact-details';
import type { Database } from '@/types/database';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

type ArtifactRow = Database['public']['Tables']['artifacts']['Row'];

function rowWith(columns: ReturnType<typeof detailsToColumns>): ArtifactRow {
  return {
    id: 'a',
    uploaded_by: 'u',
    media_type: 'photo',
    status: 'ready',
    width: 1,
    height: 1,
    duration_seconds: null,
    original_content_type: 'image/jpeg',
    file_size_bytes: 1,
    taken_at: null,
    created_at: '',
    updated_at: '',
    deleted_at: null,
    dominant_colors: null,
    metadata_lat: null,
    metadata_lng: null,
    ...columns,
  };
}

describe('detailsToColumns / detailsFromRow', () => {
  it('round-trips a fully filled-in artifact', () => {
    const details: ArtifactDetails = {
      caption: 'Took mom and dad to Longwood Gardens',
      date: { year: 2018, month: 3, day: 30 },
      location: {
        name: 'Longwood Gardens',
        address: '1001 Longwood Rd, Kennett Square, PA 19348, USA',
        placeId: 'ChIJ123',
        lat: 39.87,
        lng: -75.67,
      },
    };
    expect(detailsFromRow(rowWith(detailsToColumns(details)))).toEqual(details);
  });

  it('stores blanks as nulls and reads them back as empty details', () => {
    const columns = detailsToColumns({
      caption: '   ',
      date: { year: null, month: 6, day: 14 },
      location: null,
    });
    expect(columns).toEqual({
      caption: null,
      date_year: null,
      date_month: null,
      date_day: null,
      location_name: null,
      location_address: null,
      location_place_id: null,
      location_lat: null,
      location_lng: null,
    });
    expect(detailsFromRow(rowWith(columns))).toEqual({
      caption: '',
      date: { year: null, month: null, day: null },
      location: null,
    });
  });

  it('keeps a custom place with only a name', () => {
    const columns = detailsToColumns({
      caption: '',
      date: { year: 1987, month: null, day: null },
      location: { name: "Grandma's house", address: null, placeId: null, lat: null, lng: null },
    });
    expect(detailsFromRow(rowWith(columns)).location).toEqual({
      name: "Grandma's house",
      address: null,
      placeId: null,
      lat: null,
      lng: null,
    });
  });
});
