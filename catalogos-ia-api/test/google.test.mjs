import assert from 'node:assert/strict';
import test from 'node:test';
import { hasGoogleDriveCredentials } from '../api/_lib/google.mjs';

const ENV_KEYS = [
  'GOOGLE_DRIVE_OAUTH_ACCESS_TOKEN',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REFRESH_TOKEN'
];

function withCleanGoogleEnv(callback) {
  const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  try {
    callback();
  } finally {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

test('aceita um token temporário para teste', () => {
  withCleanGoogleEnv(() => {
    process.env.GOOGLE_DRIVE_OAUTH_ACCESS_TOKEN = 'temporario';
    assert.equal(hasGoogleDriveCredentials(), true);
  });
});

test('exige o conjunto completo para renovação automática', () => {
  withCleanGoogleEnv(() => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'cliente';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'segredo';
    assert.equal(hasGoogleDriveCredentials(), false);
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN = 'renovacao';
    assert.equal(hasGoogleDriveCredentials(), true);
  });
});
