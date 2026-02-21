/* ============================================
   NexSon – Config & Demo Data
   ============================================ */

const CONFIG = {
  APP_NAME: 'NexSon',
  VERSION:  '2.0.0',
  // Jamendo API (free music, full streams) — https://developer.jamendo.com
  JAMENDO_API: 'https://api.jamendo.com/v3.0',
  JAMENDO_KEY: 'b6747d04',
  // iTunes Search API (fallback metadata, CORS-ok)
  ITUNES_API: 'https://itunes.apple.com/search',
  // Lyrics API
  LYRICS_API: 'https://api.lyrics.ovh/v1',
  // Backend API (MongoDB auth) — set to your deployed URL or localhost
  API_BASE: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3001'
    : '', // same origin if deployed together
  USE_BACKEND: false, // Set to true once backend is running
};

/* ─── Genre Data with inline SVG icons ─── */
const GENRES = [
  {
    id: 'pop', name: 'Pop', color: '#e91e8c',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'
  },
  {
    id: 'rap', name: 'Rap / Hip-Hop', color: '#ff6b35',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
  },
  {
    id: 'rnb', name: 'R&B / Soul', color: '#9c27b0',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
  },
  {
    id: 'rock', name: 'Rock', color: '#d32f2f',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="M4 6l4-2M14 4l4 2"/></svg>'
  },
  {
    id: 'electronic', name: 'Électronique', color: '#1565c0',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>'
  },
  {
    id: 'jazz', name: 'Jazz', color: '#e65100',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="M12 2c0 4-3 6-3 6"/></svg>'
  },
  {
    id: 'classical', name: 'Classique', color: '#1b5e20',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>'
  },
  {
    id: 'latin', name: 'Latino', color: '#f57f17',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>'
  },
  {
    id: 'afrobeats', name: 'Afrobeats', color: '#33691e',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-15 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(15 12 12)"/><circle cx="12" cy="12" r="2"/></svg>'
  },
  {
    id: 'reggae', name: 'Reggae', color: '#2e7d32',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22V2M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93 4.93 19.07"/></svg>'
  },
  {
    id: 'country', name: 'Country', color: '#795548',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7c0-1.1 1.1-2 2.5-2S8 5.9 8 7v4.5L12 14l4-2.5V7c0-1.1 1.1-2 2.5-2S21 5.9 21 7v7l-9 5-9-5V7z"/></svg>'
  },
  {
    id: 'kpop', name: 'K-Pop', color: '#ad1457',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
  },
];

/* ─── Demo Playlists ─── */
const SYSTEM_PLAYLISTS = [
  { id: 'top-hits',    name: 'Top Hits 2025',     query: 'pop hits 2025',      tag: 'Éditorial' },
  { id: 'chill-vibes', name: 'Chill Vibes',        query: 'chillout ambient',   tag: 'Ambiance' },
  { id: 'workout',     name: 'Workout Pump',       query: 'energetic workout',  tag: 'Énergie' },
  { id: 'late-night',  name: 'Late Night Drive',   query: 'late night jazz',    tag: 'Nocturne' },
  { id: 'afro',        name: 'Afrobeats Party',    query: 'afrobeats',          tag: 'Danse' },
  { id: 'electronic',  name: 'Electronic Beats',   query: 'electronic dance',   tag: 'Club' },
];

/* ─── Featured Artists ─── */
const FEATURED_ARTISTS = [
  'Drake', 'Beyoncé', 'The Weeknd', 'Taylor Swift',
  'Doja Cat', 'Bad Bunny', 'Burna Boy', 'Aya Nakamura',
];

/* ─── Color Palettes for Playlists ─── */
const PLAYLIST_COLORS = [
  ['#7c3aed', '#ec4899'],
  ['#2563eb', '#7c3aed'],
  ['#d97706', '#ef4444'],
  ['#059669', '#3b82f6'],
  ['#dc2626', '#9333ea'],
  ['#0891b2', '#10b981'],
  ['#be185d', '#f97316'],
  ['#7c3aed', '#3b82f6'],
];
