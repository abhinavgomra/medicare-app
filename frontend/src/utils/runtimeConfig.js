function buildHostBasedApiUrl() {
  if (typeof window === 'undefined' || !window.location) return 'http://localhost:5000';
  const { protocol, hostname } = window.location;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return 'https://medicare-backend-mgbj.onrender.com';
  }
  const apiPort = String(process.env.REACT_APP_API_PORT || '5000').trim();
  return `${protocol}//${hostname}:${apiPort}`;
}

export function getApiBaseUrl() {
  const explicit = String(process.env.REACT_APP_API_BASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  return buildHostBasedApiUrl();
}

