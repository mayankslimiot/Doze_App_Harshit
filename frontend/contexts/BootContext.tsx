import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';

/**
 * BootContext - Single source of truth for app boot state
 * 
 * Loads onboarding and setup flags ONCE at app startup.
 * Prevents race conditions from multiple AsyncStorage reads.
 * 
 * Key: 'onboarding_seen_v1' (consistent across entire app)
 */
type BootContextType = {
  bootReady: boolean;
  onboardingSeen: boolean;
  setupSeen: boolean;
  completeOnboarding: () => Promise<void>;
  completeSetup: () => Promise<void>;
};

const BootContext = createContext<BootContextType | undefined>(undefined);

const ONBOARDING_KEY = 'onboarding_seen_v1';
const SETUP_KEY = 'setup_seen_v1';

export function BootProvider({ children }: { children: React.ReactNode }) {
  const [bootReady, setBootReady] = useState(false);
  const [onboardingSeen, setOnboardingSeen] = useState(false);
  const [setupSeen, setSetupSeen] = useState(false);

  // Load boot flags ONCE at startup
  useEffect(() => {
    let mounted = true;

    const loadBootFlags = async () => {
      try {
        // Load both flags in parallel
        const [onboardingRaw, setupRaw] = await Promise.all([
          AsyncStorage.getItem(ONBOARDING_KEY),
          AsyncStorage.getItem(SETUP_KEY),
        ]);

        if (!mounted) return;

        // Set state - these values are now the single source of truth
        setOnboardingSeen(onboardingRaw === 'true');
        setSetupSeen(setupRaw === '1' || setupRaw === 'true');
        setBootReady(true);

        console.log('[BOOT] Flags loaded', {
          onboardingSeen: onboardingRaw === 'true',
          setupSeen: setupRaw === '1' || setupRaw === 'true',
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error('[BOOT] Failed to load flags:', error);
        if (!mounted) return;
        // On error, default to false (show onboarding/setup)
        setOnboardingSeen(false);
        setSetupSeen(false);
        setBootReady(true);
      }
    };

    loadBootFlags();

    return () => {
      mounted = false;
    };
  }, []);

  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      setOnboardingSeen(true);
      console.log('[BOOT] Onboarding completed', { timestamp: Date.now() });
    } catch (error) {
      console.error('[BOOT] Failed to save onboarding flag:', error);
    }
  };

  const completeSetup = async () => {
    try {
      await AsyncStorage.setItem(SETUP_KEY, '1');
      setSetupSeen(true);
      console.log('[BOOT] Setup completed', { timestamp: Date.now() });
    } catch (error) {
      console.error('[BOOT] Failed to save setup flag:', error);
    }
  };

  return (
    <BootContext.Provider
      value={{
        bootReady,
        onboardingSeen,
        setupSeen,
        completeOnboarding,
        completeSetup,
      }}
    >
      {children}
    </BootContext.Provider>
  );
}

export function useBoot() {
  const context = useContext(BootContext);
  if (!context) {
    throw new Error('useBoot must be used within BootProvider');
  }
  return context;
}

