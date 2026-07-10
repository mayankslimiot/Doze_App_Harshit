// API Base URL configuration
export const API_BASE_URL = 'https://dozemate.com';
export const WS_BASE_URL = 'https://dozemate.com';

// export const API_BASE_URL = 'http://192.168.1.114:5001';
// export const WS_BASE_URL = 'http://192.168.1.114:5001';

export function apiUrl(path: string) {
  if (path.startsWith('http')) return path;
  return `${API_BASE_URL}${path}`;
}
