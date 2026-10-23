/**
 * Music MIC Driver - Core Application Logic
 * Standard Apple Music iOS PWA with Smooth Crossfade & Smart Fisher-Yates Shuffle
 */

// ==========================================
// 1. STATE & CONSTANTS
// ==========================================
const DB_NAME = 'MusicMeltingDriveDB';
const DB_VERSION = 2;
const STORE_NAME = 'songs';
const SETTINGS_STORE = 'settings';
/** Bump together with version.json + sw.js CACHE_NAME when shipping UI fixes */
const APP_BUILD = 26;

const state = {
  db: null,
  songs: [],           // All song records from IndexedDB
  queue: [],           // Array of song IDs in playback order
  currentIndex: -1,    // Pointer to current song in queue
  isPlaying: false,
  isShuffle: false,
  repeatMode: 'all',   // 'off' | 'all' | 'one'
  mixMode: 'smart',    // smart equal-power blend (affinity-based length)
  masterVolume: 1.0,
  isCrossfading: false,
  fadeInterval: null,
  isDraggingSeek: false,
  searchQuery: '',
  nextPreloadedId: null,
  nativeScanBusy: false
};

const nativeRefreshGate = {
  lastAt: 0,
  minIntervalMs: 20000 // don't hammer MediaStore on rapid app switches
};

function isNativeApk() {
  return !!(
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === 'function' &&
    window.Capacitor.isNativePlatform() &&
    window.Capacitor.Plugins &&
    window.Capacitor.Plugins.MediaStoreScanner
  );
}

function buildKnownSongKeySet(songs) {
  const known = new Set();
  for (let i = 0; i < songs.length; i++) {
    const s = songs[i];
    if (s.id) known.add('id:' + s.id);
    if (s.nativePath) known.add('path:' + s.nativePath);
    if (s.nativeUri) known.add('uri:' + s.nativeUri);
    known.add('file:' + (s.fileName || '') + '|' + (s.fileSize || 0));
  }
  return known;
}

function nativeItemKeys(item) {
  const keys = [];
  if (item.id) keys.push('id:' + item.id);
  if (item.path) keys.push('path:' + item.path);
  if (item.contentUri) keys.push('uri:' + item.contentUri);
  keys.push('file:' + (item.fileName || '') + '|' + (item.size || 0));
  return keys;
}

// Dual Audio Deck References
let deckA = document.getElementById('deckA');
let deckB = document.getElementById('deckB');
let activeDeck = deckA;
let inactiveDeck = deckB;

// DOM Elements
const libraryView = document.getElementById('libraryView');
const trackListEl = document.getElementById('trackList');
const emptyStateEl = document.getElementById('emptyState');
const trackCountBadge = document.getElementById('trackCountBadge');
const storageInfoBadge = document.getElementById('storageInfoBadge');
const scanAudioInput = document.getElementById('scanAudioInput');
const scanFolderInput = document.getElementById('scanFolderInput');
const freeFileInput = document.getElementById('freeFileInput');
const coverPickerInput = document.getElementById('coverPickerInput');
const scanMusicBtn = document.getElementById('scanMusicBtn');
const scanMusicIcon = document.getElementById('scanMusicIcon');
const scanMusicBtnText = document.getElementById('scanMusicBtnText');
const pickFileBtn = document.getElementById('pickFileBtn');
const emptyStateScanBtn = document.getElementById('emptyStateScanBtn');
const emptyStatePickFileBtn = document.getElementById('emptyStatePickFileBtn');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const quickShuffleAllBtn = document.getElementById('quickShuffleAllBtn');
const modalScanAudioBtn = document.getElementById('modalScanAudioBtn');
const modalPickFileBtn = document.getElementById('modalPickFileBtn');

// Mini Player Elements
const miniPlayerDock = document.getElementById('miniPlayerDock');
const miniPlayerCard = document.getElementById('miniPlayerCard');
const miniCover = document.getElementById('miniCover');
const miniTitle = document.getElementById('miniTitle');
const miniArtist = document.getElementById('miniArtist');
const miniPlayBtn = document.getElementById('miniPlayBtn');
const miniPlayIcon = document.getElementById('miniPlayIcon');
const miniPauseIcon = document.getElementById('miniPauseIcon');
const miniNextBtn = document.getElementById('miniNextBtn');
const miniProgressBar = document.getElementById('miniProgressBar');
const miniPlayingIndicator = document.getElementById('miniPlayingIndicator');

// Full Player Elements
const fullPlayer = document.getElementById('fullPlayer');
const fullPlayerHeader = document.getElementById('fullPlayerHeader');
const closeFullPlayerBtn = document.getElementById('closeFullPlayerBtn');
const swipeHandle = document.getElementById('swipeHandle');
const fullCover = document.getElementById('fullCover');
const fullTitle = document.getElementById('fullTitle');
const fullArtist = document.getElementById('fullArtist');
const fullPlayerBackdropBlur = document.getElementById('fullPlayerBackdropBlur');
const fullPlayerBg = document.getElementById('fullPlayerBg');
const fullPlayerBgVeil = document.getElementById('fullPlayerBgVeil');
const currentPlaylistTitle = document.getElementById('currentPlaylistTitle');
const favoriteBtn = document.getElementById('favoriteBtn');
const favHeartIcon = document.getElementById('favHeartIcon');
const seekBar = document.getElementById('seekBar');
const currentTimeDisplay = document.getElementById('currentTimeDisplay');
const remainingTimeDisplay = document.getElementById('remainingTimeDisplay');
const shuffleBtn = document.getElementById('shuffleBtn');
const shuffleDot = document.getElementById('shuffleDot');
const prevBtn = document.getElementById('prevBtn');
const bigPlayBtn = document.getElementById('bigPlayBtn');
const bigPlayIcon = document.getElementById('bigPlayIcon');
const bigPauseIcon = document.getElementById('bigPauseIcon');
const nextBtn = document.getElementById('nextBtn');
const repeatBtn = document.getElementById('repeatBtn');
const repeatDot = document.getElementById('repeatDot');
const repeatOneBadge = document.getElementById('repeatOneBadge');
const volumeBar = document.getElementById('volumeBar');

// Queue & Options Modal Elements
const openQueueBtn = document.getElementById('openQueueBtn');
const queueDrawer = document.getElementById('queueDrawer');
const closeQueueBtn = document.getElementById('closeQueueBtn');
const queueList = document.getElementById('queueList');
const queueSubtitle = document.getElementById('queueSubtitle');
const libraryOptionsBtn = document.getElementById('libraryOptionsBtn');
const optionsModal = document.getElementById('optionsModal');
const closeOptionsModalBtn = document.getElementById('closeOptionsModalBtn');
const modalClearAllBtn = document.getElementById('modalClearAllBtn');
const toastEl = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');
const toastIcon = document.getElementById('toastIcon');

// ==========================================
// 2. INDEXEDDB STORAGE
// ==========================================
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('addedAt', 'addedAt', { unique: false });
        store.createIndex('title', 'title', { unique: false });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE);
      }
    };
    request.onsuccess = (event) => {
      state.db = event.target.result;
      resolve(state.db);
    };
    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
  });
}

function dbSaveSetting(key, val) {
  return new Promise((resolve) => {
    try {
      if (!state.db) return resolve();
      const tx = state.db.transaction([SETTINGS_STORE], 'readwrite');
      const store = tx.objectStore(SETTINGS_STORE);
      store.put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

function dbGetSetting(key) {
  return new Promise((resolve) => {
    try {
      if (!state.db) return resolve(null);
      const tx = state.db.transaction([SETTINGS_STORE], 'readonly');
      const store = tx.objectStore(SETTINGS_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

function dbAddSong(song) {
  return new Promise((resolve, reject) => {
    const tx = state.db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(song);
    req.onsuccess = () => resolve(song);
    req.onerror = (e) => reject(e.target.error);
  });
}

function dbAddSongsBatch(songs) {
  return new Promise((resolve) => {
    if (!state.db || !songs || songs.length === 0) return resolve();
    try {
      const tx = state.db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (let i = 0; i < songs.length; i++) {
        store.put(songs[i]);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

function dbGetAllSongs() {
  return new Promise((resolve, reject) => {
    const tx = state.db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

function dbDeleteSong(id) {
  return new Promise((resolve, reject) => {
    const tx = state.db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve(id);
    req.onerror = (e) => reject(e.target.error);
  });
}

function dbClearAll() {
  return new Promise((resolve, reject) => {
    const tx = state.db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

// ==========================================
// 3. COLOR PALETTE EXTRACTION & MESH GRADIENT
// ==========================================
function extractColorsFromImage(imgUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imgUrl;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 32;
        canvas.height = 32;
        ctx.drawImage(img, 0, 0, 32, 32);
        const data = ctx.getImageData(0, 0, 32, 32).data;

        // Sample corner and center pixels
        const colors = [
          [data[0], data[1], data[2]],
          [data[32 * 4 * 4], data[32 * 4 * 4 + 1], data[32 * 4 * 4 + 2]],
          [data[512 * 4], data[512 * 4 + 1], data[512 * 4 + 2]],
          [data[data.length - 8], data[data.length - 7], data[data.length - 6]]
        ];

        // Pick distinct vibrant colors
        const rgb1 = colors[0] || [250, 35, 59];
        const rgb2 = colors[1] || [139, 92, 246];
        const rgb3 = colors[2] || [59, 130, 246];

        resolve({
          c1: `rgb(${rgb1[0]}, ${rgb1[1]}, ${rgb1[2]})`,
          c2: `rgb(${rgb2[0]}, ${rgb2[1]}, ${rgb2[2]})`,
          c3: `rgb(${rgb3[0]}, ${rgb3[1]}, ${rgb3[2]})`,
          c4: `rgb(${Math.max(10, Math.floor(rgb1[0]*0.15))}, ${Math.max(10, Math.floor(rgb1[1]*0.15))}, ${Math.max(16, Math.floor(rgb1[2]*0.2))})`,
          glow: `${rgb1[0]}, ${rgb1[1]}, ${rgb1[2]}`
        });
      } catch (err) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
  });
}

async function updateDynamicMesh(imgUrl) {
  const palette = await extractColorsFromImage(imgUrl);
  const root = document.documentElement;
  if (palette) {
    root.style.setProperty('--c1', palette.c1);
    root.style.setProperty('--c2', palette.c2);
    root.style.setProperty('--c3', palette.c3);
    root.style.setProperty('--c4', palette.c4);
    root.style.setProperty('--glow-rgb', palette.glow);
  } else {
    // Default Music MIC Driver tones matching Image 2
    root.style.setProperty('--c1', '#38bdf8');
    root.style.setProperty('--c2', '#2563eb');
    root.style.setProperty('--c3', '#06b6d4');
    root.style.setProperty('--c4', '#121c27');
    root.style.setProperty('--glow-rgb', '56, 189, 248');
  }
}

// ==========================================
// 4. SEAMLESS SMART SHUFFLE (tempo-aware continuous mix)
// ==========================================
function fisherYatesShuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function songById(id) {
  return state.songs.find(s => s.id === id) || null;
}

/** Energy / tempo feel 0–100 (proxy BPM when real analysis unavailable) */
function estimateEnergy(song) {
  if (!song) return 50;
  if (typeof song._energy === 'number') return song._energy;
  const d = song.duration || 200;
  const size = song.fileSize || 0;
  const bitrate = d > 0 ? (size * 8) / d / 1000 : 160;
  let e = 50;
  e += Math.max(-22, Math.min(22, (205 - d) * 0.16));
  e += Math.max(-14, Math.min(14, (bitrate - 160) * 0.07));
  const artist = (song.artist || '').toLowerCase();
  let hash = 0;
  for (let i = 0; i < artist.length; i++) hash = (hash * 33 + artist.charCodeAt(i)) & 255;
  e += (hash % 13) - 6;
  song._energy = Math.max(0, Math.min(100, e));
  return song._energy;
}

function tempoBucket(song) {
  const e = estimateEnergy(song);
  if (e >= 72) return 3;
  if (e >= 55) return 2;
  if (e >= 38) return 1;
  return 0;
}

function songAffinity(a, b) {
  if (!a || !b) return 0;
  let score = 0;
  const aa = (a.artist || '').trim().toLowerCase();
  const ba = (b.artist || '').trim().toLowerCase();
  if (aa && ba && aa === ba) score += 4;
  else if (aa && ba && (aa.includes(ba) || ba.includes(aa))) score += 2;

  const al = (a.album || '').trim().toLowerCase();
  const bl = (b.album || '').trim().toLowerCase();
  if (al && bl && al === bl) score += 3;

  if (tempoBucket(a) === tempoBucket(b)) score += 3;
  else if (Math.abs(tempoBucket(a) - tempoBucket(b)) === 1) score += 1;

  const energyDiff = Math.abs(estimateEnergy(a) - estimateEnergy(b));
  if (energyDiff < 7) score += 3;
  else if (energyDiff < 14) score += 2;
  else if (energyDiff < 24) score += 1;

  if (Math.abs((a.duration || 0) - (b.duration || 0)) <= 20) score += 1;
  return score;
}

/**
 * Random but continuous: greedy nearest-neighbor chain by tempo/artist affinity.
 * Still feels shuffled, transitions stay natural.
 */
function buildSeamlessShuffleQueue(allIds, startId) {
  if (!allIds.length) return [];
  const remaining = new Set(allIds);
  const queue = [];
  let current = (startId && remaining.has(startId))
    ? startId
    : allIds[Math.floor(Math.random() * allIds.length)];

  queue.push(current);
  remaining.delete(current);

  while (remaining.size > 0) {
    const curSong = songById(current);
    const scored = [];
    remaining.forEach((id) => {
      scored.push({
        id,
        score: songAffinity(curSong, songById(id)) + Math.random() * 1.35
      });
    });
    scored.sort((a, b) => b.score - a.score);
    const topK = scored.slice(0, Math.min(6, scored.length));
    const best = scored[0];
    // Soft pick among top matches — keeps surprise without jarring jumps
    let chosen = topK[Math.floor(Math.random() * topK.length)];
    if (best && chosen && best.score - chosen.score > 2.8) chosen = best;
    current = chosen.id;
    queue.push(current);
    remaining.delete(current);
  }
  return queue;
}

/** Live-optimize next few slots into a smooth affinity chain (shuffle mode). */
function refineUpcomingSeamless(currentSong, depth = 4) {
  if (!currentSong || state.queue.length < 3) return;
  let anchor = currentSong;
  const maxDepth = Math.min(depth, state.queue.length - 1);
  for (let d = 1; d <= maxDepth; d++) {
    const slot = (state.currentIndex + d) % state.queue.length;
    let bestIdx = slot;
    let bestScore = songAffinity(anchor, songById(state.queue[slot]));
    const searchTo = Math.min(state.queue.length - 1, d + (state.isShuffle ? 14 : 6));
    for (let off = d; off <= searchTo; off++) {
      const idx = (state.currentIndex + off) % state.queue.length;
      const score = songAffinity(anchor, songById(state.queue[idx]));
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    }
    if (bestIdx !== slot && bestScore >= 1) {
      const tmp = state.queue[slot];
      state.queue[slot] = state.queue[bestIdx];
      state.queue[bestIdx] = tmp;
    }
    anchor = songById(state.queue[slot]);
  }
}

function promoteCompatibleNext(currentSong) {
  if (!currentSong || state.queue.length < 3 || state.repeatMode === 'one') return;
  if (state.isShuffle) {
    refineUpcomingSeamless(currentSong, 5);
    return;
  }
  const nextIdx = (state.currentIndex + 1) % state.queue.length;
  let bestIdx = nextIdx;
  let bestScore = songAffinity(currentSong, songById(state.queue[nextIdx]));
  const windowSize = Math.min(8, state.queue.length - 1);
  for (let off = 2; off <= windowSize; off++) {
    const idx = (state.currentIndex + off) % state.queue.length;
    const score = songAffinity(currentSong, songById(state.queue[idx]));
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  }
  if (bestIdx !== nextIdx && bestScore >= 2) {
    const tmp = state.queue[nextIdx];
    state.queue[nextIdx] = state.queue[bestIdx];
    state.queue[bestIdx] = tmp;
  }
}

/** Blend length — shuffle uses longer “invisible” DJ crossfades */
function getSmartBlendDuration(fromSong, toSong, timeLeft) {
  const affinity = songAffinity(fromSong, toSong);
  let base;
  if (state.isShuffle) {
    base = affinity >= 6 ? 3.6 : affinity >= 4 ? 3.1 : affinity >= 2 ? 2.6 : 2.15;
  } else {
    base = affinity >= 4 ? 2.35 : affinity >= 2 ? 1.85 : 1.35;
  }
  if (typeof timeLeft === 'number' && timeLeft > 0) {
    base = Math.min(base, Math.max(state.isShuffle ? 1.6 : 1.1, timeLeft - 0.08));
  }
  return base;
}

function rebuildQueue(preserveCurrent = true) {
  if (state.songs.length === 0) {
    state.queue = [];
    state.currentIndex = -1;
    return;
  }

  const allIds = state.songs.map(s => s.id);
  const currentSongId = getCurrentSong() ? getCurrentSong().id : null;

  if (state.isShuffle) {
    // Seamless Smart Shuffle: random path, tempo-linked neighbors
    state.queue = buildSeamlessShuffleQueue(allIds, preserveCurrent ? currentSongId : currentSongId);
    state.currentIndex = 0;
  } else {
    state.queue = [...allIds];
    state.currentIndex = currentSongId ? state.queue.indexOf(currentSongId) : 0;
  }
  renderQueueList();
}

function toggleShuffle() {
  state.isShuffle = !state.isShuffle;
  shuffleDot.classList.toggle('hidden', !state.isShuffle);
  shuffleBtn.classList.toggle('text-pink-500', state.isShuffle);
  shuffleBtn.classList.toggle('text-white/60', !state.isShuffle);
  rebuildQueue(true);
  if (state.isShuffle && shuffleBtn) {
    shuffleBtn.title = 'Seamless Smart Shuffle — tự lọc tempo, chuyển bài liền mạch';
  } else if (shuffleBtn) {
    shuffleBtn.title = 'Smart Shuffle (Fisher-Yates)';
  }
}

function toggleRepeat() {
  if (state.repeatMode === 'off') {
    state.repeatMode = 'all';
    repeatDot.classList.remove('hidden');
    repeatOneBadge.classList.add('hidden');
    repeatBtn.classList.add('text-pink-500');
    repeatBtn.classList.remove('text-white/60');
  } else if (state.repeatMode === 'all') {
    state.repeatMode = 'one';
    repeatDot.classList.add('hidden');
    repeatOneBadge.classList.remove('hidden');
    repeatBtn.classList.add('text-pink-500');
    repeatBtn.classList.remove('text-white/60');
  } else {
    state.repeatMode = 'off';
    repeatDot.classList.add('hidden');
    repeatOneBadge.classList.add('hidden');
    repeatBtn.classList.remove('text-pink-500');
    repeatBtn.classList.add('text-white/60');
  }
}

// ==========================================
// 5. AUDIO PLAYBACK & DUAL DECK CROSSFADE ENGINE
// ==========================================
function getCurrentSong() {
  if (state.currentIndex >= 0 && state.currentIndex < state.queue.length) {
    const songId = state.queue[state.currentIndex];
    return state.songs.find(s => s.id === songId);
  }
  return null;
}

function getNextSong() {
  if (state.queue.length === 0) return null;
  if (state.repeatMode === 'one') {
    return getCurrentSong();
  }
  let nextIndex = state.currentIndex + 1;
  if (nextIndex >= state.queue.length) {
    if (state.repeatMode === 'all') {
      nextIndex = 0;
    } else {
      return null;
    }
  }
  const nextId = state.queue[nextIndex];
  return state.songs.find(s => s.id === nextId) || null;
}

function getPrevSong() {
  if (state.queue.length === 0) return null;
  let prevIndex = state.currentIndex - 1;
  if (prevIndex < 0) {
    prevIndex = state.queue.length - 1;
  }
  const prevId = state.queue[prevIndex];
  return state.songs.find(s => s.id === prevId) || null;
}

/**
 * Play a specific song by ID
 */
async function playSongById(id, withCrossfade = true) {
  const index = state.queue.indexOf(id);
  if (index === -1) {
    // If not in queue, re-add
    state.queue.push(id);
    state.currentIndex = state.queue.length - 1;
  } else {
    state.currentIndex = index;
  }

  const song = state.songs.find(s => s.id === id);
  if (!song) return;

  // Check iOS Background vs Foreground state
  const isBackgrounded = document.hidden === true;

  if (withCrossfade && !isBackgrounded && state.isPlaying) {
    const from = getCurrentSong();
    performMashupTransition(song, getSmartBlendDuration(from, song, state.isShuffle ? 2.8 : 2.2), from);
  } else {
    directPlaybackTransition(song);
  }
}

/**
 * Direct playback transition (used when launching, or when backgrounded on iOS/Android)
 */
async function directPlaybackTransition(song) {
  if (state.fadeInterval) {
    clearInterval(state.fadeInterval);
    state.fadeInterval = null;
  }
  state.isCrossfading = false;

  // Reset decks
  activeDeck.pause();
  inactiveDeck.pause();
  activeDeck.currentTime = 0;
  inactiveDeck.currentTime = 0;

  activeDeck.src = song.audioUrl;
  activeDeck.volume = state.masterVolume;

  updateUIWithSong(song);
  updateMediaSession(song);
  renderTrackList();

  try {
    await activeDeck.play();
    state.isPlaying = true;
    updatePlayPauseUI();
    updateMediaSessionPlaybackState();
  } catch (err) {
    console.warn('Direct play error (requires user touch interaction):', err);
    state.isPlaying = false;
    updatePlayPauseUI();
  }
}

/**
 * Intelligent Seamless Mashup DJ Blend Transition (Permanent Background DJ Engine)
 * Overlaps outgoing outro with incoming intro seamlessly like an uninterrupted continuous EP mix.
 * Equal-Power Sinusoidal Gain maintains constant perceived acoustic energy so the beat never drops.
 */
function performMashupTransition(nextSong, duration = 5.0, fromSong = null) {
  if (state.isCrossfading || state.fadeInterval) {
    if (state.fadeInterval) {
      clearInterval(state.fadeInterval);
      state.fadeInterval = null;
    }
    state.isCrossfading = false;
    deckA.pause();
    deckB.pause();
    deckA.volume = state.masterVolume;
    deckB.volume = state.masterVolume;
  }
  state.isCrossfading = true;

  const currentDeck = activeDeck;
  const targetDeck = inactiveDeck;
  const affinity = songAffinity(fromSong || getCurrentSong(), nextSong);

  targetDeck.src = nextSong.audioUrl;
  // Tiny intro skip on strong matches — feels more like a continuous mix
  targetDeck.currentTime = (state.isShuffle && affinity >= 4) ? 0.1 : 0;
  targetDeck.volume = 0;

  updateUIWithSong(nextSong);
  updateMediaSession(nextSong);
  renderTrackList();

  targetDeck.play().then(() => {
    activeDeck = targetDeck;
    inactiveDeck = currentDeck;

    const intervalTime = 24; // denser steps = smoother ghost fade
    const steps = Math.max(28, Math.round((duration * 1000) / intervalTime));
    let stepCount = 0;

    if (state.fadeInterval) clearInterval(state.fadeInterval);
    state.fadeInterval = setInterval(() => {
      stepCount++;
      const progress = Math.min(1, stepCount / steps);

      // Equal-power curve — perceived loudness stays flat across the blend
      const angle = progress * 0.5 * Math.PI;
      const fadeOut = Math.cos(angle);
      const fadeIn = Math.sin(angle);

      inactiveDeck.volume = Math.max(0, Math.min(1, state.masterVolume * fadeOut));
      activeDeck.volume = Math.max(0, Math.min(1, state.masterVolume * fadeIn));

      if (stepCount >= steps) {
        clearInterval(state.fadeInterval);
        state.fadeInterval = null;
        inactiveDeck.pause();
        inactiveDeck.currentTime = 0;
        inactiveDeck.volume = state.masterVolume;
        activeDeck.volume = state.masterVolume;
        state.isCrossfading = false;
      }
    }, intervalTime);
  }).catch((err) => {
    console.warn('Mashup transition play error, fallback to direct:', err);
    state.isCrossfading = false;
    directPlaybackTransition(nextSong);
  });
}

function handleNext(manualTrigger = true) {
  const fromSong = getCurrentSong();
  if (!document.hidden && state.isPlaying) {
    promoteCompatibleNext(fromSong);
  }

  const nextSong = getNextSong();
  if (!nextSong) {
    activeDeck.pause();
    state.isPlaying = false;
    updatePlayPauseUI();
    return;
  }

  state.currentIndex = (state.currentIndex + 1) % state.queue.length;
  state.nextPreloadedId = null;

  const isBackgrounded = document.hidden === true;
  if (!isBackgrounded && state.isPlaying) {
    const blend = getSmartBlendDuration(
      fromSong,
      nextSong,
      manualTrigger ? (state.isShuffle ? 2.4 : 1.7) : (state.isShuffle ? 3.0 : 2.1)
    );
    performMashupTransition(nextSong, blend, fromSong);
  } else {
    directPlaybackTransition(nextSong);
  }
}

function handlePrev() {
  if (activeDeck.currentTime > 3) {
    activeDeck.currentTime = 0;
    return;
  }

  const fromSong = getCurrentSong();
  const prevSong = getPrevSong();
  if (!prevSong) return;

  state.currentIndex = (state.currentIndex - 1 + state.queue.length) % state.queue.length;
  state.nextPreloadedId = null;

  const isBackgrounded = document.hidden === true;
  if (!isBackgrounded && state.isPlaying) {
    performMashupTransition(prevSong, getSmartBlendDuration(fromSong, prevSong, state.isShuffle ? 2.2 : 1.5), fromSong);
  } else {
    directPlaybackTransition(prevSong);
  }
}

function togglePlayPause() {
  const currentSong = getCurrentSong();
  if (!currentSong) {
    if (state.songs.length > 0) {
      playSongById(state.songs[0].id, false);
    }
    return;
  }

  if (state.isPlaying) {
    activeDeck.pause();
    state.isPlaying = false;
  } else {
    activeDeck.play().then(() => {
      state.isPlaying = true;
    }).catch(console.error);
  }
  updatePlayPauseUI();
  updateMediaSessionPlaybackState();
}

// ==========================================
// 6. AUDIO ELEMENT EVENT LISTENERS (DECK A & B)
// ==========================================
function setupDeckEvents(deck) {
  deck.addEventListener('timeupdate', () => {
    if (deck !== activeDeck) return;

    const cur = deck.currentTime;
    const dur = deck.duration || 0;

    // Update scrubber when not user dragging
    if (!state.isDraggingSeek && dur > 0) {
      const progressPercent = (cur / dur) * 100;
      seekBar.value = progressPercent;
      miniProgressBar.style.width = `${progressPercent}%`;
      currentTimeDisplay.textContent = formatTime(cur);
      remainingTimeDisplay.textContent = '-' + formatTime(Math.max(0, dur - cur));
    }

    // Seamless auto-mix near end — shuffle uses longer invisible blends + tempo chain
    if (!state.isCrossfading && state.isPlaying && dur > 6) {
      const timeLeft = dur - cur;
      const currentSong = getCurrentSong();
      const preloadAt = state.isShuffle ? 18 : 14;
      const blendAt = state.isShuffle ? 3.5 : 2.6;

      if (timeLeft <= preloadAt && timeLeft > blendAt + 0.4 && !document.hidden) {
        if (state.isShuffle) promoteCompatibleNext(currentSong);
        const upcoming = getNextSong();
        if (upcoming && upcoming.audioUrl && state.nextPreloadedId !== upcoming.id) {
          try {
            inactiveDeck.src = upcoming.audioUrl;
            inactiveDeck.load();
            state.nextPreloadedId = upcoming.id;
          } catch (e) {}
        }
      }

      if (timeLeft <= blendAt && timeLeft > 0.2 && !document.hidden) {
        promoteCompatibleNext(currentSong);
        const nextSong = getNextSong();
        if (nextSong) {
          state.currentIndex = (state.currentIndex + 1) % state.queue.length;
          state.nextPreloadedId = null;
          const blendLead = getSmartBlendDuration(currentSong, nextSong, timeLeft);
          performMashupTransition(nextSong, blendLead, currentSong);
        }
      }
    }

    // Sync lockscreen position
    syncMediaSessionPositionState();
  });

  // Track ended event (Seamless direct handoff for iOS background mode)
  deck.addEventListener('ended', () => {
    if (deck === inactiveDeck) {
      deck.pause();
      deck.currentTime = 0;
      deck.volume = state.masterVolume;
      if (state.isCrossfading) {
        if (state.fadeInterval) {
          clearInterval(state.fadeInterval);
          state.fadeInterval = null;
        }
        activeDeck.volume = state.masterVolume;
        state.isCrossfading = false;
      }
      return;
    }
    if (deck !== activeDeck) return;
    if (state.isCrossfading) return;

    if (state.repeatMode === 'one') {
      deck.currentTime = 0;
      deck.play();
    } else {
      handleNext(false);
    }
  });

  // Dynamic accurate duration update when metadata is loaded
  deck.addEventListener('loadedmetadata', () => {
    if (deck === activeDeck && deck.duration && !isNaN(deck.duration)) {
      const currentSong = getCurrentSong();
      if (currentSong && (!currentSong.duration || Math.abs(currentSong.duration - deck.duration) > 1)) {
        currentSong.duration = deck.duration;
        dbAddSong(currentSong).catch(() => {});
        renderTrackList();
      }
      if (currentTimeDisplay && remainingTimeDisplay) {
        currentTimeDisplay.textContent = formatTime(deck.currentTime || 0);
        remainingTimeDisplay.textContent = '-' + formatTime(Math.max(0, deck.duration - (deck.currentTime || 0)));
      }
    }
  });

  deck.addEventListener('play', () => {
    if (deck === activeDeck) {
      state.isPlaying = true;
      updatePlayPauseUI();
      updateMediaSessionPlaybackState();
    }
  });

  deck.addEventListener('pause', () => {
    if (deck === activeDeck && !state.isCrossfading) {
      state.isPlaying = false;
      updatePlayPauseUI();
      updateMediaSessionPlaybackState();
    }
  });
}

setupDeckEvents(deckA);
setupDeckEvents(deckB);

// Page Visibility — when APK returns to foreground, light-scan for newly downloaded tracks
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && isNativeApk()) {
    refreshNativeLibrarySilent();
  }
});

// ==========================================
// 7. MEDIA SESSION API (IOS / ANDROID LOCKSCREEN)
// ==========================================
function updateMediaSession(song) {
  if (!('mediaSession' in navigator) || !song) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title,
    artist: song.artist,
    album: song.album || 'Music MIC Driver',
    artwork: [
      { src: song.coverUrl, sizes: '96x96', type: 'image/png' },
      { src: song.coverUrl, sizes: '192x192', type: 'image/png' },
      { src: song.coverUrl, sizes: '512x512', type: 'image/png' }
    ]
  });

  navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
  navigator.mediaSession.setActionHandler('pause', () => togglePlayPause());
  navigator.mediaSession.setActionHandler('previoustrack', () => handlePrev());
  navigator.mediaSession.setActionHandler('nexttrack', () => handleNext(true));
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    if (details.seekTime !== undefined && activeDeck.duration) {
      activeDeck.currentTime = details.seekTime;
    }
  });
  navigator.mediaSession.setActionHandler('seekbackward', (details) => {
    const skipTime = details.seekOffset || 10;
    activeDeck.currentTime = Math.max(activeDeck.currentTime - skipTime, 0);
  });
  navigator.mediaSession.setActionHandler('seekforward', (details) => {
    const skipTime = details.seekOffset || 10;
    activeDeck.currentTime = Math.min(activeDeck.currentTime + skipTime, activeDeck.duration);
  });

  updateMediaSessionPlaybackState();
}

function updateMediaSessionPlaybackState() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused';
}

function syncMediaSessionPositionState() {
  if (!('mediaSession' in navigator) || !activeDeck.duration) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: activeDeck.duration,
      playbackRate: activeDeck.playbackRate || 1,
      position: Math.min(activeDeck.currentTime, activeDeck.duration)
    });
  } catch (err) {}
}

// ==========================================
// 8. ID3 TAG EXTRACTION & FOLDER AUTO-SYNC
// ==========================================
const SUPPORTED_AUDIO_EXTENSIONS = [
  '.mp3', '.wav', '.wave', '.flac', '.m4a', '.aac', '.ogg', '.oga',
  '.opus', '.wma', '.alac', '.aiff', '.aif', '.caf', '.weba',
  '.m4b', '.m4p', '.m4r', '.3gp', '.amr', '.awb'
];

function isAudioFile(file) {
  if (!file) return false;
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('audio/')) return true;
  if (mime === 'application/ogg' || mime === 'application/x-ogg') return true;
  const name = (file.name || '').toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.some(ext => name.endsWith(ext));
}

// ── Scan Progress UI helpers ─────────────────────────────────
const scanProgressOverlay = document.getElementById('scanProgressOverlay');
const scanProgressBar     = document.getElementById('scanProgressBar');
const scanProgressCount   = document.getElementById('scanProgressCount');
const scanProgressPct     = document.getElementById('scanProgressPct');
const scanProgressTitle   = document.getElementById('scanProgressTitle');
const scanProgressSub     = document.getElementById('scanProgressSub');
const scanProgressFile    = document.getElementById('scanProgressFile');

function yieldToUI() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Show load bar immediately — before any scan work starts. */
function beginPhoneScanProgress(subText) {
  if (!scanProgressOverlay) return;
  scanProgressBar.classList.add('scan-bar-indeterminate');
  scanProgressBar.style.width = '38%';
  scanProgressCount.textContent = '…';
  scanProgressPct.textContent = '';
  scanProgressTitle.textContent = 'Đang quét toàn bộ điện thoại';
  scanProgressSub.textContent = subText || 'Quét toàn bộ bộ nhớ máy tìm nhạc…';
  scanProgressFile.textContent = 'Vui lòng chờ, không tắt ứng dụng';
  scanProgressOverlay.classList.remove('hidden');
  scanProgressOverlay.classList.add('flex');
  if (scanMusicBtnText) scanMusicBtnText.textContent = 'Đang quét...';
  if (scanMusicIcon) scanMusicIcon.classList.add('animate-spin');
}

function showScanProgress(total, titleText) {
  if (!scanProgressOverlay) return;
  scanProgressBar.classList.remove('scan-bar-indeterminate');
  scanProgressBar.style.width = '0%';
  scanProgressCount.textContent = `0 / ${total}`;
  scanProgressPct.textContent = '0%';
  scanProgressTitle.textContent = titleText || 'Đang nạp nhạc vào thư viện';
  scanProgressSub.textContent = total > 0
    ? `Đã tìm thấy ${total} bài — đang lưu siêu tốc…`
    : 'Đang xử lý…';
  scanProgressFile.textContent = 'Vui lòng chờ…';
  scanProgressOverlay.classList.remove('hidden');
  scanProgressOverlay.classList.add('flex');
}

function updateScanProgress(done, total, currentFileName) {
  if (!scanProgressOverlay) return;
  scanProgressBar.classList.remove('scan-bar-indeterminate');
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  scanProgressBar.style.width = `${pct}%`;
  scanProgressCount.textContent = `${done} / ${total}`;
  scanProgressPct.textContent = `${pct}%`;
  if (currentFileName) scanProgressFile.textContent = currentFileName;
}

function updateScanDiscoverCount(foundCount) {
  if (!scanProgressOverlay) return;
  scanProgressTitle.textContent = 'Đang quét toàn bộ điện thoại';
  scanProgressSub.textContent = `Đã tìm thấy ${foundCount} bài hát…`;
  scanProgressCount.textContent = String(foundCount);
  scanProgressFile.textContent = 'Đang duyệt thư mục trên máy…';
}

function hideScanProgress(addedCount, total) {
  if (!scanProgressOverlay) return;
  scanProgressBar.classList.remove('scan-bar-indeterminate');
  scanProgressBar.style.width = '100%';
  scanProgressCount.textContent = `${addedCount} / ${total || addedCount}`;
  scanProgressPct.textContent = '100%';
  scanProgressTitle.textContent = 'Hoàn tất!';
  scanProgressSub.textContent = `Đã thêm ${addedCount} bài vào thư viện`;
  scanProgressFile.textContent = '';
  if (scanMusicBtnText) scanMusicBtnText.textContent = 'Quét';
  if (scanMusicIcon) scanMusicIcon.classList.remove('animate-spin');
  setTimeout(() => {
    scanProgressOverlay.classList.add('hidden');
    scanProgressOverlay.classList.remove('flex');
  }, 1200);
}

function abortScanProgress() {
  if (!scanProgressOverlay) return;
  scanProgressBar.classList.remove('scan-bar-indeterminate');
  scanProgressOverlay.classList.add('hidden');
  scanProgressOverlay.classList.remove('flex');
  if (scanMusicBtnText) scanMusicBtnText.textContent = 'Quét';
  if (scanMusicIcon) scanMusicIcon.classList.remove('animate-spin');
}

const SKIP_SCAN_DIRS = new Set([
  'android', '.android', 'data', 'obb', 'cache', '.cache', 'thumbnails', '.thumbnails',
  'lost+found', 'notifications', 'alarms', 'ringtones', 'ui', 'fonts', 'log', 'logs'
]);

// Deep recursive directory reader (showDirectoryPicker API) — full phone storage
async function scanDirectoryRecursively(dirHandle, onProgress) {
  const files = [];
  async function traverse(handle, depth) {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        try {
          const file = await entry.getFile();
          if (isAudioFile(file)) {
            files.push(file);
            if (onProgress && (files.length % 12 === 0)) onProgress(files.length);
          }
        } catch (e) { /* skip locked files */ }
      } else if (entry.kind === 'directory') {
        const name = (entry.name || '').toLowerCase();
        // Skip heavy system folders when scanning from storage root (keeps Music/Download/Zalo)
        if (depth === 0 && SKIP_SCAN_DIRS.has(name)) continue;
        if (name.startsWith('.') && name !== '.music') continue;
        try { await traverse(entry, depth + 1); } catch (e) { /* skip inaccessible dirs */ }
      }
    }
  }
  await traverse(dirHandle, 0);
  if (onProgress) onProgress(files.length);
  return files;
}

/**
 * Fast Binary Audio Duration Parser (<0.2ms per track)
 * Directly parses audio container headers (MP3, WAV, FLAC, M4A/AAC)
 * without WebAudio decode and without instantiating frozen new Audio() tags.
 */
function readMvhdDuration(u8, view) {
  for (let i = 0; i <= u8.length - 24; i++) {
    if (u8[i] === 0x6D && u8[i + 1] === 0x76 && u8[i + 2] === 0x68 && u8[i + 3] === 0x64) {
      const version = u8[i + 4];
      let timescale = 0;
      let durationUnits = 0;
      if (version === 0 && i + 24 <= u8.length) {
        timescale = view.getUint32(i + 16, false);
        durationUnits = view.getUint32(i + 20, false);
      } else if (version === 1 && i + 36 <= u8.length) {
        timescale = view.getUint32(i + 24, false);
        durationUnits = (view.getUint32(i + 28, false) * 4294967296) + view.getUint32(i + 32, false);
      }
      if (timescale > 0 && durationUnits > 0) {
        return Math.max(1, Math.round(durationUnits / timescale));
      }
    }
  }
  return 0;
}

/** Accurate duration via HTMLAudioElement metadata (fixes wrong list times for real files). */
function probeDurationWithAudio(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(0);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    let objectUrl = null;
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        audio.removeAttribute('src');
        audio.load();
      } catch (e) {}
      if (objectUrl) {
        try { URL.revokeObjectURL(objectUrl); } catch (e) {}
      }
      resolve(val > 0 && Number.isFinite(val) ? Math.round(val) : 0);
    };
    const timer = setTimeout(() => finish(0), 10000);
    audio.addEventListener('loadedmetadata', () => finish(audio.duration));
    audio.addEventListener('error', () => finish(0));
    try {
      if (src instanceof Blob) {
        objectUrl = URL.createObjectURL(src);
        audio.src = objectUrl;
      } else {
        audio.src = src;
      }
    } catch (e) {
      finish(0);
    }
  });
}

async function repairDurationsInBackground(songs) {
  const list = (songs || []).filter(s => s && (s.audioBlob || s.audioUrl) && !s.isDemo);
  if (list.length === 0) return;
  let cursor = 0;
  const workers = 2;

  async function worker() {
    while (cursor < list.length) {
      const song = list[cursor++];
      if (!song || song._durationVerified) continue;
      const src = song.audioBlob || song.audioUrl;
      const dur = await probeDurationWithAudio(src);
      song._durationVerified = true;
      if (dur > 0 && Math.abs((song.duration || 0) - dur) > 1) {
        song.duration = dur;
        try { await dbAddSong(song); } catch (e) {}
        const mono = document.querySelector(`.track-item[data-id="${song.id}"] .font-mono`);
        if (mono) mono.textContent = formatTime(dur, '--:--');
        const current = getCurrentSong();
        if (current && current.id === song.id && remainingTimeDisplay) {
          const left = Math.max(0, dur - (activeDeck.currentTime || 0));
          remainingTimeDisplay.textContent = '-' + formatTime(left);
        }
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
}

/**
 * Fast header parse (MP3/WAV/FLAC/M4A). Background probe corrects remaining errors.
 */
async function fastGetAudioDuration(file) {
  if (!file || !file.size) return 0;

  try {
    const sliceSize = Math.min(file.size, 65536);
    const arrayBuffer = await file.slice(0, sliceSize).arrayBuffer();
    const u8 = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);

    // 1. WAV
    if (u8.length >= 44 && u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 &&
        u8[8] === 0x57 && u8[9] === 0x41 && u8[10] === 0x56 && u8[11] === 0x45) {
      let offset = 12;
      while (offset + 8 <= u8.length) {
        const chunkId = view.getUint32(offset, false);
        const chunkSize = view.getUint32(offset + 4, true);
        if (chunkId === 0x666d7420) {
          const byteRate = view.getUint32(offset + 16, true);
          if (byteRate > 0) return Math.max(1, Math.round((file.size - 44) / byteRate));
        }
        offset += 8 + chunkSize + (chunkSize % 2);
      }
    }

    // 2. FLAC
    if (u8.length >= 26 && u8[0] === 0x66 && u8[1] === 0x4C && u8[2] === 0x61 && u8[3] === 0x43) {
      const blockType = u8[4] & 0x7F;
      if (blockType === 0) {
        const sampleRate = (u8[18] << 12) | (u8[19] << 4) | (u8[20] >> 4);
        const highSamples = u8[21] & 0x0F;
        const lowSamples = (u8[22] << 24) | (u8[23] << 16) | (u8[24] << 8) | u8[25];
        const totalSamples = (highSamples * 4294967296) + (lowSamples >>> 0);
        if (sampleRate > 0 && totalSamples > 0) return Math.max(1, Math.round(totalSamples / sampleRate));
      }
    }

    // 3. M4A / MP4 — head + tail (moov often at end)
    let m4aDur = readMvhdDuration(u8, view);
    if (!m4aDur && file.size > sliceSize) {
      const tailSize = Math.min(file.size, 196608);
      const tailBuf = await file.slice(file.size - tailSize).arrayBuffer();
      m4aDur = readMvhdDuration(new Uint8Array(tailBuf), new DataView(tailBuf));
    }
    if (m4aDur > 0) return m4aDur;

    // 4. MP3
    let id3Size = 0;
    let scanOffset = 0;
    if (u8.length >= 10 && u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) {
      id3Size = ((u8[6] & 0x7F) << 21) | ((u8[7] & 0x7F) << 14) | ((u8[8] & 0x7F) << 7) | (u8[9] & 0x7F);
      scanOffset = 10 + id3Size;
      if (u8[5] & 0x10) scanOffset += 10;
    }

    let mp3Buffer = u8;
    let mp3View = view;
    let localOffset = scanOffset;

    if (scanOffset >= u8.length && scanOffset < file.size) {
      const extraChunk = await file.slice(scanOffset, Math.min(file.size, scanOffset + 32768)).arrayBuffer();
      mp3Buffer = new Uint8Array(extraChunk);
      mp3View = new DataView(extraChunk);
      localOffset = 0;
    }

    const BITRATES_MPEG1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    const BITRATES_MPEG2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    const SAMPLE_RATES = [
      [11025, 12000, 8000],
      null,
      [22050, 24000, 16000],
      [44100, 48000, 32000]
    ];

    for (let i = localOffset; i <= mp3Buffer.length - 4; i++) {
      if (mp3Buffer[i] === 0xFF && (mp3Buffer[i + 1] & 0xE0) === 0xE0) {
        const versionBits = (mp3Buffer[i + 1] >> 3) & 0x03;
        const layerBits = (mp3Buffer[i + 1] >> 1) & 0x03;
        if (versionBits === 1 || layerBits === 0) continue;

        const bitrateIdx = (mp3Buffer[i + 2] >> 4) & 0x0F;
        const sampleRateIdx = (mp3Buffer[i + 2] >> 2) & 0x03;
        if (bitrateIdx === 0x0F || bitrateIdx === 0 || sampleRateIdx === 3) continue;

        const channelMode = (mp3Buffer[i + 3] >> 6) & 0x03;
        const sampleRate = SAMPLE_RATES[versionBits] ? SAMPLE_RATES[versionBits][sampleRateIdx] : 44100;
        let bitrate = 0;
        if (layerBits === 1) {
          bitrate = versionBits === 3 ? BITRATES_MPEG1_L3[bitrateIdx] : BITRATES_MPEG2_L3[bitrateIdx];
        } else {
          bitrate = 128;
        }
        if (!bitrate || !sampleRate) continue;

        const xingOffset = i + (versionBits === 3 ? (channelMode === 3 ? 21 : 36) : (channelMode === 3 ? 13 : 21));
        if (xingOffset + 12 <= mp3Buffer.length) {
          const isXing = (mp3Buffer[xingOffset] === 0x58 && mp3Buffer[xingOffset + 1] === 0x69 && mp3Buffer[xingOffset + 2] === 0x6E && mp3Buffer[xingOffset + 3] === 0x67) ||
                         (mp3Buffer[xingOffset] === 0x49 && mp3Buffer[xingOffset + 1] === 0x6E && mp3Buffer[xingOffset + 2] === 0x66 && mp3Buffer[xingOffset + 3] === 0x6F);
          if (isXing) {
            const flags = mp3View.getUint32(xingOffset + 4, false);
            if (flags & 0x01) {
              const frames = mp3View.getUint32(xingOffset + 8, false);
              const samplesPerFrame = layerBits === 3 ? 384 : (versionBits === 3 ? 1152 : 576);
              if (frames > 0 && sampleRate > 0) {
                return Math.max(1, Math.round((frames * samplesPerFrame) / sampleRate));
              }
            }
          }
        }

        const audioDataSize = Math.max(1, file.size - (id3Size || 0));
        return Math.max(1, Math.round((audioDataSize * 8) / (bitrate * 1000)));
      }
    }
  } catch (e) {
    console.warn('Fast duration parse error:', e);
  }

  if (file.size > 0) {
    return Math.max(15, Math.round((file.size * 8) / (160 * 1000)));
  }
  return 0;
}


/**
 * Ultra-fast import: no per-file header await in the hot path.
 * Duration is estimated instantly, then repaired in background.
 */
async function handleAudioFiles(files) {
  if (!files || files.length === 0) {
    abortScanProgress();
    return;
  }

  if (!scanProgressOverlay || scanProgressOverlay.classList.contains('hidden')) {
    beginPhoneScanProgress('Đang lọc file nhạc trên máy…');
  }

  // ── Step 1: Audio detection with 3-layer fallback ──────────
  let validFiles = Array.from(files).filter(f => isAudioFile(f));

  if (validFiles.length === 0) {
    validFiles = Array.from(files).filter(f => {
      const name = (f.name || '').toLowerCase();
      return SUPPORTED_AUDIO_EXTENSIONS.some(ext => name.endsWith(ext));
    });
  }

  if (validFiles.length === 0) {
    const SKIP = ['.jpg','.jpeg','.png','.gif','.webp','.bmp','.pdf','.txt','.doc','.docx','.xls','.xlsx','.zip','.apk','.exe','.xml','.json'];
    validFiles = Array.from(files).filter(f => {
      const n = (f.name || '').toLowerCase();
      return n.length > 0 && !SKIP.some(ext => n.endsWith(ext));
    });
  }

  if (validFiles.length === 0) {
    abortScanProgress();
    showToast('Không tìm thấy file nhạc nào', '⚠️');
    return;
  }

  const existingKeys = new Set(
    state.songs.map(s => `${s.fileName}__${s.fileSize || 0}`)
  );

  const seen = new Set();
  const uniqueFiles = [];
  for (let i = 0; i < validFiles.length; i++) {
    const file = validFiles[i];
    const key = `${file.name}__${file.size}`;
    if (seen.has(key) || existingKeys.has(key)) continue;
    // Near-dup by name+size tolerance
    let dup = false;
    for (const s of state.songs) {
      if (s.fileName === file.name && Math.abs((s.fileSize || 0) - file.size) < 512) {
        dup = true;
        break;
      }
    }
    if (dup) continue;
    seen.add(key);
    uniqueFiles.push(file);
  }

  if (uniqueFiles.length === 0) {
    abortScanProgress();
    showToast(`Tất cả ${validFiles.length} bài đã có trong thư viện`, '✅');
    return;
  }

  const total = uniqueFiles.length;
  showScanProgress(total, 'Đang nạp nhạc vào thư viện');

  const baseTs = Date.now();
  const newSongs = [];

  for (let i = 0; i < uniqueFiles.length; i++) {
    const file = uniqueFiles[i];
    const songId = 'mm_' + baseTs + '_' + i + '_' + Math.random().toString(36).substring(2, 6);
    const audioUrl = URL.createObjectURL(file);

    let title = file.name.replace(/\.[^/.]+$/, '');
    let artist = 'Music MIC Driver';
    if (title.includes(' - ')) {
      const parts = title.split(' - ');
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }

    // Instant size estimate — accurate duration fixed in background
    const duration = Math.max(15, Math.round((file.size * 8) / (160 * 1000)));

    newSongs.push({
      id: songId,
      title,
      artist,
      album: 'Music MIC Driver',
      duration,
      audioBlob: file,
      audioUrl,
      coverBlob: null,
      coverUrl: 'logo.png',
      fileName: file.name,
      fileSize: file.size,
      addedAt: baseTs + (total - i) * 10
    });

    if (i % 25 === 0 || i === total - 1) {
      updateScanProgress(i + 1, total, title);
      await yieldToUI();
    }
  }

  updateScanProgress(total, total, 'Đang lưu vào máy…');
  await dbAddSongsBatch(newSongs);

  state.songs = [
    ...newSongs,
    ...state.songs.filter(s => !newSongs.some(ns => ns.id === s.id))
  ];
  state.songs.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  rebuildQueue(true);
  renderTrackList();
  updateLibraryBadges();

  if (state.currentIndex === -1 && state.songs.length > 0) {
    state.currentIndex = 0;
    updateUIWithSong(state.songs[0]);
  }

  hideScanProgress(newSongs.length, total);
  repairDurationsInBackground(newSongs).catch(() => {});
}

/**
 * On-demand lazy ID3 enrichment: ONLY reads tags for the 1 song currently playing!
 * Eliminates background CPU thrashing, phone heating, and UI lag.
 */
function enrichCurrentSongID3(song) {
  if (!song || song._enriched || !song.audioBlob) return;
  song._enriched = true;

  // Verify duration via audio element (most accurate for real files)
  if (!song._durationVerified && (song.audioBlob || song.audioUrl)) {
    probeDurationWithAudio(song.audioBlob || song.audioUrl).then(dur => {
      song._durationVerified = true;
      if (dur > 0 && Math.abs((song.duration || 0) - dur) > 1) {
        song.duration = dur;
        dbAddSong(song).catch(() => {});
        const mono = document.querySelector(`.track-item[data-id="${song.id}"] .font-mono`);
        if (mono) mono.textContent = formatTime(dur, '--:--');
      }
    }).catch(() => {});
  }

  if (!window.jsmediatags) return;

  try {
    window.jsmediatags.read(song.audioBlob, {
      onSuccess: async (tag) => {
        const tags = tag.tags || {};
        let changed = false;
        if (tags.title && tags.title.trim()) { song.title = tags.title.trim(); changed = true; }
        if (tags.artist && tags.artist.trim()) { song.artist = tags.artist.trim(); changed = true; }
        if (tags.album && tags.album.trim()) { song.album = tags.album.trim(); changed = true; }
        if (tags.picture && tags.picture.data && tags.picture.data.length > 0) {
          try {
            let mime = tags.picture.format || 'image/jpeg';
            if (!mime.includes('/')) mime = mime.toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';
            const blob = new Blob([new Uint8Array(tags.picture.data)], { type: mime });
            song.coverBlob = blob;
            song.coverUrl  = URL.createObjectURL(blob);
            changed = true;
          } catch (e) {}
        }
        if (changed) {
          try { await dbAddSong(song); } catch (e) {}
          updateUIWithSong(song);
          updateMediaSession(song);
          const item = document.querySelector(`.track-item[data-id="${song.id}"]`);
          if (item) {
            const img = item.querySelector('img');
            if (img && song.coverUrl !== 'logo.png') img.src = song.coverUrl;
            const h4 = item.querySelector('h4');
            if (h4) h4.textContent = song.title;
          }
        }
      },
      onError: () => {}
    });
  } catch (e) {}
}

// ==========================================
// 9. UI RENDERING & APPLE MUSIC STYLING
// ==========================================
function updateUIWithSong(song) {
  if (!song) return;

  // Lazily extract ID3 tags for the playing track only
  enrichCurrentSongID3(song);

  // Mini Player
  miniTitle.textContent = song.title;
  miniArtist.textContent = song.artist;
  miniCover.src = song.coverUrl || 'logo.png';

  // Full Player
  fullTitle.textContent = song.title;
  fullArtist.textContent = song.artist;
  fullCover.src = song.coverUrl || 'logo.png';
  fullPlayerBackdropBlur.style.backgroundImage = `url('${song.coverUrl || 'logo.png'}')`;
  currentPlaylistTitle.textContent = song.album || 'Thư viện MM Drive';

  // Seekbar & Times
  const dur = (activeDeck.duration && !isNaN(activeDeck.duration) && activeDeck.duration > 0)
              ? activeDeck.duration
              : (song.duration || 0);
  const cur = activeDeck.currentTime || 0;
  if (currentTimeDisplay) currentTimeDisplay.textContent = formatTime(cur);
  if (remainingTimeDisplay) remainingTimeDisplay.textContent = dur > 0 ? ('-' + formatTime(Math.max(0, dur - cur))) : '--:--';
  const progressPercent = dur > 0 ? (cur / dur) * 100 : 0;
  if (seekBar) seekBar.value = progressPercent;
  if (miniProgressBar) miniProgressBar.style.width = `${progressPercent}%`;

  // Dynamic Mesh Gradient
  updateDynamicMesh(song.coverUrl || 'logo.png');

  // Active track styling in list
  highlightActiveTrackInList(song.id);
  updatePlayPauseUI();
}

function updatePlayPauseUI() {
  const isPlaying = state.isPlaying;

  // Artwork scale and glowing shadow (Apple Music signature effect)
  if (isPlaying) {
    fullCover.classList.add('artwork-playing');
    fullCover.classList.remove('artwork-paused');
  } else {
    fullCover.classList.add('artwork-paused');
    fullCover.classList.remove('artwork-playing');
  }

  // Mini Player icons
  miniPlayIcon.classList.toggle('hidden', isPlaying);
  miniPauseIcon.classList.toggle('hidden', !isPlaying);
  miniPlayingIndicator.classList.toggle('hidden', !isPlaying);
  miniPlayingIndicator.classList.toggle('flex', isPlaying);

  // Big Player icons
  bigPlayIcon.classList.toggle('hidden', isPlaying);
  bigPauseIcon.classList.toggle('hidden', !isPlaying);

  // CRITICAL FIX: Highlight soundwave ONLY for current playing song, never all tracks!
  const currentSong = getCurrentSong();
  highlightActiveTrackInList(currentSong ? currentSong.id : null);
}

function renderTrackList() {
  const query = state.searchQuery.toLowerCase().trim();
  const filtered = state.songs.filter(s => 
    s.title.toLowerCase().includes(query) || 
    s.artist.toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    trackListEl.innerHTML = '';
    emptyStateEl.classList.remove('hidden');
    emptyStateEl.classList.add('flex');
    if (query) {
      emptyStateEl.querySelector('h3').textContent = 'Không tìm thấy kết quả';
      emptyStateEl.querySelector('p').textContent = `Không có bài hát nào khớp với từ khóa "${query}".`;
      if (emptyStateScanBtn) emptyStateScanBtn.classList.add('hidden');
    } else {
      emptyStateEl.querySelector('h3').textContent = 'Thư viện chưa có nhạc';
      emptyStateEl.querySelector('p').innerHTML = 'Chạm vào nút bên dưới để quét toàn bộ bài hát trong máy (<span class="text-emerald-400 font-semibold">Tải về, Zalo, Thẻ nhớ...</span>). Ứng dụng sẽ <span class="text-cyan-400 font-semibold">tự động quét và lưu vĩnh viễn</span> vào máy của bạn!';
      if (emptyStateScanBtn) emptyStateScanBtn.classList.remove('hidden');
    }
    return;
  }

  emptyStateEl.classList.add('hidden');
  emptyStateEl.classList.remove('flex');

  const currentSong = getCurrentSong();
  const currentId = currentSong ? currentSong.id : null;

  trackListEl.innerHTML = filtered.map((song, idx) => {
    const isCurrent = song.id === currentId;
    return `
      <div class="track-item flex items-center justify-between p-2.5 rounded-2xl hover:bg-white/10 transition-all cursor-pointer group ${isCurrent ? 'bg-white/10' : ''}" data-id="${song.id}">
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <div class="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/5 border border-white/10 shadow-sm">
            <img src="${song.coverUrl || 'logo.png'}" loading="lazy" decoding="async" alt="Cover" class="w-full h-full object-cover">
            <div class="active-soundwave absolute inset-0 bg-black/50 ${isCurrent && state.isPlaying ? 'flex' : 'hidden'} items-center justify-center">
              <div class="flex items-end gap-0.5 h-3">
                <span class="sound-wave-bar"></span>
                <span class="sound-wave-bar"></span>
                <span class="sound-wave-bar"></span>
              </div>
            </div>
          </div>
          <div class="flex flex-col min-w-0 pr-2">
            <h4 class="text-sm font-semibold truncate ${isCurrent ? 'text-pink-400 font-bold' : 'text-white'}">${escapeHtml(song.title)}</h4>
            <p class="text-xs text-white/50 truncate">${escapeHtml(song.artist)}</p>
          </div>
        </div>

        <div class="flex items-center gap-3 flex-shrink-0">
          <span class="text-xs text-white/40 font-mono">${formatTime(song.duration, '--:--')}</span>
          <button class="delete-btn w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-red-400 active:scale-90 transition-all" data-delete-id="${song.id}" title="Xóa khỏi máy">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function highlightActiveTrackInList(activeId) {
  const items = document.querySelectorAll('.track-item');
  items.forEach(item => {
    const isCurrent = item.dataset.id === activeId;
    item.classList.toggle('bg-white/10', isCurrent);
    const titleEl = item.querySelector('h4');
    if (titleEl) {
      titleEl.classList.toggle('text-pink-400', isCurrent);
      titleEl.classList.toggle('font-bold', isCurrent);
      titleEl.classList.toggle('text-white', !isCurrent);
    }
    const waveEl = item.querySelector('.active-soundwave');
    if (waveEl) {
      waveEl.classList.toggle('hidden', !(isCurrent && state.isPlaying));
      waveEl.classList.toggle('flex', isCurrent && state.isPlaying);
    }
  });
}

function renderQueueList() {
  if (state.queue.length === 0) {
    queueList.innerHTML = '<div class="text-sm text-white/40 text-center py-6">Danh sách chờ trống</div>';
    return;
  }

  const currentSong = getCurrentSong();
  const upcomingQueue = state.queue.slice(state.currentIndex + 1);

  queueSubtitle.textContent = state.isShuffle
    ? `Seamless Mix • tự lọc tempo • Còn ${upcomingQueue.length} bài`
    : `Theo thứ tự • Còn ${upcomingQueue.length} bài tiếp theo`;

  let html = '';
  if (currentSong) {
    html += `
      <div class="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1 px-1">Đang phát</div>
      <div class="flex items-center gap-3 p-2.5 rounded-2xl bg-white/10 border border-white/10">
        <img src="${currentSong.coverUrl || 'logo.png'}" class="w-10 h-10 rounded-xl object-cover">
        <div class="flex-1 min-w-0">
          <div class="text-sm font-semibold text-pink-400 truncate">${escapeHtml(currentSong.title)}</div>
          <div class="text-xs text-white/60 truncate">${escapeHtml(currentSong.artist)}</div>
        </div>
      </div>
    `;
  }

  if (upcomingQueue.length > 0) {
    html += `<div class="text-[11px] font-bold text-white/40 uppercase tracking-wider mt-4 mb-1 px-1">Tiếp theo</div>`;
    html += upcomingQueue.map((songId, idx) => {
      const s = state.songs.find(item => item.id === songId);
      if (!s) return '';
      return `
        <div class="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 cursor-pointer queue-item transition-all" data-queue-id="${s.id}">
          <div class="flex items-center gap-3 min-w-0">
            <span class="text-xs font-mono text-white/40 w-4">${idx + 1}</span>
            <img src="${s.coverUrl || 'logo.png'}" class="w-9 h-9 rounded-lg object-cover">
            <div class="flex flex-col min-w-0">
              <span class="text-sm text-white font-medium truncate">${escapeHtml(s.title)}</span>
              <span class="text-xs text-white/50 truncate">${escapeHtml(s.artist)}</span>
            </div>
          </div>
          <span class="text-xs text-white/40 font-mono">${formatTime(s.duration, '--:--')}</span>
        </div>
      `;
    }).join('');
  }

  queueList.innerHTML = html;
}

function updateLibraryBadges() {
  trackCountBadge.textContent = `${state.songs.length} bài hát`;
  let totalBytes = 0;
  state.songs.forEach(s => {
    if (s.fileSize) totalBytes += s.fileSize;
    else if (s.audioBlob && s.audioBlob.size) totalBytes += s.audioBlob.size;
  });
  const mb = (totalBytes / (1024 * 1024)).toFixed(1);
  storageInfoBadge.textContent = `${mb} MB đã lưu`;
}

// ==========================================
// 10. GESTURES & INTERACTION
// ==========================================
// Swipe up on mini player to open full player
let touchStartY = 0;
miniPlayerCard.addEventListener('touchstart', (e) => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });

miniPlayerCard.addEventListener('touchend', (e) => {
  const touchEndY = e.changedTouches[0].clientY;
  if (touchStartY - touchEndY > 40) {
    openFullPlayer();
  }
}, { passive: true });

// Swipe-down: window-level tracking (finger can leave header) + 1:1 follow (no mid-screen fight)
const fpDragSurface = document.getElementById('fpDragSurface');
let fpDrag = {
  active: false,
  moved: false,
  startX: 0,
  startY: 0,
  lastY: 0,
  lastT: 0,
  pull: 0,
  velocity: 0,
  raf: 0,
  pointerId: null,
  listening: false,
  suppressClick: false,
  pendingPull: 0
};

function fpClearInlineSheet() {
  fullPlayer.style.transform = '';
  fullPlayer.style.opacity = '';
  fullPlayer.style.borderRadius = '';
  fullPlayer.style.background = '';
  if (fullPlayerBackdropBlur) fullPlayerBackdropBlur.style.opacity = '';
  if (fullPlayerBg) {
    fullPlayerBg.style.opacity = '';
    fullPlayerBg.style.background = '';
  }
  if (fullPlayerBgVeil) fullPlayerBgVeil.style.opacity = '';
}

function fpResetDragVisual() {
  if (fpDrag.raf) {
    cancelAnimationFrame(fpDrag.raf);
    fpDrag.raf = 0;
  }
  fpUnbindWindowDrag();
  fullPlayer.classList.remove('fp-dragging', 'fp-dismissing', 'fp-snapping');
  fpClearInlineSheet();
}

/** 1:1 finger follow — kill solid backdrop so playlist under the sheet is obvious */
function fpApplyPull(rawPull) {
  const h = window.innerHeight || 700;
  let y = Math.max(0, rawPull);
  const edge = h * 0.88;
  if (y > edge) y = edge + (y - edge) * 0.45;

  // Full ghost by ~18% of screen height (short pull = clear see-through)
  const progress = Math.min(1, y / (h * 0.18));
  const ease = progress * progress * (3 - 2 * progress); // smoothstep
  const scale = 1 - ease * 0.12;
  const radius = 12 + ease * 36;

  fullPlayer.style.transform = `translate3d(0, ${y}px, 0) scale(${scale})`;
  fullPlayer.style.borderRadius = `${radius}px ${radius}px 0 0`;
  // Keep chrome readable; do NOT fade the whole sheet (that hid the library)
  fullPlayer.style.opacity = '1';
  fullPlayer.style.background = 'transparent';
  fullPlayer.style.setProperty('--fp-ghost', String(ease));

  // Solid dark plate → nearly gone so song list shows through
  if (fullPlayerBg) {
    fullPlayerBg.style.opacity = String(Math.max(0.06, 1 - ease * 0.94));
    fullPlayerBg.style.background = ease > 0.15
      ? `rgba(10, 10, 15, ${Math.max(0.05, 0.92 * (1 - ease))})`
      : '';
  }
  if (fullPlayerBgVeil) {
    fullPlayerBgVeil.style.opacity = String(Math.max(0, 1 - ease * 1.05));
  }
  if (fullPlayerBackdropBlur) {
    fullPlayerBackdropBlur.style.opacity = String(Math.max(0.02, 0.5 * (1 - ease)));
  }
  fpDrag.pull = y;
}

function fpSchedulePull(rawPull) {
  fpDrag.pendingPull = rawPull;
  if (fpDrag.raf) return;
  fpDrag.raf = requestAnimationFrame(() => {
    fpDrag.raf = 0;
    if (!fpDrag.active) return;
    fpApplyPull(fpDrag.pendingPull);
  });
}

function fpDismissAnimated() {
  if (fpDrag.raf) {
    cancelAnimationFrame(fpDrag.raf);
    fpDrag.raf = 0;
  }
  fpUnbindWindowDrag();
  fullPlayer.classList.remove('fp-dragging', 'fp-snapping');
  fullPlayer.classList.add('fp-dismissing');
  const h = window.innerHeight || 700;
  fullPlayer.style.transform = `translate3d(0, ${Math.round(h * 1.08)}px, 0) scale(0.9)`;
  fullPlayer.style.opacity = '0.55';
  fullPlayer.style.borderRadius = '36px 36px 0 0';
  if (fullPlayerBg) fullPlayerBg.style.opacity = '0';
  if (fullPlayerBgVeil) fullPlayerBgVeil.style.opacity = '0';
  setTimeout(() => closeFullPlayer(), 320);
}

function fpSnapBack() {
  if (fpDrag.raf) {
    cancelAnimationFrame(fpDrag.raf);
    fpDrag.raf = 0;
  }
  fpUnbindWindowDrag();
  fullPlayer.classList.remove('fp-dragging', 'fp-dismissing');
  fullPlayer.classList.add('fp-snapping');
  fullPlayer.style.transform = `translate3d(0, ${fpDrag.pull || 0}px, 0) scale(1)`;
  requestAnimationFrame(() => {
    fullPlayer.style.transform = 'translate3d(0, 0, 0) scale(1)';
    fullPlayer.style.opacity = '1';
    fullPlayer.style.borderRadius = '0px';
    fullPlayer.style.background = '';
    if (fullPlayerBackdropBlur) fullPlayerBackdropBlur.style.opacity = '';
    if (fullPlayerBg) {
      fullPlayerBg.style.opacity = '';
      fullPlayerBg.style.background = '';
    }
    if (fullPlayerBgVeil) fullPlayerBgVeil.style.opacity = '';
  });
  setTimeout(() => {
    fullPlayer.classList.remove('fp-snapping');
    if (!fullPlayer.classList.contains('fp-dismissing')) fpClearInlineSheet();
  }, 420);
}

function fpIsControlTarget(target) {
  return !!(target && target.closest && target.closest(
    '#closeFullPlayerBtn, #openQueueBtn, #bigPlayBtn, #nextBtn, #prevBtn, #shuffleBtn, #repeatBtn, #favoriteBtn, #changeCoverBadgeBtn, input[type="range"]'
  ));
}

function fpBindWindowDrag() {
  if (fpDrag.listening) return;
  fpDrag.listening = true;
  window.addEventListener('pointermove', fpPointerMove, { passive: false, capture: true });
  window.addEventListener('pointerup', fpPointerUp, { capture: true });
  window.addEventListener('pointercancel', fpPointerUp, { capture: true });
  window.addEventListener('touchmove', fpTouchMove, { passive: false, capture: true });
  window.addEventListener('touchend', fpTouchEnd, { capture: true });
  window.addEventListener('touchcancel', fpTouchEnd, { capture: true });
}

function fpUnbindWindowDrag() {
  if (!fpDrag.listening) return;
  fpDrag.listening = false;
  window.removeEventListener('pointermove', fpPointerMove, { capture: true });
  window.removeEventListener('pointerup', fpPointerUp, { capture: true });
  window.removeEventListener('pointercancel', fpPointerUp, { capture: true });
  window.removeEventListener('touchmove', fpTouchMove, { capture: true });
  window.removeEventListener('touchend', fpTouchEnd, { capture: true });
  window.removeEventListener('touchcancel', fpTouchEnd, { capture: true });
}

function fpBeginDrag(clientX, clientY, pointerId) {
  fpDrag.active = true;
  fpDrag.moved = false;
  fpDrag.startX = clientX;
  fpDrag.startY = clientY;
  fpDrag.lastY = clientY;
  fpDrag.lastT = performance.now();
  fpDrag.velocity = 0;
  fpDrag.pull = 0;
  fpDrag.pendingPull = 0;
  fpDrag.pointerId = pointerId == null ? null : pointerId;

  fullPlayer.classList.add('fp-dragging');
  fullPlayer.classList.remove('fp-dismissing', 'fp-snapping');
  fpBindWindowDrag();
}

function fpFinishDrag(clientX, clientY, target) {
  if (!fpDrag.active) return;
  const dy = clientY - fpDrag.startY;
  const dx = Math.abs(clientX - fpDrag.startX);
  const wasMoved = fpDrag.moved;
  const h = window.innerHeight || 700;
  const flickDown = fpDrag.velocity > 0.45;
  const dismissByDistance = dy > h * 0.14 || fpDrag.pull > h * 0.14;

  fpDrag.active = false;
  fpDrag.pointerId = null;
  fpUnbindWindowDrag();

  if (wasMoved) fpDrag.suppressClick = true;

  if (wasMoved && (dismissByDistance || (flickDown && dy > 24))) {
    fpDismissAnimated();
  } else if (wasMoved) {
    fpSnapBack();
  } else if (!fpIsControlTarget(target) && Math.abs(dy) < 10 && dx < 10) {
    // Tap on drag surface (not controls) → close
    if (target && target.closest && target.closest('#artworkContainerBtn') && !target.closest('#changeCoverBadgeBtn')) {
      // let artwork tap open cover picker — don't auto-close
      fpSnapBack();
    } else if (target && target.closest && (target.closest('#fullPlayerHeader') || target.closest('#swipeHandle'))) {
      fpDismissAnimated();
    } else {
      fpSnapBack();
    }
  } else {
    fpSnapBack();
  }
  fpDrag.moved = false;
}

function fpPointerDown(e) {
  if (!fullPlayer.classList.contains('visible-player')) return;
  if (fpIsControlTarget(e.target)) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  fpBeginDrag(e.clientX, e.clientY, e.pointerId);
  try { (fpDragSurface || fullPlayer).setPointerCapture(e.pointerId); } catch (err) {}
}

function fpPointerMove(e) {
  if (!fpDrag.active) return;
  if (fpDrag.pointerId != null && e.pointerId !== fpDrag.pointerId) return;

  const now = performance.now();
  const dy = e.clientY - fpDrag.startY;
  const dx = Math.abs(e.clientX - fpDrag.startX);
  const dt = Math.max(8, now - fpDrag.lastT);
  fpDrag.velocity = fpDrag.velocity * 0.65 + ((e.clientY - fpDrag.lastY) / dt) * 0.35;
  fpDrag.lastY = e.clientY;
  fpDrag.lastT = now;

  // Once downward drag starts, keep following even if finger goes sideways a bit
  if (dy > 2 && (fpDrag.moved || dy >= dx * 0.55)) {
    fpDrag.moved = true;
    if (e.cancelable) e.preventDefault();
    fpSchedulePull(dy);
  }
}

function fpPointerUp(e) {
  if (!fpDrag.active) return;
  if (fpDrag.pointerId != null && e.pointerId !== fpDrag.pointerId) return;
  try {
    if (fpDrag.pointerId != null) (fpDragSurface || fullPlayer).releasePointerCapture(fpDrag.pointerId);
  } catch (err) {}
  fpFinishDrag(
    e.clientX != null ? e.clientX : fpDrag.startX,
    e.clientY != null ? e.clientY : fpDrag.lastY,
    e.target
  );
}

function fpTouchMove(e) {
  if (!fpDrag.active || !e.touches[0]) return;
  // Prefer pointer events when available; this is backup for stubborn WebViews
  if (window.PointerEvent && fpDrag.pointerId != null) return;
  const t = e.touches[0];
  const now = performance.now();
  const dy = t.clientY - fpDrag.startY;
  const dx = Math.abs(t.clientX - fpDrag.startX);
  const dt = Math.max(8, now - fpDrag.lastT);
  fpDrag.velocity = fpDrag.velocity * 0.65 + ((t.clientY - fpDrag.lastY) / dt) * 0.35;
  fpDrag.lastY = t.clientY;
  fpDrag.lastT = now;
  if (dy > 2 && (fpDrag.moved || dy >= dx * 0.55)) {
    fpDrag.moved = true;
    if (e.cancelable) e.preventDefault();
    fpSchedulePull(dy);
  }
}

function fpTouchEnd(e) {
  if (!fpDrag.active) return;
  if (window.PointerEvent && fpDrag.pointerId != null) return;
  const t = e.changedTouches && e.changedTouches[0];
  fpFinishDrag(
    t ? t.clientX : fpDrag.startX,
    t ? t.clientY : fpDrag.lastY,
    e.target
  );
}

function setupFullPlayerSwipe() {
  const zone = fpDragSurface || fullPlayerHeader;
  if (!fullPlayer || !zone) return;

  if (window.PointerEvent) {
    zone.addEventListener('pointerdown', fpPointerDown, { passive: false });
  } else {
    zone.addEventListener('touchstart', (e) => {
      if (fpIsControlTarget(e.target) || !e.touches[0]) return;
      fpBeginDrag(e.touches[0].clientX, e.touches[0].clientY, null);
    }, { passive: true });
  }
}

setupFullPlayerSwipe();

function openFullPlayer() {
  fpResetDragVisual();
  fullPlayer.classList.remove('hidden-player', 'fp-dismissing', 'fp-snapping');
  fullPlayer.classList.add('visible-player');
}

function closeFullPlayer() {
  fullPlayer.classList.remove('visible-player', 'fp-dragging', 'fp-dismissing', 'fp-snapping');
  fullPlayer.classList.add('hidden-player');
  fpResetDragVisual();
}

function showToast(msg, icon = '✨') {
  toastMsg.textContent = msg;
  toastIcon.textContent = icon;
  toastEl.classList.remove('hide');
  toastEl.classList.add('show');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => {
    toastEl.classList.remove('show');
    toastEl.classList.add('hide');
  }, 2400);
}

function formatTime(seconds, fallback = '0:00') {
  if (isNaN(seconds) || seconds < 0) return fallback;
  if (seconds === 0 && fallback !== '0:00') return fallback;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Native Android MediaStore — full-device audio index
async function scanAllAudioNative() {
  if (!isNativeApk()) {
    beginPhoneScanProgress('Chọn thư mục Bộ nhớ trong để quét cả máy…');
    if (scanFolderInput) scanFolderInput.click();
    return;
  }

  if (state.nativeScanBusy) return;
  state.nativeScanBusy = true;
  beginPhoneScanProgress('Đang quét toàn bộ MediaStore trên máy…');

  try {
    const res = await window.Capacitor.Plugins.MediaStoreScanner.scanAllAudio();
    nativeRefreshGate.lastAt = Date.now();
    if (res && res.songs && res.songs.length > 0) {
      updateScanDiscoverCount(res.songs.length);
      await yieldToUI();
      await handleNativeSongs(res.songs, { silent: false });
    } else {
      abortScanProgress();
      showToast('Không tìm thấy bài hát nào trên thiết bị', '⚠️');
    }
  } catch (err) {
    console.warn('Native MediaStore scan error:', err);
    abortScanProgress();
    showToast('Chưa cấp quyền bộ nhớ: ' + (err.message || err), '⚠️');
    beginPhoneScanProgress('Chọn thư mục Bộ nhớ trong để quét cả máy…');
    if (scanFolderInput) scanFolderInput.click();
  } finally {
    state.nativeScanBusy = false;
  }
}

/**
 * Lightweight APK refresh: query MediaStore, add ONLY missing tracks, pin them on top.
 * No overlay unless caller uses full scan. Throttled for efficiency.
 */
async function refreshNativeLibrarySilent() {
  if (!isNativeApk()) return 0;
  if (state.nativeScanBusy) return 0;

  const now = Date.now();
  if (now - nativeRefreshGate.lastAt < nativeRefreshGate.minIntervalMs) return 0;

  state.nativeScanBusy = true;
  nativeRefreshGate.lastAt = now;

  try {
    const res = await window.Capacitor.Plugins.MediaStoreScanner.scanAllAudio();
    if (!res || !res.songs || res.songs.length === 0) return 0;

    const added = await handleNativeSongs(res.songs, { silent: true });
    if (added > 0) {
      showToast(`+${added} bài mới vừa có trên máy`, '🎵');
    }
    return added;
  } catch (err) {
    console.warn('Silent MediaStore refresh:', err);
    return 0;
  } finally {
    state.nativeScanBusy = false;
  }
}

function setupNativeAutoRefresh() {
  if (!isNativeApk()) return;

  // Resume when returning from Zalo / Drive / home screen
  window.addEventListener('focus', () => {
    refreshNativeLibrarySilent();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) refreshNativeLibrarySilent();
  });

  // Capacitor App plugin (optional — safe if not installed)
  try {
    const AppPlugin = window.Capacitor.Plugins.App;
    if (AppPlugin && typeof AppPlugin.addListener === 'function') {
      AppPlugin.addListener('appStateChange', (stateInfo) => {
        if (stateInfo && stateInfo.isActive) refreshNativeLibrarySilent();
      });
    }
  } catch (e) {}
}

/**
 * @param {Array} nativeList
 * @param {{ silent?: boolean }} options  silent = background refresh (no progress UI)
 * @returns {Promise<number>} number of newly added songs
 */
async function handleNativeSongs(nativeList, options = {}) {
  const silent = !!options.silent;
  const total = nativeList.length;
  if (!total) {
    if (!silent) abortScanProgress();
    return 0;
  }

  if (!silent) showScanProgress(total, 'Đang nạp nhạc vào thư viện');

  const known = buildKnownSongKeySet(state.songs);
  const newSongs = [];
  const baseTs = Date.now();

  for (let i = 0; i < nativeList.length; i++) {
    const item = nativeList[i];
    const keys = nativeItemKeys(item);
    let exists = false;
    for (let k = 0; k < keys.length; k++) {
      if (known.has(keys[k])) { exists = true; break; }
    }
    if (exists) continue;

    for (let k = 0; k < keys.length; k++) known.add(keys[k]);

    let audioUrl = item.contentUri;
    if (window.Capacitor && window.Capacitor.convertFileSrc && item.path) {
      audioUrl = window.Capacitor.convertFileSrc(item.path);
    }

    let duration = (typeof item.duration === 'number' && item.duration > 0)
      ? Math.round(item.duration)
      : 0;
    if (duration <= 0 && item.size > 0) {
      duration = Math.max(15, Math.round((item.size * 8) / (160 * 1000)));
    }

    // Stamp discover-time so brand-new downloads always float to the top
    const addedAt = baseTs + (nativeList.length - i);

    newSongs.push({
      id: item.id || ('mm_nat_' + baseTs + '_' + i),
      title: item.title,
      artist: item.artist,
      album: item.album,
      duration: duration,
      audioBlob: null,
      audioUrl: audioUrl,
      nativePath: item.path,
      nativeUri: item.contentUri,
      coverBlob: null,
      coverUrl: item.albumArtUri || 'logo.png',
      fileName: item.fileName,
      fileSize: item.size,
      addedAt,
      isNative: true,
      _durationVerified: duration > 0
    });

    if (!silent && (newSongs.length % 50 === 0 || i === total - 1)) {
      updateScanProgress(i + 1, total, item.title || '…');
      await yieldToUI();
    }
  }

  if (newSongs.length === 0) {
    if (!silent) hideScanProgress(0, total);
    return 0;
  }

  // Newest MediaStore hits first among this batch
  newSongs.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

  if (!silent) updateScanProgress(total, total, 'Đang lưu vào máy…');
  await dbAddSongsBatch(newSongs);

  // Prepend only new tracks — O(new) vs full re-sort of whole library
  const newIds = new Set(newSongs.map(s => s.id));
  state.songs = [
    ...newSongs,
    ...state.songs.filter(s => !newIds.has(s.id))
  ];

  rebuildQueue(true);
  renderTrackList();
  updateLibraryBadges();

  if (state.currentIndex === -1 && state.songs.length > 0) {
    state.currentIndex = 0;
    updateUIWithSong(state.songs[0]);
  }

  if (!silent) hideScanProgress(newSongs.length, total);
  return newSongs.length;
}

// ==========================================
// 11. EVENT HANDLERS & BINDINGS
// ==========================================
function setupEventHandlers() {
  /**
   * Auto local-storage scan only (no cloud / Google picker).
   * APK → MediaStore; Web/PWA → chọn thư mục bộ nhớ máy (đệ quy local).
   */
  async function triggerLocalStorageScan() {
    // Progress bar immediately — user always sees load from the first tap
    beginPhoneScanProgress('Đang chuẩn bị quét toàn bộ điện thoại…');

    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      await scanAllAudioNative();
      return;
    }

    if ('showDirectoryPicker' in window) {
      try {
        beginPhoneScanProgress('Chọn Bộ nhớ trong / thẻ nhớ để quét cả máy…');
        const dirHandle = await window.showDirectoryPicker();
        beginPhoneScanProgress('Đang quét toàn bộ thư mục trên máy…');
        const files = await scanDirectoryRecursively(dirHandle, (found) => {
          updateScanDiscoverCount(found);
        });
        if (files.length > 0) {
          await handleAudioFiles(files);
        } else {
          abortScanProgress();
          showToast('Không tìm thấy file âm thanh trong thư mục này', '⚠️');
        }
        return;
      } catch (err) {
        if (err.name === 'AbortError') {
          abortScanProgress();
          return;
        }
        console.warn('showDirectoryPicker fallback:', err);
      }
    }

    // Fallback: webkitdirectory — keep load bar visible while system picker opens
    beginPhoneScanProgress('Chọn Bộ nhớ trong rồi bấm Chọn tất cả…');
    if (scanFolderInput) scanFolderInput.click();
  }

  function triggerFreeFilePicker() {
    if (freeFileInput) freeFileInput.click();
  }

  if (scanMusicBtn) scanMusicBtn.addEventListener('click', () => triggerLocalStorageScan());
  if (emptyStateScanBtn) emptyStateScanBtn.addEventListener('click', () => triggerLocalStorageScan());

  if (modalScanAudioBtn) {
    modalScanAudioBtn.addEventListener('click', () => {
      optionsModal.classList.add('hidden');
      optionsModal.classList.remove('flex');
      triggerLocalStorageScan();
    });
  }

  if (pickFileBtn) pickFileBtn.addEventListener('click', () => triggerFreeFilePicker());
  if (emptyStatePickFileBtn) emptyStatePickFileBtn.addEventListener('click', () => triggerFreeFilePicker());
  if (modalPickFileBtn) {
    modalPickFileBtn.addEventListener('click', () => {
      optionsModal.classList.add('hidden');
      optionsModal.classList.remove('flex');
      triggerFreeFilePicker();
    });
  }

  if (scanAudioInput) {
    scanAudioInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleAudioFiles(e.target.files);
        scanAudioInput.value = '';
      }
    });
  }

  if (scanFolderInput) {
    scanFolderInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        beginPhoneScanProgress(`Đã chọn ${e.target.files.length} file — đang lọc nhạc…`);
        handleAudioFiles(e.target.files);
        scanFolderInput.value = '';
      } else {
        abortScanProgress();
      }
    });
    // User cancelled system picker (focus returns with no files)
    scanFolderInput.addEventListener('cancel', () => abortScanProgress());
  }

  if (freeFileInput) {
    freeFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        beginPhoneScanProgress(`Đang nạp ${e.target.files.length} file…`);
        handleAudioFiles(e.target.files);
        freeFileInput.value = '';
      }
    });
  }

  // Drag and Drop (folders or files)
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    const files = [];
    const queue = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.webkitGetAsEntry) {
        const entry = item.webkitGetAsEntry();
        if (entry) queue.push(entry);
      } else if (item.getAsFile) {
        const f = item.getAsFile();
        if (f && isAudioFile(f.name)) files.push(f);
      }
    }

    async function traverseEntry(entry) {
      if (entry.isFile) {
        return new Promise(resolve => {
          entry.file(f => {
            if (isAudioFile(f.name)) files.push(f);
            resolve();
          }, () => resolve());
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        return new Promise(resolve => {
          dirReader.readEntries(async entries => {
            for (const child of entries) {
              await traverseEntry(child);
            }
            resolve();
          }, () => resolve());
        });
      }
    }

    for (const entry of queue) {
      await traverseEntry(entry);
    }

    if (files.length > 0) {
      handleAudioFiles(files, false);
    }
  });

  // Search
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    clearSearchBtn.classList.toggle('hidden', !state.searchQuery);
    clearSearchBtn.classList.toggle('flex', !!state.searchQuery);
    renderTrackList();
  });

  clearSearchBtn.addEventListener('click', () => {
    state.searchQuery = '';
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    clearSearchBtn.classList.remove('flex');
    renderTrackList();
  });

  // Track list click delegation
  trackListEl.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) {
      e.stopPropagation();
      const id = deleteBtn.dataset.deleteId;
      if (confirm('Bạn có chắc muốn xóa bài hát này khỏi máy?')) {
        await dbDeleteSong(id);
        state.songs = state.songs.filter(s => s.id !== id);
        rebuildQueue(true);
        renderTrackList();
        updateLibraryBadges();
        showToast('Đã xóa bài hát khỏi bộ nhớ', '🗑️');
      }
      return;
    }

    const trackItem = e.target.closest('.track-item');
    if (trackItem) {
      const id = trackItem.dataset.id;
      playSongById(id, false);
      openFullPlayer();
    }
  });

  // Mini Player Controls
  document.getElementById('miniPlayerInfoArea').addEventListener('click', () => openFullPlayer());
  miniPlayBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlayPause();
  });
  miniNextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleNext(true);
  });

  // Full Player Controls
  closeFullPlayerBtn.addEventListener('click', () => closeFullPlayer());
  swipeHandle.addEventListener('click', () => closeFullPlayer());
  bigPlayBtn.addEventListener('click', () => togglePlayPause());
  nextBtn.addEventListener('click', () => handleNext(true));
  prevBtn.addEventListener('click', () => handlePrev());
  shuffleBtn.addEventListener('click', () => toggleShuffle());
  repeatBtn.addEventListener('click', () => toggleRepeat());

  // Quick Shuffle all from Library header
  quickShuffleAllBtn.addEventListener('click', () => {
    if (state.songs.length === 0) {
      showToast('Thư viện chưa có bài hát nào', '⚠️');
      return;
    }
    state.isShuffle = true;
    shuffleDot.classList.remove('hidden');
    shuffleBtn.classList.add('text-pink-500');
    shuffleBtn.classList.remove('text-white/60');
    if (shuffleBtn) shuffleBtn.title = 'Seamless Smart Shuffle — tự lọc tempo, chuyển bài liền mạch';
    rebuildQueue(false);
    playSongById(state.queue[0], false);
    openFullPlayer();
    showToast('Seamless Mix đang chạy', '✨');
  });

  // Scrubber / Seekbar
  seekBar.addEventListener('mousedown', () => { state.isDraggingSeek = true; });
  seekBar.addEventListener('touchstart', () => { state.isDraggingSeek = true; }, { passive: true });
  seekBar.addEventListener('input', (e) => {
    if (activeDeck.duration) {
      const seekTarget = (e.target.value / 100) * activeDeck.duration;
      currentTimeDisplay.textContent = formatTime(seekTarget);
      remainingTimeDisplay.textContent = '-' + formatTime(Math.max(0, activeDeck.duration - seekTarget));
    }
  });
  seekBar.addEventListener('change', (e) => {
    if (activeDeck.duration) {
      activeDeck.currentTime = (e.target.value / 100) * activeDeck.duration;
    }
    state.isDraggingSeek = false;
  });
  seekBar.addEventListener('mouseup', () => { state.isDraggingSeek = false; });
  seekBar.addEventListener('touchend', () => { state.isDraggingSeek = false; });

  // Volume Bar
  volumeBar.addEventListener('input', (e) => {
    state.masterVolume = parseFloat(e.target.value);
    activeDeck.volume = state.masterVolume;
  });

  // Cover Image Picker
  if (coverPickerInput) {
    coverPickerInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const currentSong = getCurrentSong();
      if (!currentSong) {
        showToast('Chưa chọn bài hát để đổi ảnh bìa', '⚠️');
        coverPickerInput.value = '';
        return;
      }

      showToast('Đang cập nhật ảnh bìa mới...', '⏳');

      currentSong.coverBlob = file;
      currentSong.coverUrl = URL.createObjectURL(file);

      // Save permanently to IndexedDB
      await dbAddSong(currentSong);

      // Refresh UI & Player & Lockscreen
      updateUIWithSong(currentSong);
      updateMediaSession(currentSong);
      renderTrackList();
      showToast('🎉 Đã đổi ảnh bìa thành công!', '🖼️');
      coverPickerInput.value = '';
    });
  }

  const artworkContainerBtn = document.getElementById('artworkContainerBtn');
  const changeCoverBadgeBtn = document.getElementById('changeCoverBadgeBtn');

  const triggerChangeCover = () => {
    const currentSong = getCurrentSong();
    if (!currentSong) {
      showToast('Hãy chọn hoặc phát một bài hát để đổi ảnh bìa', '⚠️');
      return;
    }
    if (coverPickerInput) {
      coverPickerInput.value = '';
      coverPickerInput.click();
    }
  };

  if (changeCoverBadgeBtn) {
    changeCoverBadgeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerChangeCover();
    });
  }

  if (artworkContainerBtn) {
    artworkContainerBtn.addEventListener('click', (e) => {
      if (fpDrag.suppressClick) {
        fpDrag.suppressClick = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      triggerChangeCover();
    });
  }

  // Favorite button
  favoriteBtn.addEventListener('click', () => {
    const isFav = favHeartIcon.classList.contains('fill-pink-500');
    favHeartIcon.classList.toggle('fill-pink-500', !isFav);
    favHeartIcon.classList.toggle('text-pink-500', !isFav);
    favHeartIcon.classList.toggle('fill-none', isFav);
    showToast(!isFav ? 'Đã thêm vào Yêu thích' : 'Đã bỏ Yêu thích', '❤️');
  });

  // Queue Modal
  openQueueBtn.addEventListener('click', () => {
    renderQueueList();
    queueDrawer.classList.remove('hidden');
    queueDrawer.classList.add('flex');
  });
  closeQueueBtn.addEventListener('click', () => {
    queueDrawer.classList.add('hidden');
    queueDrawer.classList.remove('flex');
  });
  queueList.addEventListener('click', (e) => {
    const queueItem = e.target.closest('.queue-item');
    if (queueItem) {
      const id = queueItem.dataset.queueId;
      playSongById(id, false);
      queueDrawer.classList.add('hidden');
      queueDrawer.classList.remove('flex');
    }
  });

  // Library Options Modal
  libraryOptionsBtn.addEventListener('click', () => {
    optionsModal.classList.remove('hidden');
    optionsModal.classList.add('flex');
  });
  closeOptionsModalBtn.addEventListener('click', () => {
    optionsModal.classList.add('hidden');
    optionsModal.classList.remove('flex');
  });
  modalClearAllBtn.addEventListener('click', async () => {
    if (confirm('Bạn có chắc muốn xóa TẤT CẢ bài hát trong thư viện? Hành động này không thể hoàn tác.')) {
      await dbClearAll();
      state.songs = [];
      state.queue = [];
      state.currentIndex = -1;
      activeDeck.pause();
      inactiveDeck.pause();
      state.isPlaying = false;
      renderTrackList();
      updateLibraryBadges();
      optionsModal.classList.add('hidden');
      optionsModal.classList.remove('flex');
      showToast('Đã xóa toàn bộ thư viện', '🧹');
    }
  });
}

// ==========================================
// 12. DEMO SEED (UI preview on phone / desktop)
// Open with ?demo=1  — or ?demo=1&reset=1 to wipe & reseed
// ==========================================
function createSilentWavBlob(durationSec = 40, sampleRate = 8000) {
  const numSamples = Math.max(1, Math.floor(durationSec * sampleRate));
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  return new Blob([buffer], { type: 'audio/wav' });
}

function createDemoCoverBlob(colorA, colorB, label) {
  const size = 320;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, colorA);
  grad.addColorStop(1, colorB);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.arc(size * 0.78, size * 0.22, size * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '700 72px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((label || '?').slice(0, 1).toUpperCase(), size / 2, size / 2 + 4);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob || null), 'image/jpeg', 0.88);
  });
}

async function seedDemoLibrary({ force = false } = {}) {
  const demoCatalog = [
    { title: 'Đêm Hà Nội', artist: 'Sơn Tùng Demo', album: 'Demo Night', colors: ['#1a3a5c', '#e85d75'], duration: 198 },
    { title: 'Ocean Drive', artist: 'Lofi Coast', album: 'Sunset EP', colors: ['#0b3d4a', '#2dd4bf'], duration: 224 },
    { title: 'Nhịp Tim Chậm', artist: 'Indie Violet', album: 'Soft Pulse', colors: ['#3b1d5c', '#c084fc'], duration: 186 },
    { title: 'City Lights', artist: 'Neon Avenue', album: 'After Hours', colors: ['#1e1b4b', '#f472b6'], duration: 211 },
    { title: 'Cà Phê Sáng', artist: 'Acoustic Bean', album: 'Morning', colors: ['#4a2c0a', '#f59e0b'], duration: 172 },
    { title: 'Rainy Window', artist: 'Chill Room', album: 'Grey Skies', colors: ['#1f2937', '#60a5fa'], duration: 240 },
    { title: 'Bước Chân Nhẹ', artist: 'Folk Lane', album: 'Home', colors: ['#14532d', '#86efac'], duration: 195 },
    { title: 'Midnight Run', artist: 'Bassline', album: 'Night Shift', colors: ['#111827', '#ef4444'], duration: 203 },
    { title: 'Gió Biển', artist: 'Wave Kids', album: 'Coastal', colors: ['#0c4a6e', '#38bdf8'], duration: 218 },
    { title: 'Starlight Loop', artist: 'MM Drive Demo', album: 'Preview Pack', colors: ['#312e81', '#a78bfa'], duration: 187 }
  ];

  if (force) {
    await dbClearAll();
    state.songs = [];
    state.queue = [];
    state.currentIndex = -1;
  }

  const alreadyHasDemo = state.songs.some(s => s.isDemo || (s.id && String(s.id).startsWith('demo_')));
  if (!force && (state.songs.length > 0 || alreadyHasDemo)) {
    return false;
  }

  const baseTs = Date.now();
  const newSongs = [];
  // Tiny silent clip only — UI duration comes from metadata (keeps IndexedDB light)
  const sharedSilent = createSilentWavBlob(8);

  for (let i = 0; i < demoCatalog.length; i++) {
    const item = demoCatalog[i];
    const coverBlob = await createDemoCoverBlob(item.colors[0], item.colors[1], item.title);
    const audioUrl = URL.createObjectURL(sharedSilent);
    const coverUrl = coverBlob ? URL.createObjectURL(coverBlob) : 'logo.png';

    newSongs.push({
      id: 'demo_' + (i + 1) + '_' + baseTs,
      title: item.title,
      artist: item.artist,
      album: item.album,
      duration: item.duration,
      audioBlob: sharedSilent,
      audioUrl,
      coverBlob,
      coverUrl,
      fileName: item.title + '.wav',
      fileSize: Math.round(item.duration * 16000),
      addedAt: baseTs + (demoCatalog.length - i) * 10,
      isDemo: true
    });
  }

  await dbAddSongsBatch(newSongs);
  state.songs = [...newSongs, ...state.songs];
  state.songs.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  return true;
}

// ==========================================
// 13. INITIALIZATION
// ==========================================
/** Keep Chrome "Cài đặt ứng dụng" / home-screen icon on the latest build automatically */
function setupPwaAutoUpdate() {
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;
  const reloadOnce = () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  };

  const wipeCachesAndReload = async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) {}
    window.location.reload();
  };

  /** Compare local bundle vs version.json on server (works even if SW is sticky) */
  const checkBuildStamp = async () => {
    try {
      const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const remote = Number(data && data.build);
      if (!remote) return;
      if (remote !== APP_BUILD) {
        console.log(`[update] remote build ${remote} ≠ local ${APP_BUILD} → refresh`);
        await wipeCachesAndReload();
      }
    } catch (e) {
      // offline — keep current shell
    }
  };

  const activateWaiting = (reg) => {
    if (reg && reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  const checkSwUpdate = () => {
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      reg.update().catch(() => {});
      activateWaiting(reg);
    });
    checkBuildStamp();
  };

  navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        console.log('Service Worker Registered! Scope:', reg.scope, 'build', APP_BUILD);
        reg.update().catch(() => {});
        activateWaiting(reg);
        reg.addEventListener('updatefound', () => {
          const neu = reg.installing;
          if (!neu) return;
          neu.addEventListener('statechange', () => {
            if (neu.state === 'installed') activateWaiting(reg);
          });
        });
      })
      .catch((err) => console.warn('Service Worker registration failed:', err));

    checkBuildStamp();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkSwUpdate();
  });
  window.addEventListener('focus', checkSwUpdate);
  window.addEventListener('pageshow', checkSwUpdate);
  // Catch updates while the installed app stays open
  setInterval(checkSwUpdate, 45000);
}

async function initApp() {
  try {
    await initDB();
    const storedSongs = await dbGetAllSongs();
    const urlParams = new URLSearchParams(window.location.search);
    const demoMode = urlParams.get('demo') === '1' || urlParams.get('demo') === 'true';
    const demoReset = urlParams.get('reset') === '1';

    // Reconstruct audio URLs and cover URLs from stored Blobs or Native device paths
    let hasUpdatedDurations = false;
    state.songs = storedSongs.map(s => {
      let audioUrl = s.audioUrl || '';
      if (s.isNative && s.nativePath && window.Capacitor && window.Capacitor.convertFileSrc) {
        audioUrl = window.Capacitor.convertFileSrc(s.nativePath);
      } else if (s.audioBlob instanceof Blob) {
        audioUrl = URL.createObjectURL(s.audioBlob);
      }

      let coverUrl = s.coverUrl || 'logo.png';
      if (s.coverBlob instanceof Blob) {
        coverUrl = URL.createObjectURL(s.coverBlob);
      } else if (typeof s.coverBlob === 'string' && s.coverBlob.length > 0) {
        coverUrl = s.coverBlob;
      }

      let duration = (typeof s.duration === 'number' && s.duration > 0) ? s.duration : 0;
      if (duration <= 0 && s.fileSize > 0) {
        duration = Math.max(15, Math.round((s.fileSize * 8) / (160 * 1000)));
        hasUpdatedDurations = true;
      }

      return {
        ...s,
        duration,
        audioUrl,
        coverUrl
      };
    });

    if (hasUpdatedDurations) {
      dbAddSongsBatch(state.songs).catch(() => {});
    }

    // Sắp xếp bài mới nạp lên trước, bài cũ sau
    state.songs.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

    // Seed demo BEFORE first paint so phone preview never flashes empty state
    if (demoMode) {
      await seedDemoLibrary({ force: demoReset || state.songs.length === 0 });
    }

    rebuildQueue(false);
    renderTrackList();
    updateLibraryBadges();
    setupEventHandlers();

    if (demoMode && state.songs.some(s => s.isDemo)) {
      showToast('Đã nạp ' + state.songs.filter(s => s.isDemo).length + ' bài demo để xem UI', '✨');
    }

    // Fix wrong durations for previously imported real tracks
    if (!demoMode && state.songs.length > 0) {
      repairDurationsInBackground(state.songs).catch(() => {});
    }

    if (state.songs.length > 0) {
      state.currentIndex = 0;
      updateUIWithSong(state.songs[0]);
    }

    // APK: auto MediaStore — full UI scan if empty, silent delta-refresh if library exists
    if (isNativeApk()) {
      setupNativeAutoRefresh();
      if (state.songs.length === 0) {
        setTimeout(() => { scanAllAudioNative(); }, 500);
      } else {
        setTimeout(() => { refreshNativeLibrarySilent(); }, 700);
      }
    }

    // Auto-update installed PWA ("Cài đặt ứng dụng") — no reinstall needed
    setupPwaAutoUpdate();

  } catch (err) {
    console.error('App init failed:', err);
  }
}

// Boot app
initApp();
