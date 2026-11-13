const rawBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

export const env = {
  apiBaseUrl: (rawBaseUrl && rawBaseUrl.trim().length > 0 ? rawBaseUrl.trim() : 'http://localhost:5029').replace(
    /\/+$/,
    '',
  ),
};

