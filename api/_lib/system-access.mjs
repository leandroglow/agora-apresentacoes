// Explicit internal identities. Clerk authentication alone does not grant access
// to company files. Never derive this permission from username or property role.
const INTERNAL_USERS = new Set([
  'user_3Jvm8LQLtHINAqVtQhagyoDC6nT', // Master
  'user_3JvmAhiGPCh3w3nDMB3pPJOyIN9'  // Wiliam
]);

export function isSystemUser(userId) {
  return typeof userId === 'string' && INTERNAL_USERS.has(userId);
}
