import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ArrowLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getArtifactUrl, type ContentType, type Variant } from '@/lib/storage';

// Isolated so useVideoPlayer is always called inside a mounted component.
function VideoArtifact({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });

  return (
    <VideoView
      player={player}
      style={{ flex: 1 }}
      nativeControls
      fullscreenOptions={{ enable: true }}
    />
  );
}

export default function ArtifactScreen() {
  const { artifactId, mediaType, contentType } = useLocalSearchParams<{
    artifactId: string;
    mediaType: string;
    contentType: string;
  }>();
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState<string | null>(null);

  const isVideo = mediaType === 'video';

  useEffect(() => {
    const variant: Variant = isVideo ? 'original' : 'display';
    getArtifactUrl(artifactId, variant, contentType as ContentType).then(setUrl);
  }, [artifactId, isVideo, contentType]);

  return (
    <View className="flex-1 bg-black">
      {url === null ? (
        <ActivityIndicator color="#a1a1aa" className="flex-1" />
      ) : isVideo ? (
        <VideoArtifact url={url} />
      ) : (
        <Image source={{ uri: url }} style={{ flex: 1 }} contentFit="contain" />
      )}

      {/* Back button — floats above content */}
      <Pressable
        className="absolute active:opacity-60"
        style={{ top: insets.top + 12, left: 16 }}
        hitSlop={12}
        onPress={() => router.back()}
      >
        <View className="bg-black/50 rounded-full p-2">
          <ArrowLeft size={20} color="white" />
        </View>
      </Pressable>
    </View>
  );
}
