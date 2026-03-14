'use strict';
const fetch = require('node-fetch');

function internalHeaders() {
  if (!process.env.INTERNAL_API_KEY) throw new Error('INTERNAL_API_KEY env var is not set.');
  return {
    'X-Internal-Key': process.env.INTERNAL_API_KEY,
    'Content-Type': 'application/json',
  };
}

function base() {
  if (!process.env.FEDERATION_INTERNAL_URL) throw new Error('FEDERATION_INTERNAL_URL env var is not set.');
  return process.env.FEDERATION_INTERNAL_URL;
}

/**
 * Search for users by username prefix.
 * Returns { users: [...] } directly from the Federation response.
 */
async function searchUsers(query) {
  const res = await fetch(
    `${base()}/api/internal/users/search?q=${encodeURIComponent(query)}`,
    { headers: internalHeaders() }
  );
  if (!res.ok) throw new Error(`Federation search failed: ${res.status}`);
  return res.json();
}

/**
 * Fetch a single user's public profile by Federation UUID.
 * Returns the user object, or null if not found.
 */
async function getUserById(id) {
  const res = await fetch(
    `${base()}/api/internal/users/${encodeURIComponent(id)}`,
    { headers: internalHeaders() }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Federation user lookup failed: ${res.status}`);
  const data = await res.json();
  return data.user;
}

/**
 * Fetch public profiles for multiple UUIDs in parallel.
 * Returns a map of { [id]: userObject }.
 */
async function getUsersByIds(ids) {
  if (!ids.length) return {};
  const profiles = await Promise.all(
    ids.map((id) => getUserById(id).catch(() => null))
  );
  const map = {};
  for (const p of profiles) {
    if (p) map[p.id] = p;
  }
  return map;
}

module.exports = { searchUsers, getUserById, getUsersByIds };
