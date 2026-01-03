// API Base URL configuration
export const API_BASE_URL = 'http://192.168.18.230:5001';

// WebSocket URL configuration (use ws:// for WebSocket over HTTP)
export const WS_BASE_URL = 'http://192.168.18.230:5001';

export function apiUrl(path: string) {
  if (path.startsWith('http')) return path;
  return `${API_BASE_URL}${path}`;
}