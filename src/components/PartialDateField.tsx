import { Calendar, X } from 'lucide-react-native';
import { useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import DraggableSheet from '@/components/DraggableSheet';
import {
  calendarWeeks,
  EMPTY_PARTIAL_DATE,
  formatPartialDate,
  isSamePartialDate,
  MIN_YEAR,
  monthName,
  normalizePartialDate,
  partialDateFromDate,
  type PartialDate,
  weekdayLabels,
} from '@/lib/partial-date';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * Year → month → day entry for dates where only part may be known. Year is
 * typed; month and day are picked from a grid and unlock in order.
 */
export default function PartialDateField({
  value,
  onChange,
  metadataDate,
  disabled,
  style,
}: {
  value: PartialDate;
  onChange: (date: PartialDate) => void;
  /** Date from the file's metadata, offered as a one-tap suggestion. */
  metadataDate: Date | null;
  disabled?: boolean;
  /** Style for the field container, so it matches sibling inputs. */
  style?: StyleProp<ViewStyle>;
}) {
  const [yearText, setYearText] = useState(value.year !== null ? String(value.year) : '');
  const [sheetOpen, setSheetOpen] = useState(false);
  // Kept after closing so the sheet keeps its content while it slides away.
  const [sheet, setSheet] = useState<'month' | 'day'>('month');

  const openSheet = (which: 'month' | 'day') => {
    Keyboard.dismiss();
    setSheet(which);
    setSheetOpen(true);
  };
  const closeSheet = () => setSheetOpen(false);

  // Later parts are kept while an earlier one is being edited (e.g. retyping the
  // year), but only shown and saved once everything before them is filled in.
  const shown = normalizePartialDate(value);
  const hasAny = shown.year !== null || yearText.length > 0;
  const currentYear = new Date().getFullYear();
  const yearInvalid =
    yearText.length === 4 && (Number(yearText) < MIN_YEAR || Number(yearText) > currentYear);

  const metadata = metadataDate ? partialDateFromDate(metadataDate) : null;
  const showMetadata = metadata !== null && !isSamePartialDate(shown, metadata);

  const handleYearChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 4);
    setYearText(digits);
    const year = Number(digits);
    const valid = digits.length === 4 && year >= MIN_YEAR && year <= currentYear;
    onChange({ ...value, year: valid ? year : null });
    if (valid) Keyboard.dismiss();
  };

  const set = (date: PartialDate) => {
    setYearText(date.year !== null ? String(date.year) : '');
    onChange(date);
  };

  const pickMonth = (month: number) => {
    closeSheet();
    onChange({ ...value, month });
  };

  const pickDay = (day: number) => {
    closeSheet();
    onChange({ ...value, day });
  };

  const segmentColor = (filled: boolean, enabled: boolean) =>
    filled ? '#F5F5F5' : enabled ? '#737373' : '#3A3A3A';

  return (
    <View style={{ gap: 6 }}>
      <View style={style}>
        <Calendar size={18} color="#737373" />

        <TextInput
          value={yearText}
          onChangeText={handleYearChange}
          placeholder="Year"
          placeholderTextColor="#737373"
          keyboardType="number-pad"
          maxLength={4}
          editable={!disabled}
          accessibilityLabel="Year"
          style={[styles.segmentText, styles.yearInput, yearInvalid && { color: '#F87171' }]}
        />

        <View style={styles.divider} />

        <Pressable
          onPress={() => openSheet('month')}
          disabled={disabled || shown.year === null}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Month"
          style={styles.segment}
        >
          <Text
            style={[
              styles.segmentText,
              { color: segmentColor(shown.month !== null, shown.year !== null) },
            ]}
            numberOfLines={1}
          >
            {shown.month !== null ? monthName(shown.month) : 'Month'}
          </Text>
        </Pressable>

        <View style={styles.divider} />

        <Pressable
          onPress={() => openSheet('day')}
          disabled={disabled || shown.month === null}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Day"
          style={styles.segment}
        >
          <Text
            style={[
              styles.segmentText,
              { color: segmentColor(shown.day !== null, shown.month !== null) },
            ]}
            numberOfLines={1}
          >
            {shown.day !== null ? String(shown.day) : 'Day'}
          </Text>
        </Pressable>

        {hasAny && !disabled && (
          <Pressable
            onPress={() => set(EMPTY_PARTIAL_DATE)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear date"
            style={styles.clearBtn}
          >
            <X size={12} color="#A3A3A3" />
          </Pressable>
        )}
      </View>

      {yearInvalid ? (
        <Text style={styles.hint}>
          Enter a year between {MIN_YEAR} and {currentYear}
        </Text>
      ) : showMetadata && !disabled ? (
        <Pressable
          onPress={() => set(metadata)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityHint="Fills the date from the photo's metadata"
        >
          <Text style={styles.hint}>
            Photo metadata says {formatPartialDate(metadata)} ·{' '}
            <Text style={{ color: '#60A5FA', fontWeight: '600' }}>Use this</Text>
          </Text>
        </Pressable>
      ) : null}

      {/* ── Month / day picker sheet ── */}
      <DraggableSheet visible={sheetOpen} onClose={closeSheet} translucent>
        <View style={styles.sheetBody}>
          <Text style={styles.sheetTitle}>
            {sheet === 'month'
              ? `Month in ${shown.year}`
              : shown.month !== null && shown.year !== null
                ? `${monthName(shown.month, 'long')} ${shown.year}`
                : ''}
          </Text>

          {sheet === 'month' && (
            <View style={styles.grid}>
              {MONTHS.map((m) => (
                <GridCell
                  key={m}
                  label={monthName(m)}
                  selected={shown.month === m}
                  width="33.333%"
                  onPress={() => pickMonth(m)}
                />
              ))}
            </View>
          )}

          {sheet === 'day' && shown.year !== null && shown.month !== null && (
            <MonthCalendar
              year={shown.year}
              month={shown.month}
              selectedDay={shown.day}
              onPick={pickDay}
            />
          )}
        </View>
      </DraggableSheet>
    </View>
  );
}

const WEEKDAYS = weekdayLabels();
const DAY_SIZE = 40;

/** Sunday–Saturday month grid; days from neighbouring months are shown dimmed and inert. */
function MonthCalendar({
  year,
  month,
  selectedDay,
  onPick,
}: {
  year: number;
  month: number;
  selectedDay: number | null;
  onPick: (day: number) => void;
}) {
  const weeks = calendarWeeks(year, month);

  return (
    <View style={{ paddingHorizontal: 4 }}>
      <View style={styles.week}>
        {WEEKDAYS.map((label, i) => (
          <View key={i} style={styles.dayCell}>
            <Text style={styles.weekdayLabel}>{label}</Text>
          </View>
        ))}
      </View>
      {weeks.map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((cell, i) => {
            const selected = cell.inMonth && cell.day === selectedDay;
            return (
              <View key={i} style={styles.dayCell}>
                <Pressable
                  onPress={() => onPick(cell.day)}
                  disabled={!cell.inMonth}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: !cell.inMonth }}
                  accessibilityElementsHidden={!cell.inMonth}
                  importantForAccessibility={cell.inMonth ? 'auto' : 'no-hide-descendants'}
                >
                  {({ pressed }) => (
                    <View
                      style={[
                        styles.dayCircle,
                        selected && { backgroundColor: '#3B82F6' },
                        pressed && !selected && { backgroundColor: 'rgba(255,255,255,0.12)' },
                      ]}
                    >
                      <Text
                        style={{
                          color: cell.inMonth ? '#F5F5F5' : '#4A4A4A',
                          fontSize: 16,
                          fontWeight: selected ? '600' : '400',
                        }}
                      >
                        {cell.day}
                      </Text>
                    </View>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function GridCell({
  label,
  selected,
  width,
  onPress,
}: {
  label: string;
  selected: boolean;
  width: `${number}%`;
  onPress: () => void;
}) {
  return (
    <View style={{ width, padding: 4 }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}>
        {({ pressed }) => (
          <View
            style={[
              styles.cell,
              selected && { backgroundColor: '#3B82F6' },
              pressed && !selected && { backgroundColor: 'rgba(255,255,255,0.12)' },
            ]}
          >
            <Text style={{ color: '#F5F5F5', fontSize: 16, fontWeight: selected ? '600' : '400' }}>
              {label}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  segmentText: { color: '#F5F5F5', fontSize: 16 },
  yearInput: { width: 52, padding: 0, textAlign: 'center' },
  divider: { width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
  clearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  hint: { color: '#737373', fontSize: 13, paddingHorizontal: 4 },
  sheetBody: { paddingHorizontal: 16, paddingTop: 10 },
  sheetTitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  week: { flexDirection: 'row' },
  dayCell: { flex: 1, alignItems: 'center', paddingVertical: 3 },
  weekdayLabel: { color: '#737373', fontSize: 13, fontWeight: '600', paddingVertical: 6 },
  dayCircle: {
    width: DAY_SIZE,
    height: DAY_SIZE,
    borderRadius: DAY_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
