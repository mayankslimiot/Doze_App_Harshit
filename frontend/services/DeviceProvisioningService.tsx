import WifiManager from 'react-native-wifi-reborn';

export async function sendHomeWifiToDevice(opts: {
  deviceApIp: string;
  homeSsid: string;
  homePassword: string;
}) {
  const { deviceApIp, homeSsid, homePassword } = opts;

  const url = `http://${deviceApIp}/save`;
  const body = `ssid=${encodeURIComponent(homeSsid)}&password=${encodeURIComponent(homePassword)}`;

  console.log('[Provisioning] POST', url, 'body (masked):', { ssid: homeSsid, password: '********' });

  // Bind all requests to Wi‑Fi (important for APs without internet)
  try {
    // noInternet hints the OS to allow captive/no-internet networks
    await (WifiManager as any).forceWifiUsageWithOptions?.(true, { noInternet: true });
    console.log('[Provisioning] Bound traffic to Wi‑Fi');
  } catch (e) {
    console.warn('[Provisioning] forceWifiUsageWithOptions not available:', e);
    // Fallback
    try {
      await (WifiManager as any).forceWifiUsage?.(true);
    } catch {}
  }

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = await resp.text();
    console.log('[Provisioning] Response status:', resp.status);
    console.log('[Provisioning] Response body:', text);
    if (!resp.ok) throw new Error(`Device responded with ${resp.status}`);
    return text;
  } finally {
    // Unbind so normal networking resumes
    try {
      await (WifiManager as any).forceWifiUsageWithOptions?.(false);
    } catch {
      try { await (WifiManager as any).forceWifiUsage?.(false); } catch {}
    }
    console.log('[Provisioning] Unbound traffic from Wi‑Fi');
  }
}