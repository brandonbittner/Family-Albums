import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

/** Hero-size hardcover book used on the album detail and create screens. */
export default function AlbumBookCover({
  width,
  title,
  imageUri,
  placeholder,
}: {
  width: number;
  title: string | undefined;
  imageUri: string | null | undefined;
  /** Shown in place of the title when it's empty (e.g. while typing a new album name). */
  placeholder?: string;
}) {
  const showPlaceholder = !title && !!placeholder;
  return (
    <View
      style={{
        width,
        height: Math.round(width * 1.3),
        borderRadius: 2,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 36, height: 20 },
        shadowOpacity: 0.8,
        shadowRadius: 32,
        elevation: 32,
      }}
    >
      <View
        style={{
          flex: 1,
          paddingTop: 12,
          paddingBottom: 12,
          paddingLeft: 24,
          paddingRight: 12,
        }}
      >
        {/* Title — TODO: font discovery for cover typography (try Playfair Display, Cormorant, etc.) */}
        <Text
          style={{
            color: showPlaceholder ? '#B5B0AA' : '#1A1A1A',
            fontSize: 14,
            fontWeight: '700',
            lineHeight: 20,
            marginBottom: 14,
            marginTop: 6,
            textAlign: 'center',
            textTransform: 'uppercase',
            fontFamily: 'Georgia',
            letterSpacing: 1,
          }}
          numberOfLines={4}
        >
          {showPlaceholder ? placeholder : title}
        </Text>
        {/* Cover image */}
        <View style={{ flex: 1, borderRadius: 3, overflow: 'hidden', backgroundColor: '#E8E4DF' }}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={200}
            />
          ) : null}
        </View>
      </View>
      {/* Spine */}
      <LinearGradient
        colors={[
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0.22)',
          'rgba(0,0,0,0)',
          'rgba(255,255,255,0.13)',
          'rgba(255,255,255,0)',
        ]}
        locations={[0, 0.15, 0.3, 0.5, 0.75]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: 'absolute', top: 0, left: 5, bottom: 0, width: 26 }}
        pointerEvents="none"
      />
      {/* Bottom shadow */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.25)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 32 }}
        pointerEvents="none"
      />
    </View>
  );
}
