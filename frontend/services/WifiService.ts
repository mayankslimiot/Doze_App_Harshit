import { Platform } from 'react-native';
import WifiManager from 'react-native-wifi-reborn';


// Optional: quick sanity log to verify native module is loaded
console.log('[WiFi] WifiManager keys:', Object.keys(WifiManager || {}));

export type ScannedNetwork = { ssid: string; bssid?: string; capabilities?: string; level?: number; };
const isSecureCaps = (caps?: string) => !!caps && /(WPA|WEP)/i.test(caps);

async function getLocationModule() {
  try {
    const Location = await import('expo-location');
    // @ts-ignore
    if (!Location || !Location.requestForegroundPermissionsAsync) throw new Error('bad module');
    return Location;
  } catch {
    throw new Error('expo-location native module not available. Rebuild dev client (npx expo run:android) and launch via --dev-client.');
  }
}

export async function ensureWifiScanPermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const Location = await getLocationModule();
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location permission is required to scan Wi‑Fi.');
  const providers = await Location.getProviderStatusAsync();
  if (!providers.locationServicesEnabled) throw new Error('Location service is turned off');
}

function coerceToArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return Object.values(parsed as any);
    } catch {}
    return [];
  }
  if (raw && typeof raw === 'object') return Object.values(raw as any);
  return [];
}

export async function scanWifi(): Promise<ScannedNetwork[]> {
  if (Platform.OS === 'ios') return [];
  
  console.log('[WiFi] Starting WiFi scan...');
  await ensureWifiScanPermissions();
  console.log('[WiFi] Permissions checked successfully');

  let raw: unknown;
  let isThrottled = false;
  
  try {
    console.log('[WiFi] Calling reScanAndLoadWifiList...');
    raw = await WifiManager.reScanAndLoadWifiList();
    console.log('[WiFi] reScanAndLoadWifiList returned, type:', typeof raw);
    
    // Check if Android returned throttling error message
    if (typeof raw === 'string' && raw.includes('only allowed to scan')) {
      console.warn('[WiFi] ⚠️ Android scan throttling detected, trying cached results...');
      isThrottled = true;
      
      // Try to get cached results with loadWifiList
      try {
        // @ts-ignore optional on some versions
        raw = await WifiManager.loadWifiList?.();
        console.log('[WiFi] loadWifiList (cached) returned, type:', typeof raw);
      } catch (cacheError) {
        console.error('[WiFi] Failed to get cached list:', cacheError);
        throw new Error('Android WiFi scan throttled. Please wait 2 minutes and try again.');
      }
    }
  } catch (e) {
    console.warn('[WiFi] reScanAndLoadWifiList failed, trying loadWifiList():', e);
    try {
      // @ts-ignore optional on some versions
      raw = await WifiManager.loadWifiList?.();
      console.log('[WiFi] loadWifiList returned, type:', typeof raw);
    } catch (e2) {
      console.error('[WiFi] loadWifiList failed:', e2);
      throw new Error('Failed to scan WiFi networks. Please try again.');
    }
  }

  console.log('[WiFi] Raw scan result:', JSON.stringify(raw).substring(0, 500));
  
  // Check again if result is still a throttle message
  if (typeof raw === 'string' && raw.includes('only allowed to scan')) {
    throw new Error('WiFi scan throttled by Android (4 scans per 2 minutes limit). Please wait and try again.');
  }
  
  const arr = coerceToArray(raw);
  console.log('[WiFi] Coerced to array, length:', arr.length);
  
  if (arr.length > 0) {
    console.log('[WiFi] First network sample:', JSON.stringify(arr[0]));
  }
  
  try {
    const mapped = arr
      .map((n: any) => ({
        ssid: n?.SSID ?? n?.ssid ?? '',
        bssid: n?.BSSID ?? n?.bssid,
        capabilities: n?.capabilities,
        level: typeof n?.level === 'number' ? n.level : undefined,
      }))
      .filter(n => !!n.ssid);
    
    console.log('[WiFi] Mapped networks:', mapped.length);
    if (mapped.length > 0) {
      console.log('[WiFi] Sample mapped network:', JSON.stringify(mapped[0]));
    }
    
    if (isThrottled && mapped.length > 0) {
      console.log('[WiFi] ✅ Successfully retrieved', mapped.length, 'networks from cache');
    }
    
    return Array.isArray(mapped) ? mapped : [];
  } catch (e) {
    console.error('[WiFi] map/filter failed:', e, 'raw:', raw);
    return [];
  }
}


export async function waitForSsid(ssid: string, timeoutMs = 15000, intervalMs = 500) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const current = await WifiManager.getCurrentWifiSSID();
      if (current && current.replace(/"/g, '') === ssid) return true;
    } catch {}
    await new Promise(res => setTimeout(res, intervalMs));
  }
  return false;
}

export async function connectToNetwork(
  ssid: string,
  password?: string,
  capabilities?: string,
  isHidden: boolean = false
): Promise<void> {
  const secure = isSecureCaps(capabilities);
  const isWep = /(WEP)/i.test(capabilities || '');

  // Ensure we use the specifier-based API on Android 10+
  const hasSpecifier = typeof (WifiManager as any).connectToProtectedSSID === 'function';
  if (!hasSpecifier) {
    throw new Error('connectToProtectedSSID not available. Update react-native-wifi-reborn and rebuild the dev client.');
  }

  console.log('[WiFi] Connecting (specifier):', { ssid, secure, isWep, isHidden });

  await WifiManager.connectToProtectedSSID(
    ssid,
    secure ? String(password ?? '') : '',
    secure ? isWep : false,
    isHidden
  );

  // Wait until OS finishes the ephemeral connection
  const ok = await waitForSsid(ssid, 20000, 700);
  if (!ok) throw new Error('Failed to confirm Wi‑Fi connection (timeout).');
}


export function isSecure(capabilities?: string) { return isSecureCaps(capabilities); }