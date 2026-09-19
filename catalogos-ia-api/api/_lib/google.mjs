let cachedAccessToken = '';
let cachedAccessTokenExpiresAt = 0;

export function hasGoogleDriveCredentials() {
  if (process.env.GOOGLE_DRIVE_OAUTH_ACCESS_TOKEN) return true;
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
}

export async function getGoogleDriveAccessToken() {
  const fixedToken = process.env.GOOGLE_DRIVE_OAUTH_ACCESS_TOKEN;
  if (fixedToken) return fixedToken;

  if (!hasGoogleDriveCredentials()) {
    throw new Error('Credenciais OAuth do Google Drive não configuradas.');
  }

  const now = Date.now();
  if (cachedAccessToken && cachedAccessTokenExpiresAt > now + 60_000) {
    return cachedAccessToken;
  }

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`Falha ao renovar acesso somente leitura ao Google Drive (${response.status}).`);
  }

  cachedAccessToken = payload.access_token;
  const expiresInSeconds = Number(payload.expires_in) || 3600;
  cachedAccessTokenExpiresAt = now + expiresInSeconds * 1000;
  return cachedAccessToken;
}
