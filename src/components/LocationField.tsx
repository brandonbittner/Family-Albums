import * as Crypto from 'expo-crypto';
import { MapPin, PenLine, Search, X } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DraggableSheet, { SheetDragArea } from '@/components/DraggableSheet';
import {
  canLookUpTown,
  lookupTown,
  requestTownLookupPermission,
  type Coordinates,
} from '@/lib/photo-location';
import {
  customLocation,
  getPlaceDetails,
  searchPlaces,
  type ArtifactLocation,
  type PlaceSuggestion,
} from '@/lib/places';

const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

/**
 * Shows the chosen location on the card; tapping opens a search sheet backed
 * by Google Places, with the typed text always available as a custom place.
 */
export default function LocationField({
  value,
  onChange,
  metadataCoords,
  disabled,
  style,
}: {
  value: ArtifactLocation | null;
  onChange: (location: ArtifactLocation | null) => void;
  /** GPS position from the file's metadata, offered as a town-level suggestion. */
  metadataCoords: Coordinates | null;
  disabled?: boolean;
  /** Style for the field container, so it matches sibling inputs. */
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  // Remounts the search each time the sheet opens: fresh query, session token and autofocus.
  const [openCount, setOpenCount] = useState(0);

  return (
    <View style={{ gap: 6 }}>
      <Pressable
        onPress={() => {
          setOpenCount((n) => n + 1);
          setOpen(true);
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={value ? `Location: ${value.name}. Change` : 'Add a location'}
        style={style}
      >
        <MapPin size={18} color="#737373" />
        {/* Just the place name — the full address is saved but not shown here. */}
        <Text style={[styles.text, { flex: 1 }, !value && { color: '#525252' }]} numberOfLines={1}>
          {value ? value.name : 'Add a location'}
        </Text>
        {value && !disabled && (
          <Pressable
            onPress={() => onChange(null)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear location"
            style={styles.clearBtn}
          >
            <X size={12} color="#A3A3A3" />
          </Pressable>
        )}
      </Pressable>

      {metadataCoords && !disabled && (
        <PhotoTownSuggestion coords={metadataCoords} value={value} onUse={onChange} />
      )}

      <DraggableSheet
        visible={open}
        onClose={() => setOpen(false)}
        fullHeight
        translucent
        // Results scroll, so only the handle and search bar drag the sheet.
        dragArea="handle"
      >
        <LocationSearch
          key={openCount}
          initialQuery={value?.placeId ? '' : (value?.name ?? '')}
          onCancel={() => setOpen(false)}
          onPick={(location) => {
            setOpen(false);
            onChange(location);
          }}
        />
      </DraggableSheet>
    </View>
  );
}

type TownLookup =
  | { status: 'loading' }
  | { status: 'needsPermission' }
  | { status: 'found'; town: string }
  | { status: 'none' };

/**
 * "Photo metadata says near Kennett Square, PA · Use this", from the phone's
 * built-in reverse geocoder. Deliberately town-level — for anything more
 * specific the user searches.
 */
function PhotoTownSuggestion({
  coords,
  value,
  onUse,
}: {
  coords: Coordinates;
  value: ArtifactLocation | null;
  onUse: (location: ArtifactLocation) => void;
}) {
  const [lookup, setLookup] = useState<TownLookup>({ status: 'loading' });

  const runLookup = (isCancelled: () => boolean) =>
    lookupTown(coords).then((town) => {
      if (!isCancelled()) setLookup(town ? { status: 'found', town } : { status: 'none' });
    });

  useEffect(() => {
    let cancelled = false;
    canLookUpTown().then((allowed) => {
      if (cancelled) return;
      if (allowed) runLookup(() => cancelled);
      else setLookup({ status: 'needsPermission' });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- look up once per photo position
  }, [coords.lat, coords.lng]);

  // Android only: the OS geocoder needs location permission, so ask on tap.
  const handleLookUp = async () => {
    setLookup({ status: 'loading' });
    if (await requestTownLookupPermission()) await runLookup(() => false);
    else setLookup({ status: 'none' });
  };

  if (lookup.status === 'needsPermission') {
    return (
      <Pressable onPress={handleLookUp} hitSlop={6} accessibilityRole="button">
        <Text style={styles.hint}>
          Photo has location metadata · <Text style={styles.hintLink}>Look up town</Text>
        </Text>
      </Pressable>
    );
  }

  // While the town is loading, or hidden because the field already matches it,
  // hold its line so the card doesn't resize when it appears or disappears.
  const placeholder = (
    <Text style={styles.hint} accessibilityElementsHidden importantForAccessibility="no">
      {' '}
    </Text>
  );

  if (lookup.status === 'loading') return placeholder;
  if (lookup.status !== 'found') return null;
  const { town } = lookup;
  if (value && value.placeId === null && value.name === town) return placeholder;

  return (
    <Pressable
      onPress={() =>
        onUse({ name: town, address: null, placeId: null, lat: coords.lat, lng: coords.lng })
      }
      hitSlop={6}
      accessibilityRole="button"
      accessibilityHint="Fills the location from the photo's metadata"
    >
      <Text style={styles.hint}>
        Photo metadata says near {town} · <Text style={styles.hintLink}>Use this</Text>
      </Text>
    </Pressable>
  );
}

function LocationSearch({
  initialQuery,
  onCancel,
  onPick,
}: {
  initialQuery: string;
  onCancel: () => void;
  onPick: (location: ArtifactLocation) => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  // One token per time the sheet is opened — Google bills the searches and the
  // final pick together as a single session.
  const [sessionToken] = useState(() => Crypto.randomUUID());
  const requestId = useRef(0);

  const trimmed = query.trim();

  useEffect(() => {
    const id = ++requestId.current;
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      searchPlaces(trimmed, sessionToken)
        .then((results) => {
          if (id !== requestId.current) return;
          setSuggestions(results);
          setFailed(false);
        })
        .catch((e) => {
          if (id !== requestId.current) return;
          console.error('[LocationSearch] searchPlaces failed:', e);
          setFailed(true);
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, sessionToken]);

  const pickSuggestion = async (s: PlaceSuggestion) => {
    setResolvingId(s.placeId);
    try {
      onPick(await getPlaceDetails(s, sessionToken));
    } catch (e) {
      // Still keep what the user chose, just without coordinates.
      console.error('[LocationSearch] getPlaceDetails failed:', e);
      onPick({ name: s.name, address: s.address, placeId: s.placeId, lat: null, lng: null });
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <SheetDragArea>
        <View style={styles.sheetHeader}>
          <View style={styles.searchBox}>
            <Search size={18} color="#737373" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search for a place"
              placeholderTextColor="#525252"
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              style={[styles.text, { flex: 1, padding: 0 }]}
            />
            {loading && <ActivityIndicator size="small" color="#737373" />}
          </View>
          <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: '#60A5FA', fontSize: 16, fontWeight: '500' }}>Cancel</Text>
          </Pressable>
        </View>
      </SheetDragArea>

      <FlatList
        data={suggestions}
        keyExtractor={(s) => s.placeId}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        ListHeaderComponent={
          <>
            {trimmed.length > 0 && (
              <ResultRow
                icon={<PenLine size={18} color="#A3A3A3" />}
                title={`Use “${trimmed}”`}
                subtitle="Add as a custom place"
                onPress={() => onPick(customLocation(trimmed))}
              />
            )}
            {failed && (
              <Text style={styles.notice}>
                Place search isn&apos;t available right now. You can still use what you typed.
              </Text>
            )}
          </>
        }
        renderItem={({ item }) => (
          <ResultRow
            icon={
              resolvingId === item.placeId ? (
                <ActivityIndicator size="small" color="#A3A3A3" />
              ) : (
                <MapPin size={18} color="#A3A3A3" />
              )
            }
            title={item.name}
            subtitle={item.address}
            disabled={resolvingId !== null}
            onPress={() => pickSuggestion(item)}
          />
        )}
      />
    </View>
  );
}

function ResultRow({
  icon,
  title,
  subtitle,
  disabled,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string | null;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button">
      {({ pressed }) => (
        <View style={[styles.row, pressed && { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
          <View style={styles.rowIcon}>{icon}</View>
          <View style={{ flex: 1 }}>
            <Text style={styles.text} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtext} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: { color: '#F5F5F5', fontSize: 16 },
  // Matches the date field's metadata suggestion.
  hint: { color: '#737373', fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
  hintLink: { color: '#60A5FA', fontWeight: '600' },
  subtext: { color: '#737373', fontSize: 13, marginTop: 1 },
  clearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  notice: { color: '#737373', fontSize: 13, paddingHorizontal: 16, paddingVertical: 12 },
});
