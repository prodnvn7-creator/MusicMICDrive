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

const state = {
  db: null,
  songs: [],           // All song records from IndexedDB
  queue: [],           // Array of song IDs in playback order
  currentIndex: -1,    // Pointer to current song in queue
  isPlaying: false,
  isShuffle: false,
  repeatMode: 'all',   // 'off' | 'all' | 'one'
  mixMode: 'mashup',   // 'mashup' (5s DJ EP blend) | 'crossfade' (3s) | 'direct'
  masterVolume: 1.0,
  isCrossfading: false,
  fadeInterval: null,
  isDraggingSeek: false,
  searchQuery: ''
};

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
const emptyStateScanFolderBtn = document.getElementById('emptyStateScanFolderBtn');
const emptyStatePickFileBtn = document.getElementById('emptyStatePickFileBtn');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const quickShuffleAllBtn = document.getElementById('quickShuffleAllBtn');
const modalScanAudioBtn = document.getElementById('modalScanAudioBtn');
const modalScanFolderBtn = document.getElementById('modalScanFolderBtn');
const modalPickFileBtn = document.getElementById('modalPickFileBtn');
const modalChangeCoverBtn = document.getElementById('modalChangeCoverBtn');

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
// 4. SMART SHUFFLE (FISHER-YATES ALGORITHM)
// ==========================================
function fisherYatesShuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
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
    if (preserveCurrent && currentSongId) {
      // Keep current song at the head, shuffle the rest
      const remaining = allIds.filter(id => id !== currentSongId);
      state.queue = [currentSongId, ...fisherYatesShuffle(remaining)];
      state.currentIndex = 0;
    } else {
      state.queue = fisherYatesShuffle(allIds);
      state.currentIndex = currentSongId ? state.queue.indexOf(currentSongId) : 0;
    }
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
  showToast(state.isShuffle ? 'Smart Shuffle: Bật (Fisher-Yates)' : 'Smart Shuffle: Tắt', '🔀');
}

function toggleRepeat() {
  if (state.repeatMode === 'off') {
    state.repeatMode = 'all';
    repeatDot.classList.remove('hidden');
    repeatOneBadge.classList.add('hidden');
    repeatBtn.classList.add('text-pink-500');
    repeatBtn.classList.remove('text-white/60');
    showToast('Lặp lại: Tất cả danh sách', '🔁');
  } else if (state.repeatMode === 'all') {
    state.repeatMode = 'one';
    repeatDot.classList.add('hidden');
    repeatOneBadge.classList.remove('hidden');
    repeatBtn.classList.add('text-pink-500');
    repeatBtn.classList.remove('text-white/60');
    showToast('Lặp lại: 1 bài hát', '🔂');
  } else {
    state.repeatMode = 'off';
    repeatDot.classList.add('hidden');
    repeatOneBadge.classList.add('hidden');
    repeatBtn.classList.remove('text-pink-500');
    repeatBtn.classList.add('text-white/60');
    showToast('Lặp lại: Tắt', '⏹️');
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
    performMashupTransition(song, 5.0);
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
function performMashupTransition(nextSong, duration = 5.0) {
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

  targetDeck.src = nextSong.audioUrl;
  targetDeck.currentTime = 0;
  targetDeck.volume = 0;

  // Immediately update UI, artwork, backdrop blur, lockscreen
  updateUIWithSong(nextSong);
  updateMediaSession(nextSong);
  renderTrackList();

  targetDeck.play().then(() => {
    // Immediately swap activeDeck to targetDeck so scrubber and lockscreen track new song from 0:00!
    activeDeck = targetDeck;
    inactiveDeck = currentDeck;

    const intervalTime = 30; // 30ms interval for silky continuous curve
    const steps = Math.max(25, Math.round((duration * 1000) / intervalTime));
    let stepCount = 0;

    if (state.fadeInterval) clearInterval(state.fadeInterval);
    state.fadeInterval = setInterval(() => {
      stepCount++;
      const progress = Math.min(1, stepCount / steps);

      // Equal-power sinusoidal curve (cos & sin):
      // cos^2(angle) + sin^2(angle) = 1.0 (Total acoustic energy remains 100% constant)
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
  const nextSong = getNextSong();
  if (!nextSong) {
    activeDeck.pause();
    state.isPlaying = false;
    updatePlayPauseUI();
    return;
  }

  state.currentIndex = (state.currentIndex + 1) % state.queue.length;

  const isBackgrounded = document.hidden === true;
  if (!isBackgrounded && state.isPlaying) {
    // 5.0s continuous DJ blend
    performMashupTransition(nextSong, 5.0);
  } else {
    directPlaybackTransition(nextSong);
  }
}

function handlePrev() {
  if (activeDeck.currentTime > 3) {
    activeDeck.currentTime = 0;
    return;
  }

  const prevSong = getPrevSong();
  if (!prevSong) return;

  state.currentIndex = (state.currentIndex - 1 + state.queue.length) % state.queue.length;

  const isBackgrounded = document.hidden === true;
  if (!isBackgrounded && state.isPlaying) {
    performMashupTransition(prevSong, 4.0);
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

    // Intelligent 5-second DJ Mashup blend before track ends
    // Outro melts into intro seamlessly like a non-stop continuous EP
    if (!state.isCrossfading && state.isPlaying && dur > 8) {
      const timeLeft = dur - cur;
      if (timeLeft <= 5.0 && timeLeft > 0.4) {
        if (!document.hidden) {
          const nextSong = getNextSong();
          if (nextSong) {
            state.currentIndex = (state.currentIndex + 1) % state.queue.length;
            const blendLead = Math.min(5.0, Math.max(1.8, timeLeft));
            performMashupTransition(nextSong, blendLead);
          }
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
    if (deck === activeDeck && deck.duration) {
      const currentSong = getCurrentSong();
      if (currentSong && (!currentSong.duration || Math.abs(currentSong.duration - deck.duration) > 1)) {
        currentSong.duration = deck.duration;
        dbAddSong(currentSong);
        renderTrackList();
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

// Page Visibility API handler (iOS Screen Locked vs Screen On)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Screen is OFF or backgrounded on iOS
    iosEngineBadge.innerHTML = '<span>🔒 Direct Gapless (iOS An toàn)</span>';
    iosEngineBadge.className = 'flex items-center gap-1 font-mono text-[10px] text-emerald-400';
  } else {
    // Screen is ON
    iosEngineBadge.innerHTML = '<span>⚡ Mashup 5s DJ Blend</span>';
    iosEngineBadge.className = 'flex items-center gap-1 font-mono text-[10px] text-white/50';
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

function showScanProgress(total) {
  if (!scanProgressOverlay) return;
  scanProgressBar.style.width = '0%';
  scanProgressCount.textContent = `0 / ${total}`;
  scanProgressPct.textContent = '0%';
  scanProgressTitle.textContent = 'Đang quét nhạc...';
  scanProgressSub.textContent = `Tìm thấy ${total} file âm thanh`;
  scanProgressFile.textContent = 'Đang xử lý...';
  scanProgressOverlay.classList.remove('hidden');
  scanProgressOverlay.classList.add('flex');
}

function updateScanProgress(done, total, currentFileName) {
  if (!scanProgressOverlay) return;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  scanProgressBar.style.width = `${pct}%`;
  scanProgressCount.textContent = `${done} / ${total}`;
  scanProgressPct.textContent = `${pct}%`;
  if (currentFileName) scanProgressFile.textContent = currentFileName;
}

function hideScanProgress(addedCount, total) {
  if (!scanProgressOverlay) return;
  scanProgressBar.style.width = '100%';
  scanProgressCount.textContent = `${addedCount} / ${total}`;
  scanProgressPct.textContent = '100%';
  scanProgressTitle.textContent = 'Hoàn tất!';
  scanProgressSub.textContent = `Đã thêm ${addedCount} bài vào thư viện`;
  scanProgressFile.textContent = '';
  setTimeout(() => {
    scanProgressOverlay.classList.add('hidden');
    scanProgressOverlay.classList.remove('flex');
  }, 1400);
}

// Deep recursive directory reader (showDirectoryPicker API)
async function scanDirectoryRecursively(dirHandle) {
  const files = [];
  async function traverse(handle) {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        try {
          const file = await entry.getFile();
          if (isAudioFile(file)) files.push(file);
        } catch (e) { /* skip locked files */ }
      } else if (entry.kind === 'directory') {
        try { await traverse(entry); } catch (e) { /* skip inaccessible dirs */ }
      }
    }
  }
  await traverse(dirHandle);
  return files;
}

/**
 * FAST ULTRA-RELIABLE audio import engine.
 * Phase 1: Instantly add all files using filename metadata (appears in <2s for 371 songs).
 * Phase 2: Background ID3 enrichment (cover art, proper title/artist) without blocking UI.
 */
async function handleAudioFiles(files) {
  if (!files || files.length === 0) return;

  // ── Step 1: Audio detection with 3-layer fallback ──────────
  let validFiles = Array.from(files).filter(f => isAudioFile(f));

  // Layer 2: Check extension only (for Android files with wrong MIME)
  if (validFiles.length === 0) {
    validFiles = Array.from(files).filter(f => {
      const name = (f.name || '').toLowerCase();
      return SUPPORTED_AUDIO_EXTENSIONS.some(ext => name.endsWith(ext));
    });
  }

  // Layer 3: Exclude obvious non-audio (images, docs) — catch-all for Zalo/WhatsApp audio
  if (validFiles.length === 0) {
    const SKIP = ['.jpg','.jpeg','.png','.gif','.webp','.bmp','.pdf','.txt','.doc','.docx','.xls','.xlsx','.zip','.apk','.exe','.xml','.json'];
    validFiles = Array.from(files).filter(f => {
      const n = (f.name || '').toLowerCase();
      return n.length > 0 && !SKIP.some(ext => n.endsWith(ext));
    });
  }

  if (validFiles.length === 0) {
    showToast('Không tìm thấy file nhạc nào trong các file đã chọn', '⚠️');
    return;
  }

  // ── Step 2: Deduplication ───────────────────────────────────
  const newFiles = validFiles.filter(file =>
    !state.songs.some(s => s.fileName === file.name && Math.abs(s.fileSize - file.size) < 512)
  );

  if (newFiles.length === 0) {
    showToast(`✅ Tất cả ${validFiles.length} bài đã có trong thư viện!`, '✅');
    return;
  }

  // Self-dedup within the selection
  const seen = new Set();
  const uniqueFiles = newFiles.filter(f => {
    const key = `${f.name}__${f.size}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const total = uniqueFiles.length;
  showScanProgress(total);

  if (scanMusicBtnText) scanMusicBtnText.textContent = 'Đang quét...';
  if (scanMusicIcon) scanMusicIcon.classList.add('animate-spin');

  const baseTs = Date.now();
  const newSongs = [];
  let addedCount = 0;

  // ── Phase 1: Instant filename-based import ──────────────────
  const RENDER_EVERY = 25; // update list UI every 25 songs
  for (let i = 0; i < uniqueFiles.length; i++) {
    const file = uniqueFiles[i];
    const songId = 'mm_' + baseTs + '_' + i + '_' + Math.random().toString(36).substring(2, 6);
    const audioUrl = URL.createObjectURL(file);

    let title = file.name.replace(/\.[^/.]+$/, '');
    let artist = 'Music MIC Driver';
    if (title.includes(' - ')) {
      const parts = title.split(' - ');
      artist = parts[0].trim();
      title  = parts.slice(1).join(' - ').trim();
    }

    const songData = {
      id: songId,
      title,
      artist,
      album: 'Music MIC Driver',
      duration: 0,
      audioBlob: file,
      audioUrl,
      coverBlob: null,
      coverUrl: 'logo.png',
      fileName: file.name,
      fileSize: file.size,
      addedAt: baseTs + (total - i) * 10,
      _needsEnrich: true
    };

    try { await dbAddSong(songData); } catch (e) { /* ignore */ }
    newSongs.push(songData);
    addedCount++;

    // Update progress UI
    updateScanProgress(addedCount, total, title);

    // Render incrementally to let user see songs loading in
    if (addedCount % RENDER_EVERY === 0 || addedCount === total) {
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
      // Yield to browser to paint the update
      await new Promise(r => setTimeout(r, 0));
    }
  }

  hideScanProgress(addedCount, total);
  if (scanMusicBtnText) scanMusicBtnText.textContent = 'Quét nhạc';
  if (scanMusicIcon) scanMusicIcon.classList.remove('animate-spin');

  showToast(`🎉 Đã nạp ${addedCount} bài! Tổng thư viện: ${state.songs.length} bài`, '🎵');

  // ── Phase 2: Background ID3 enrichment ─────────────────────
  enrichSongsWithID3(newSongs);
}

/**
 * Silently enrich songs with ID3 tags (cover art, proper title) after fast import.
 * Runs in background in small batches to avoid crashing mobile browsers.
 */
async function enrichSongsWithID3(songs) {
  if (!window.jsmediatags) return;
  const BATCH = 3;
  for (let i = 0; i < songs.length; i += BATCH) {
    await Promise.all(songs.slice(i, i + BATCH).map(song => new Promise(resolve => {
      if (!song._needsEnrich || !song.audioBlob) return resolve();
      const tid = setTimeout(resolve, 2500);
      try {
        window.jsmediatags.read(song.audioBlob, {
          onSuccess: async (tag) => {
            clearTimeout(tid);
            const tags = tag.tags || {};
            let changed = false;
            if (tags.title && tags.title.trim()) { song.title = tags.title.trim(); changed = true; }
            if (tags.artist && tags.artist.trim()) { song.artist = tags.artist.trim(); changed = true; }
            if (tags.album && tags.album.trim()) { song.album = tags.album.trim(); }
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
              song._needsEnrich = false;
              try { await dbAddSong(song); } catch (e) {}
              // Live patch DOM
              const item = document.querySelector(`.track-item[data-id="${song.id}"]`);
              if (item) {
                const img = item.querySelector('img');
                if (img && song.coverUrl !== 'logo.png') img.src = song.coverUrl;
                const h4 = item.querySelector('h4');
                if (h4) h4.textContent = song.title;
              }
              const cur = getCurrentSong();
              if (cur && cur.id === song.id) updateUIWithSong(song);
            }
            resolve();
          },
          onError: () => { clearTimeout(tid); resolve(); }
        });
      } catch (e) { clearTimeout(tid); resolve(); }
    })));
    await new Promise(r => setTimeout(r, 120)); // breathe between batches
  }
}

// ==========================================
// 9. UI RENDERING & APPLE MUSIC STYLING
// ==========================================
function updateUIWithSong(song) {
  if (!song) return;

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
            <img src="${song.coverUrl || 'logo.png'}" alt="Cover" class="w-full h-full object-cover">
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
          <span class="text-xs text-white/40 font-mono">${formatTime(song.duration)}</span>
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
    ? `Smart Shuffle (Fisher-Yates) • Còn ${upcomingQueue.length} bài tiếp theo`
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
          <span class="text-xs text-white/40 font-mono">${formatTime(s.duration)}</span>
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

// Swipe down anywhere on Full Player to dismiss (Interactive Pull-Down)
let fpTouchStartY = 0;
let fpTouchStartX = 0;
let fpIsDragging = false;
let fpMoved = false;

fullPlayer.addEventListener('touchstart', (e) => {
  // Ignore touches on seekbar, volume slider, buttons, or photo picker badge
  if (e.target.closest('input[type="range"]') || 
      e.target.closest('#bigPlayBtn') || 
      e.target.closest('#nextBtn') || 
      e.target.closest('#prevBtn') || 
      e.target.closest('#shuffleBtn') || 
      e.target.closest('#repeatBtn') || 
      e.target.closest('#favoriteBtn') || 
      e.target.closest('#openQueueBtn') ||
      e.target.closest('#changeCoverBadgeBtn')) {
    fpIsDragging = false;
    return;
  }
  fpIsDragging = true;
  fpMoved = false;
  fpTouchStartY = e.touches[0].clientY;
  fpTouchStartX = e.touches[0].clientX;
}, { passive: true });

fullPlayer.addEventListener('touchmove', (e) => {
  if (!fpIsDragging) return;
  const currentY = e.touches[0].clientY;
  const currentX = e.touches[0].clientX;
  const deltaY = currentY - fpTouchStartY;
  const deltaX = Math.abs(currentX - fpTouchStartX);

  // If dragging downward and vertical movement dominates
  if (deltaY > 8 && deltaY > deltaX) {
    fpMoved = true;
    if (e.cancelable) e.preventDefault();
    fullPlayer.style.transition = 'none';
    fullPlayer.style.transform = `translateY(${deltaY}px)`;
  }
}, { passive: false });

fullPlayer.addEventListener('touchend', (e) => {
  if (!fpIsDragging) return;
  fpIsDragging = false;
  const touchEndY = e.changedTouches[0].clientY;
  const touchEndX = e.changedTouches[0].clientX;
  const deltaY = touchEndY - fpTouchStartY;
  const deltaX = Math.abs(touchEndX - fpTouchStartX);

  if (fpMoved && deltaY > 60 && deltaY > deltaX) {
    // Silky smooth slide out to dismiss
    fullPlayer.style.transition = 'transform 0.28s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.25s ease';
    fullPlayer.style.transform = 'translateY(105%)';
    setTimeout(() => {
      closeFullPlayer();
      fullPlayer.style.transform = '';
      fullPlayer.style.transition = '';
    }, 280);
  } else if (fpMoved) {
    // Snap back smoothly up to 0%
    fullPlayer.style.transition = 'transform 0.24s cubic-bezier(0.25, 1, 0.5, 1)';
    fullPlayer.style.transform = 'translateY(0%)';
    setTimeout(() => {
      fullPlayer.style.transform = '';
      fullPlayer.style.transition = '';
    }, 240);
  }
}, { passive: true });

if (fullPlayerHeader) {
  fullPlayerHeader.addEventListener('click', (e) => {
    if (!e.target.closest('button') && !fpMoved) {
      closeFullPlayer();
    }
  });
}

function openFullPlayer() {
  fullPlayer.classList.remove('hidden-player');
  fullPlayer.classList.add('visible-player');
}

function closeFullPlayer() {
  fullPlayer.classList.remove('visible-player');
  fullPlayer.classList.add('hidden-player');
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

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Native Android MediaStore Audio Scanner (Automatic Zero-Prompt 371+ Song Detection)
async function scanAllAudioNative() {
  if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.MediaStoreScanner) {
    if (scanAudioInput) scanAudioInput.click();
    return;
  }

  showToast('⚡ Đang tự động quét toàn bộ bài hát trong máy...', '⏳');
  showScanProgress(100);
  if (scanMusicBtnText) scanMusicBtnText.textContent = 'Đang quét...';
  if (scanMusicIcon) scanMusicIcon.classList.add('animate-spin');

  try {
    const res = await window.Capacitor.Plugins.MediaStoreScanner.scanAllAudio();
    if (res && res.songs && res.songs.length > 0) {
      await handleNativeSongs(res.songs);
    } else {
      hideScanProgress(0, 0);
      showToast('Không tìm thấy bài hát nào trên thiết bị', '⚠️');
    }
  } catch (err) {
    console.warn('Native MediaStore scan error:', err);
    hideScanProgress(0, 0);
    showToast('Chưa cấp quyền bộ nhớ: ' + (err.message || err), '⚠️');
    if (scanAudioInput) scanAudioInput.click();
  } finally {
    if (scanMusicBtnText) scanMusicBtnText.textContent = 'Quét nhạc';
    if (scanMusicIcon) scanMusicIcon.classList.remove('animate-spin');
  }
}

async function handleNativeSongs(nativeList) {
  const total = nativeList.length;
  showScanProgress(total);

  let addedCount = 0;
  const newSongs = [];
  const baseTs = Date.now();

  for (let i = 0; i < nativeList.length; i++) {
    const item = nativeList[i];
    const exists = state.songs.some(s => s.fileName === item.fileName && Math.abs((s.fileSize || 0) - (item.size || 0)) < 512);
    if (!exists) {
      let audioUrl = item.contentUri;
      if (window.Capacitor && window.Capacitor.convertFileSrc && item.path) {
        audioUrl = window.Capacitor.convertFileSrc(item.path);
      }

      const songData = {
        id: item.id || ('mm_nat_' + baseTs + '_' + i),
        title: item.title,
        artist: item.artist,
        album: item.album,
        duration: item.duration || 0,
        audioBlob: null,
        audioUrl: audioUrl,
        nativePath: item.path,
        nativeUri: item.contentUri,
        coverBlob: null,
        coverUrl: item.albumArtUri || 'logo.png',
        fileName: item.fileName,
        fileSize: item.size,
        addedAt: item.addedAt || (baseTs + (total - i) * 10),
        isNative: true
      };

      try { await dbAddSong(songData); } catch (e) {}
      newSongs.push(songData);
      addedCount++;
    }

    updateScanProgress(i + 1, total, item.title);
  }

  if (addedCount > 0) {
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
  }

  hideScanProgress(addedCount, total);
  showToast(`🎉 Tự động quét sạch ${addedCount} bài hát trong máy! Tổng: ${state.songs.length} bài`, '🎵');
}

// ==========================================
// 11. EVENT HANDLERS & BINDINGS
// ==========================================
function setupEventHandlers() {
  // Comprehensive Audio Scanner (Auto MediaStore on APK, File Picker on PWA)
  function triggerAudioScan() {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      scanAllAudioNative();
    } else if (scanAudioInput) {
      scanAudioInput.click();
    }
  }

  // Recursive Folder Scanner (Scans all subfolders for 371+ songs)
  async function triggerFolderScan() {
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        showToast('⚡ Đang quét đệ quy thư mục tìm toàn bộ bài hát...', '⏳');
        const files = await scanDirectoryRecursively(dirHandle);
        if (files.length > 0) {
          handleAudioFiles(files);
        } else {
          showToast('Không tìm thấy file âm thanh nào trong thư mục này', '⚠️');
        }
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('showDirectoryPicker fallback to input:', err);
      }
    }
    if (scanFolderInput) scanFolderInput.click();
  }

  // Free Folder / File Picker (Browse any folder freely)
  function triggerFreeFilePicker() {
    if (freeFileInput) freeFileInput.click();
  }

  if (scanMusicBtn) scanMusicBtn.addEventListener('click', () => triggerAudioScan());
  if (emptyStateScanBtn) emptyStateScanBtn.addEventListener('click', () => triggerAudioScan());
  if (emptyStateScanFolderBtn) emptyStateScanFolderBtn.addEventListener('click', () => triggerFolderScan());

  if (modalScanAudioBtn) {
    modalScanAudioBtn.addEventListener('click', () => {
      optionsModal.classList.add('hidden');
      optionsModal.classList.remove('flex');
      triggerAudioScan();
    });
  }

  if (modalScanFolderBtn) {
    modalScanFolderBtn.addEventListener('click', () => {
      optionsModal.classList.add('hidden');
      optionsModal.classList.remove('flex');
      triggerFolderScan();
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
        handleAudioFiles(e.target.files);
        scanFolderInput.value = '';
      }
    });
  }

  if (freeFileInput) {
    freeFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
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
    rebuildQueue(false);
    playSongById(state.queue[0], false);
    openFullPlayer();
    showToast('Đã xáo trộn và phát thư viện!', '🔀');
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
      if (!fpMoved) {
        triggerChangeCover();
      }
    });
  }

  if (modalChangeCoverBtn) {
    modalChangeCoverBtn.addEventListener('click', () => {
      optionsModal.classList.add('hidden');
      optionsModal.classList.remove('flex');
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
// 12. INITIALIZATION
// ==========================================
async function initApp() {
  try {
    await initDB();
    const storedSongs = await dbGetAllSongs();

    // Reconstruct audio URLs and cover URLs from stored Blobs or Native device paths
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

      return {
        ...s,
        audioUrl,
        coverUrl
      };
    });

    // Sắp xếp bài mới nạp lên trước, bài cũ sau
    state.songs.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

    rebuildQueue(false);
    renderTrackList();
    updateLibraryBadges();
    setupEventHandlers();

    if (state.songs.length > 0) {
      state.currentIndex = 0;
      updateUIWithSong(state.songs[0]);
    } else if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      // First run inside APK: Auto-scan all device audio automatically!
      setTimeout(() => {
        scanAllAudioNative();
      }, 600);
    }

    // Register Service Worker for 100% Offline Capability & Auto-update
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => {
            console.log('Service Worker Registered! Scope:', reg.scope);
            reg.update();
          })
          .catch((err) => console.warn('Service Worker registration failed:', err));

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!refreshing) {
            refreshing = true;
            window.location.reload();
          }
        });
      });
    }

  } catch (err) {
    console.error('App init failed:', err);
  }
}

// Boot app
initApp();
