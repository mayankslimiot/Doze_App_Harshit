import React from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, StatusBar, FlatList, Animated, Image as RNImage } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// @ts-ignore
import Svg, { Defs, ClipPath, Path, Image as SvgImage, G } from 'react-native-svg';
import { useAuth } from '@/contexts/AuthContext';
import { useBoot } from '@/contexts/BootContext';
import { useTheme } from '@/contexts/ThemeContext';

const { width } = Dimensions.get('window');
const DOT_SIZE = 8;

type Slide = {
  id: string;
  title: string;
  subtitle: string;
  imageRequire: any;
};

const SLIDES: Slide[] = [
  {
    id: 'welcome',
    title: 'Sleep made smarter',
    subtitle: 'Track, understand, and improve your nights with Dozemate.',
    imageRequire: require('../assets/image1.png'),
  },
  {
    id: 'pair',
    title: 'Pair your device',
    subtitle: 'Connect via Bluetooth to set up your Dozemate.',
    imageRequire: require('../assets/image2.png'),
  },
  {
    id: 'place',
    title: 'Perfect placement',
    subtitle: 'Place the sensor under or over the mattress near the chest area.',
    imageRequire: require('../assets/image3.png'),
  },
  {
    id: 'wifi',
    title: 'Stay in sync',
    subtitle: 'Connect to your home Wi‑Fi to keep data updated securely.',
    imageRequire: require('../assets/image4.jpg'),
  },
  {
    id: 'insights',
    title: 'Private insights',
    subtitle: 'Get nightly insights and optional alerts — your data stays private.',
    imageRequire: require('../assets/image5.png'),
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { auth } = useAuth();
  const { completeOnboarding } = useBoot();
  const insets = useSafeAreaInsets();
  const { isLightTheme } = useTheme();
  const [page, setPage] = React.useState(0);
  const ref = React.useRef<FlatList<Slide>>(null);
  const progressAnim = React.useRef(new Animated.Value(0)).current;
  const floatAnim = React.useRef(new Animated.Value(0)).current;

  const titleStyle = [styles.title, isLightTheme && { color: '#111111' }];
  const subtitleStyle = [styles.subtitle, isLightTheme && { color: '#666666' }];
  const skipTextStyle = [styles.skipText, isLightTheme && { color: '#0061A4' }];
  const dotShellStyle = [styles.dotShell, isLightTheme && { backgroundColor: 'rgba(0, 97, 164, 0.15)' }];
  const dotFillStyle = [styles.dotFill, isLightTheme && { backgroundColor: '#0061A4' }];
  const ctaBtnStyle = [styles.ctaBtn, isLightTheme && { backgroundColor: '#0061A4' }];
  const ctaTextStyle = [styles.ctaText, isLightTheme && { color: '#FFFFFF' }];

  // Simple floating animation for the artwork container
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [floatAnim]);

  const isLast = page === SLIDES.length - 1;

  const onNext = () => {
    // Stop any running timer
    try { progressAnim.stopAnimation(); } catch {}
    if (isLast) {
      onDone();
    } else {
      const next = page + 1;
      setPage(next);
      ref.current?.scrollToIndex({ index: next, animated: true });
    }
  };

  const onSkip = () => onDone();

  const onDone = async () => {
    // Mark onboarding as complete using BootContext (single source of truth)
    await completeOnboarding();
    
    // NavigationGuard will handle routing based on auth and device status
    // Navigate to a neutral route and let NavigationGuard decide
    if (auth.isLoggedIn) {
      router.replace('/(tabs)/home');
    } else {
      router.replace('/');
    }
  };

  const renderItem = ({ item, index }: { item: Slide; index: number }) => {
    return (
      <View style={{ width }}>
        <Animated.View style={[styles.illustrationWrap, { transform: [{ translateY: floatAnim.interpolate({ inputRange: [0,1], outputRange: [0, -8] }) }] }]}>
          <ShapedArt source={item.imageRequire} variant={index % 3} isLight={isLightTheme} />
        </Animated.View>
        <Text style={titleStyle}>{item.title}</Text>
        <Text style={subtitleStyle}>{item.subtitle}</Text>
      </View>
    );
  };

  // Auto-progress timer (2s per slide)
  React.useEffect(() => {
    progressAnim.setValue(0);
    const anim = Animated.timing(progressAnim, {
      toValue: 1,
      duration: 3000,
      useNativeDriver: false, // driving width
    });
    anim.start(({ finished }) => {
      if (finished) onNext();
    });
    return () => {
      try { progressAnim.stopAnimation(); } catch {}
    };
  }, [page]);

  const activeDotWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, DOT_SIZE] });

  return (
    <View style={[styles.container, isLightTheme && { backgroundColor: '#F8F9FA' }]}>
      <StatusBar barStyle={isLightTheme ? 'dark-content' : 'light-content'} backgroundColor={isLightTheme ? '#F8F9FA' : '#02041A'} />
      {isLightTheme ? null : (
        <LinearGradient colors={["#1D244D", "#02041A", "#1A1D3E"]} style={StyleSheet.absoluteFill} />
      )}

      <View style={styles.skipWrap}>
        <TouchableOpacity onPress={onSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={skipTextStyle}>Skip</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={ref}
        data={SLIDES}
        keyExtractor={(s) => s.id}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setPage(idx);
        }}
        contentContainerStyle={{ alignItems: 'center' }}
      />

      {/* Dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => {
          const isPast = i < page;
          const isCurrent = i === page;
          return (
            <View key={i} style={dotShellStyle}>
              {isPast ? (
                <View style={[dotFillStyle, { width: DOT_SIZE }]} />
              ) : isCurrent ? (
                <Animated.View style={[dotFillStyle, { width: activeDotWidth }]} />
              ) : null}
            </View>
          );
        })}
      </View>

      {/* CTA */}
      <TouchableOpacity style={ctaBtnStyle} onPress={onNext} activeOpacity={0.9}>
        <Text style={ctaTextStyle}>{isLast ? 'Get started' : 'Next'}</Text>
      </TouchableOpacity>
      <View style={{ height: Math.max(18, insets.bottom + 10) }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02041A' },
  illustrationWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: 24 },
  subtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 14, textAlign: 'center', marginTop: 10, paddingHorizontal: 28, lineHeight: 20 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  dotShell: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, backgroundColor: 'rgba(199,185,255,0.18)', overflow: 'hidden', position: 'relative' },
  dotFill: { position: 'absolute', left: 0, top: 0, height: DOT_SIZE, backgroundColor: '#C7B9FF', borderRadius: DOT_SIZE / 2 },
  ctaBtn: { marginHorizontal: 20, marginTop: 16, backgroundColor: '#FFFFFF', paddingVertical: 14, borderRadius: 20, alignItems: 'center' },
  ctaText: { color: '#1D244D', fontWeight: '800' },
  skipWrap: { position: 'absolute', right: 16, top: (StatusBar.currentHeight || 44) + 10, zIndex: 2 },
  skipText: { color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
});

type ShapedArtProps = { source: any; variant?: number; isLight?: boolean };
function ShapedArt({ source, variant = 0, isLight = false }: ShapedArtProps) {
  const artW = Math.min(width * 0.86, 360);
  const artH = 260;

  // Three shape paths in a 1000x1000 box; we scale to desired size
  const shapes = [
    // Squircle
    'M500,0 C776,0 1000,224 1000,500 C1000,776 776,1000 500,1000 C224,1000 0,776 0,500 C0,224 224,0 500,0 Z',
    // Organic blob
    'M795,161C896,237 966,362 972,500C978,636 920,775 821,858C722,942 583,970 458,934C333,898 223,799 153,682C84,565 55,430 105,314C155,198 284,100 420,69C556,37 699,84 795,161Z',
    // Tilted rounded diamond
    'M500,40 C640,120 880,260 960,400 C1000,470 1000,530 960,600 C880,740 640,880 500,960 C360,880 120,740 40,600 C0,530 0,470 40,400 C120,260 360,120 500,40 Z',
  ];
  const d = shapes[variant % shapes.length];

  const scaleX = artW / 1000;
  const scaleY = artH / 1000;

  return (
    <View>
      {/* Ambient ring behind */}
      <View style={{ position: 'absolute', alignSelf: 'center', width: artW * 0.9, height: artH * 0.9, borderRadius: Math.min(artW, artH), backgroundColor: isLight ? 'rgba(0, 97, 164, 0.05)' : 'rgba(199,185,255,0.10)' }} />
      <Svg width={artW} height={artH}>
        <Defs>
          <ClipPath id="clip">
            <Path d={d} transform={`scale(${scaleX} ${scaleY})`} />
          </ClipPath>
        </Defs>
        {/* Border outline */}
        <G>
          <Path d={d} transform={`scale(${scaleX} ${scaleY})`} fill="none" stroke={isLight ? '#0061A4' : '#C7B9FF'} strokeOpacity={isLight ? 0.12 : 0.22} strokeWidth={2} />
        </G>
        {/* Image clipped to shape */}
        <SvgImage
          width={artW}
          height={artH}
          preserveAspectRatio="xMidYMid slice"
          href={RNImage.resolveAssetSource(source)?.uri || source}
          clipPath="url(#clip)"
        />
        {/* Inner soft border */}
        <G>
          <Path d={d} transform={`scale(${scaleX} ${scaleY})`} fill="none" stroke={isLight ? '#0061A4' : '#C7B9FF'} strokeOpacity={isLight ? 0.20 : 0.35} strokeWidth={0.8} />
        </G>
      </Svg>
    </View>
  );
}


