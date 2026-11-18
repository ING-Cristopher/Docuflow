const rawBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const defaultBaseUrl = import.meta.env.DEV ? 'http://localhost:5000' : '';

export const env = {
  apiBaseUrl: (rawBaseUrl !== undefined ? rawBaseUrl.trim() : defaultBaseUrl).replace(/\/+$/, ''),
};
