import { exifCoordinates, formatTown } from '@/lib/photo-location';

jest.mock('expo-location', () => ({}));

describe('exifCoordinates', () => {
  it('applies iOS-style N/S/E/W refs to positive values', () => {
    expect(
      exifCoordinates({
        GPSLatitude: 39.87,
        GPSLatitudeRef: 'N',
        GPSLongitude: 75.67,
        GPSLongitudeRef: 'W',
      }),
    ).toEqual({ lat: 39.87, lng: -75.67 });
    expect(
      exifCoordinates({
        GPSLatitude: 33.86,
        GPSLatitudeRef: 'S',
        GPSLongitude: 151.2,
        GPSLongitudeRef: 'E',
      }),
    ).toEqual({ lat: -33.86, lng: 151.2 });
  });

  it("doesn't flip Android's already-signed values again", () => {
    expect(
      exifCoordinates({
        GPSLatitude: -33.86,
        GPSLatitudeRef: 'S',
        GPSLongitude: -75.67,
        GPSLongitudeRef: 'W',
      }),
    ).toEqual({ lat: -33.86, lng: -75.67 });
  });

  it('ignores missing, zeroed or out-of-range positions', () => {
    expect(exifCoordinates(null)).toBeNull();
    expect(exifCoordinates({ DateTimeOriginal: '2015:03:03 10:00:00' })).toBeNull();
    expect(exifCoordinates({ GPSLatitude: 0, GPSLongitude: 0 })).toBeNull();
    expect(exifCoordinates({ GPSLatitude: 120, GPSLongitude: 10 })).toBeNull();
  });
});

describe('formatTown', () => {
  const blank = {
    city: null,
    district: null,
    subregion: null,
    region: null,
    country: null,
    isoCountryCode: null,
    name: null,
    postalCode: null,
    street: null,
    streetNumber: null,
    timezone: null,
    formattedAddress: null,
  };

  it('uses the town and region', () => {
    expect(formatTown({ ...blank, city: 'Kennett Square', region: 'PA' })).toBe(
      'Kennett Square, PA',
    );
  });

  it('falls back to broader areas and drops repeats', () => {
    expect(formatTown({ ...blank, subregion: 'Chester County', region: 'PA' })).toBe(
      'Chester County, PA',
    );
    expect(formatTown({ ...blank, city: 'New York', region: 'New York' })).toBe('New York');
    expect(formatTown({ ...blank, country: 'Iceland' })).toBe('Iceland');
    expect(formatTown(blank)).toBeNull();
  });
});
