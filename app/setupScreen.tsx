import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  Dimensions,
  StatusBar,
  Linking,
  Animated,
  Platform,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');
const isTablet = width >= 768;

export default function SetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handleSetupDozemate = () => {
    router.push('/(bluetooth)/ScanScreen');
  };

  const handleBuyDozemate = () => {
    Linking.openURL('https://www.slimiot.com/');
  };

  const startZoomAnimation = React.useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.05,
        duration: 2000,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim]);

  React.useEffect(() => {
    startZoomAnimation();
    const interval = setInterval(startZoomAnimation, 4000);
    return () => clearInterval(interval);
  }, [startZoomAnimation]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#02041A" />

      <LinearGradient
        colors={['#1D244D', '#02041A', '#1A1D3E']}
        style={styles.gradientBackground}
      />

      <TouchableOpacity
        style={[styles.skipButton, { top: insets.top + (Platform.OS === 'ios' ? 10 : 10) }]}
        onPress={() => router.replace('/(tabs)/home')}
        activeOpacity={0.8}
      >
        <Text style={styles.skipButtonText}>Skip</Text>
      </TouchableOpacity>

      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.contentContainer}>
          <Text style={styles.title}>Connect your Dozemate</Text>

          <View style={styles.deviceContainer}>
            <Animated.Image
              source={require('../assets/images/dozemate_transparent.png')}
              style={[styles.deviceImage, { transform: [{ scale: scaleAnim }] }]}
              resizeMode="contain"
            />
          </View>

          <BlurView intensity={25} tint="dark" style={styles.glassContainer}>
            <View style={styles.buttonsContainer}>
              <TouchableOpacity
                style={styles.setupButton}
                onPress={handleSetupDozemate}
                activeOpacity={0.8}
              >
                <Text style={styles.setupButtonText}>Setup Dozemate</Text>
              </TouchableOpacity>

              <View style={styles.orDivider}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>OR</Text>
                <View style={styles.orLine} />
              </View>

              <TouchableOpacity
                style={styles.buyButton}
                onPress={handleBuyDozemate}
                activeOpacity={0.8}
              >
                <Text style={styles.buyButtonText}>Buy Dozemate</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#02041A',
  },
  gradientBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    minHeight: height,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: isTablet ? Math.min(width * 0.15, 100) : 20,
    paddingTop: isTablet ? 40 : 60,
    paddingBottom: isTablet ? 40 : 20,
  },
  title: {
    fontSize: isTablet ? 36 : 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: isTablet ? 30 : 20,
    paddingHorizontal: 20,
  },
  deviceContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginVertical: isTablet ? 30 : 20,
    minHeight: isTablet ? 300 : 200,
  },
  deviceImage: {
    width: isTablet ? Math.min(width * 0.6, 500) : Math.min(width * 0.8, 350),
    height: isTablet ? Math.min(width * 0.55, 450) : Math.min(width * 0.75, 320),
    maxWidth: 500,
    maxHeight: 450,
  },
  glassContainer: {
    width: '100%',
    maxWidth: isTablet ? 500 : '100%',
    alignSelf: 'center',
    padding: isTablet ? 30 : 20,
    borderRadius: 30,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  buttonsContainer: {
    width: '100%',
    gap: 0,
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 15,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  orText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: '500',
    marginHorizontal: 15,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  setupButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    paddingHorizontal: 30,
    borderRadius: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  setupButtonText: {
    color: '#1D244D',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buyButton: {
    backgroundColor: 'transparent',
    paddingVertical: 18,
    paddingHorizontal: 30,
    borderRadius: 25,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  buyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  skipButton: {
    position: 'absolute',
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.25)',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    zIndex: 10,
  },
  skipButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});


