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
  crossfadeEnabled: true,
  crossfadeDuration: 3.0, // 3 seconds
  masterVolume: 1.0,
  isCrossfading: false,
  fadeInterval: null,
  isDraggingSeek: false,
  searchQuery: '',
  linkedFolderHandle: null
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
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const importBtn = document.getElementById('importBtn');
const syncFolderBtn = document.getElementById('syncFolderBtn');
const syncFolderIcon = document.getElementById('syncFolderIcon');
const syncBtnText = document.getElementById('syncBtnText');
const linkedFolderBanner = document.getElementById('linkedFolderBanner');
const linkedFolderName = document.getElementById('linkedFolderName');
const rescanFolderBtn = document.getElementById('rescanFolderBtn');
const emptyStateImportBtn = document.getElementById('emptyStateImportBtn');
const emptyStateFolderBtn = document.getElementById('emptyStateFolderBtn');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const quickShuffleAllBtn = document.getElementById('quickShuffleAllBtn');
const modalSyncFolderBtn = document.getElementById('modalSyncFolderBtn');

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
const crossfadeToggleBtn = document.getElementById('crossfadeToggleBtn');
const crossfadeDot = document.getElementById('crossfadeDot');
const crossfadeText = document.getElementById('crossfadeText');
const iosEngineBadge = document.getElementById('iosEngineBadge');

// Queue & Options Modal Elements
const openQueueBtn = document.getElementById('openQueueBtn');
const queueDrawer = document.getElementById('queueDrawer');
const closeQueueBtn = document.getElementById('closeQueueBtn');
const queueList = document.getElementById('queueList');
const queueSubtitle = document.getElementById('queueSubtitle');
const libraryOptionsBtn = document.getElementById('libraryOptionsBtn');
const optionsModal = document.getElementById('optionsModal');
const closeOptionsModalBtn = document.getElementById('closeOptionsModalBtn');
const modalAddSongsBtn = document.getElementById('modalAddSongsBtn');
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
async function playSongById(id, withCrossfade = false) {
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

  if (withCrossfade && state.crossfadeEnabled && !isBackgrounded && state.isPlaying) {
    performCrossfadeTransition(song);
  } else {
    directPlaybackTransition(song);
  }
}

/**
 * Direct playback transition (used when launching, or when backgrounded on iOS)
 */
async function directPlaybackTransition(song) {
  clearInterval(state.fadeInterval);
  state.isCrossfading = false;

  // Reset decks
  activeDeck.pause();
  inactiveDeck.pause();

  activeDeck.src = song.audioUrl;
  activeDeck.volume = state.masterVolume;
  activeDeck.currentTime = 0;

  try {
    await activeDeck.play();
    state.isPlaying = true;
    updateUIWithSong(song);
    updateMediaSession(song);
  } catch (err) {
    console.warn('Direct play error (requires user touch interaction):', err);
  }
}

/**
 * 3-second Crossfade Transition between Deck A and Deck B
 * Satisfies the technical requirement for smooth fading when foregrounded
 */
function performCrossfadeTransition(nextSong) {
  if (state.isCrossfading) return;
  state.isCrossfading = true;

  const currentDeck = activeDeck;
  const targetDeck = inactiveDeck;

  targetDeck.src = nextSong.audioUrl;
  targetDeck.currentTime = 0;
  targetDeck.volume = 0;

  targetDeck.play().then(() => {
    const steps = 30; // 30 intervals
    const intervalTime = (state.crossfadeDuration * 1000) / steps; // 100ms per step
    let stepCount = 0;

    clearInterval(state.fadeInterval);
    state.fadeInterval = setInterval(() => {
      stepCount++;
      const progress = stepCount / steps;

      currentDeck.volume = Math.max(0, state.masterVolume * (1 - progress));
      targetDeck.volume = Math.min(state.masterVolume, state.masterVolume * progress);

      if (stepCount >= steps) {
        clearInterval(state.fadeInterval);
        currentDeck.pause();
        currentDeck.currentTime = 0;
        targetDeck.volume = state.masterVolume;

        // Swap active and inactive decks
        activeDeck = targetDeck;
        inactiveDeck = currentDeck;
        state.isCrossfading = false;

        updateUIWithSong(nextSong);
        updateMediaSession(nextSong);
      }
    }, intervalTime);
  }).catch((err) => {
    console.warn('Crossfade target deck play error, fallback to direct:', err);
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
  if (state.crossfadeEnabled && !isBackgrounded && state.isPlaying) {
    performCrossfadeTransition(nextSong);
  } else {
    directPlaybackTransition(nextSong);
  }
}

function handlePrev() {
  // If song played for more than 3 seconds, restart it
  if (activeDeck.currentTime > 3) {
    activeDeck.currentTime = 0;
    return;
  }

  const prevSong = getPrevSong();
  if (!prevSong) return;

  state.currentIndex = (state.currentIndex - 1 + state.queue.length) % state.queue.length;

  const isBackgrounded = document.hidden === true;
  if (state.crossfadeEnabled && !isBackgrounded && state.isPlaying) {
    performCrossfadeTransition(prevSong);
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

    // Smooth Crossfade check: 3 seconds before end
    // CRITICAL: only when NOT backgrounded (screen on). When backgrounded, wait for 'ended' event.
    if (state.crossfadeEnabled && !state.isCrossfading && dur > 5) {
      const timeLeft = dur - cur;
      if (timeLeft <= state.crossfadeDuration && timeLeft > 0.3) {
        if (!document.hidden) {
          const nextSong = getNextSong();
          if (nextSong) {
            state.currentIndex = (state.currentIndex + 1) % state.queue.length;
            performCrossfadeTransition(nextSong);
          }
        }
      }
    }

    // Sync lockscreen position
    syncMediaSessionPositionState();
  });

  // Track ended event (Seamless direct handoff for iOS background mode)
  deck.addEventListener('ended', () => {
    if (deck !== activeDeck) return;
    if (state.isCrossfading) return;

    if (state.repeatMode === 'one') {
      deck.currentTime = 0;
      deck.play();
    } else {
      handleNext(false);
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
    iosEngineBadge.innerHTML = '<span>⚡ Crossfade 3s (Màn hình mở)</span>';
    iosEngineBadge.className = 'flex items-center gap-1 font-mono text-[10px] text-white/50';

    // Auto-rescan linked folder when returning to app (e.g. after downloading from Zalo)
    autoScanLinkedFolder();
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
const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wma', '.alac'];

function isAudioFile(filename) {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.some(ext => lower.endsWith(ext));
}

async function handleAudioFiles(files, isAutoScan = false) {
  if (!files || files.length === 0) return;

  const validFiles = Array.from(files).filter(f => isAudioFile(f.name));
  if (validFiles.length === 0) {
    if (!isAutoScan) showToast('Không tìm thấy file nhạc tương thích trong thư mục', '⚠️');
    return;
  }

  // Deduplication check: compare fileName and approximate fileSize
  const newFiles = validFiles.filter(file => {
    return !state.songs.some(s => s.fileName === file.name && Math.abs(s.fileSize - file.size) < 100);
  });

  if (newFiles.length === 0) {
    if (!isAutoScan) showToast('Thư viện đã đồng bộ, không có bài hát mới', '✅');
    return;
  }

  showToast(isAutoScan ? `Tự động phát hiện ${newFiles.length} bài mới...` : `Đang nạp ${newFiles.length} bài hát mới...`, '⏳');
  let addedCount = 0;

  for (let i = 0; i < newFiles.length; i++) {
    const file = newFiles[i];
    try {
      const songData = await parseAudioFile(file);
      await dbAddSong(songData);
      state.songs.push(songData);
      addedCount++;
    } catch (err) {
      console.error('Error importing file:', file.name, err);
    }
  }

  if (addedCount > 0) {
    rebuildQueue(true);
    renderTrackList();
    updateLibraryBadges();
    showToast(`🎉 Đã tự động cập nhật ${addedCount} bài hát mới từ Zalo/Thư mục!`, '🎵');

    // If nothing is playing, set first song as ready
    if (state.currentIndex === -1 && state.songs.length > 0) {
      state.currentIndex = 0;
      updateUIWithSong(state.songs[0]);
    }
  }
}

// Recursively scan all audio files from a Directory Handle
async function getFilesFromDirectoryHandle(dirHandle) {
  const files = [];
  try {
    for await (const entry of dirHandle.values()) {
      try {
        if (entry.kind === 'file') {
          if (isAudioFile(entry.name)) {
            const file = await entry.getFile();
            files.push(file);
          }
        } else if (entry.kind === 'directory') {
          const subFiles = await getFilesFromDirectoryHandle(entry);
          files.push(...subFiles);
        }
      } catch (e) {
        console.warn('Error reading entry:', entry.name, e);
      }
    }
  } catch (err) {
    console.warn('Directory reading failed:', err);
  }
  return files;
}

// User-triggered Folder Picker (supports modern File System Access API & fallback)
async function pickAndSyncFolder() {
  if (syncFolderIcon) syncFolderIcon.classList.add('animate-spin');
  if (syncBtnText) syncBtnText.textContent = 'Đang quét...';

  if ('showDirectoryPicker' in window) {
    try {
      const dirHandle = await window.showDirectoryPicker({
        id: 'mm_drive_music_folder',
        mode: 'read'
      });

      state.linkedFolderHandle = dirHandle;
      await dbSaveSetting('linked_folder_handle', dirHandle);
      await dbSaveSetting('linked_folder_name', dirHandle.name);

      updateLinkedFolderUI(dirHandle.name, false);

      const files = await getFilesFromDirectoryHandle(dirHandle);
      await handleAudioFiles(files, false);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('showDirectoryPicker error, fallback to folderInput:', err);
        if (folderInput) folderInput.click();
      }
    } finally {
      if (syncFolderIcon) syncFolderIcon.classList.remove('animate-spin');
      if (syncBtnText) syncBtnText.textContent = 'Quét thư mục';
    }
  } else {
    // Safari / iOS fallback using webkitdirectory folder picker
    if (syncFolderIcon) syncFolderIcon.classList.remove('animate-spin');
    if (syncBtnText) syncBtnText.textContent = 'Quét thư mục';
    if (folderInput) folderInput.click();
  }
}

// Auto-scan linked folder on app startup or return from background
async function autoScanLinkedFolder() {
  try {
    const handle = state.linkedFolderHandle || await dbGetSetting('linked_folder_handle');
    if (!handle) return;

    state.linkedFolderHandle = handle;
    const perm = await handle.queryPermission({ mode: 'read' });

    if (perm === 'granted') {
      updateLinkedFolderUI(handle.name, false);
      const files = await getFilesFromDirectoryHandle(handle);
      await handleAudioFiles(files, true);
    } else {
      updateLinkedFolderUI(handle.name, true);
    }
  } catch (err) {
    console.warn('Auto-scan linked folder error:', err);
  }
}

function updateLinkedFolderUI(folderName, needsPermission = false) {
  if (!linkedFolderBanner || !linkedFolderName) return;

  linkedFolderBanner.classList.remove('hidden');
  linkedFolderBanner.classList.add('flex');

  if (needsPermission) {
    linkedFolderName.textContent = `📁 Thư mục: ${folderName} (Bấm "Đồng bộ ngay" để quét bài mới)`;
  } else {
    linkedFolderName.textContent = `📁 Đã liên kết: ${folderName} (Tự động cập nhật bài mới)`;
  }
}

function parseAudioFile(file) {
  return new Promise((resolve) => {
    const songId = 'mm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const audioUrl = URL.createObjectURL(file);

    // Fallback info from filename
    let defaultTitle = file.name.replace(/\.[^/.]+$/, "");
    let defaultArtist = "Unknown Artist";
    if (defaultTitle.includes(" - ")) {
      const parts = defaultTitle.split(" - ");
      defaultArtist = parts[0].trim();
      defaultTitle = parts.slice(1).join(" - ").trim();
    }

    let isResolved = false;
    const safeResolve = (data) => {
      if (isResolved) return;
      isResolved = true;
      resolve(data);
    };

    // Timeout fallback after 3s to guarantee import never stalls
    const timeoutHandle = setTimeout(() => {
      safeResolve({
        id: songId,
        title: defaultTitle,
        artist: defaultArtist,
        album: "Music MIC Driver",
        duration: 0,
        audioBlob: file,
        audioUrl,
        coverBlob: null,
        coverUrl: 'logo.png',
        fileName: file.name,
        fileSize: file.size,
        addedAt: Date.now()
      });
    }, 3500);

    const tempAudio = new Audio(audioUrl);

    const extractTags = (duration) => {
      if (window.jsmediatags) {
        window.jsmediatags.read(file, {
          onSuccess: (tag) => {
            clearTimeout(timeoutHandle);
            const tags = tag.tags || {};
            const title = tags.title || defaultTitle;
            const artist = tags.artist || defaultArtist;
            const album = tags.album || "Music MIC Driver";
            let coverBlob = null;
            let coverUrl = 'logo.png';

            if (tags.picture) {
              try {
                const byteArray = new Uint8Array(tags.picture.data);
                coverBlob = new Blob([byteArray], { type: tags.picture.format || 'image/jpeg' });
                coverUrl = URL.createObjectURL(coverBlob);
              } catch (e) {
                console.warn('Cover blob conversion failed, fallback to logo:', e);
                coverBlob = null;
                coverUrl = 'logo.png';
              }
            }

            safeResolve({
              id: songId,
              title,
              artist,
              album,
              duration,
              audioBlob: file,
              audioUrl,
              coverBlob,
              coverUrl,
              fileName: file.name,
              fileSize: file.size,
              addedAt: Date.now()
            });
          },
          onError: () => {
            clearTimeout(timeoutHandle);
            safeResolve({
              id: songId,
              title: defaultTitle,
              artist: defaultArtist,
              album: "Music MIC Driver",
              duration,
              audioBlob: file,
              audioUrl,
              coverBlob: null,
              coverUrl: 'logo.png',
              fileName: file.name,
              fileSize: file.size,
              addedAt: Date.now()
            });
          }
        });
      } else {
        clearTimeout(timeoutHandle);
        safeResolve({
          id: songId,
          title: defaultTitle,
          artist: defaultArtist,
          album: "Music MIC Driver",
          duration,
          audioBlob: file,
          audioUrl,
          coverBlob: null,
          coverUrl: 'logo.png',
          fileName: file.name,
          fileSize: file.size,
          addedAt: Date.now()
        });
      }
    };

    tempAudio.addEventListener('loadedmetadata', () => {
      extractTags(tempAudio.duration || 0);
    }, { once: true });

    tempAudio.addEventListener('error', () => {
      extractTags(0);
    }, { once: true });
  });
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

  // Active track soundwaves in list
  const activeWaves = document.querySelectorAll('.active-soundwave');
  activeWaves.forEach(el => el.classList.toggle('hidden', !isPlaying));
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
      emptyStateImportBtn.classList.add('hidden');
    } else {
      emptyStateEl.querySelector('h3').textContent = 'Thư viện trống';
      emptyStateEl.querySelector('p').innerHTML = 'Chọn file nhạc từ điện thoại hoặc máy tính (<span class="text-pink-400 font-mono">.mp3, .wav, .flac, .m4a</span>). Nhạc sẽ được lưu trực tiếp vào bộ nhớ máy và phát hoàn toàn <span class="text-emerald-400 font-semibold">Offline</span>.';
      emptyStateImportBtn.classList.remove('hidden');
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

// Swipe down on full player header to close
swipeHandle.addEventListener('touchstart', (e) => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });

swipeHandle.addEventListener('touchend', (e) => {
  const touchEndY = e.changedTouches[0].clientY;
  if (touchEndY - touchStartY > 40) {
    closeFullPlayer();
  }
}, { passive: true });

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

// ==========================================
// 11. EVENT HANDLERS & BINDINGS
// ==========================================
function setupEventHandlers() {
  // Folder Auto-Sync Pickers
  if (syncFolderBtn) syncFolderBtn.addEventListener('click', () => pickAndSyncFolder());
  if (rescanFolderBtn) rescanFolderBtn.addEventListener('click', () => pickAndSyncFolder());
  if (emptyStateFolderBtn) emptyStateFolderBtn.addEventListener('click', () => pickAndSyncFolder());
  if (modalSyncFolderBtn) {
    modalSyncFolderBtn.addEventListener('click', () => {
      optionsModal.classList.add('hidden');
      optionsModal.classList.remove('flex');
      pickAndSyncFolder();
    });
  }

  // Folder Input Fallback (for Safari & folder selection)
  if (folderInput) {
    folderInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleAudioFiles(e.target.files, false);
        folderInput.value = '';
      }
    });
  }

  // File Import (individual files)
  importBtn.addEventListener('click', () => fileInput.click());
  emptyStateImportBtn.addEventListener('click', () => fileInput.click());
  modalAddSongsBtn.addEventListener('click', () => {
    optionsModal.classList.add('hidden');
    optionsModal.classList.remove('flex');
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    handleAudioFiles(e.target.files, false);
    fileInput.value = '';
  });

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

  // Crossfade Toggle Pill
  crossfadeToggleBtn.addEventListener('click', () => {
    state.crossfadeEnabled = !state.crossfadeEnabled;
    crossfadeDot.classList.toggle('bg-emerald-400', state.crossfadeEnabled);
    crossfadeDot.classList.toggle('bg-gray-500', !state.crossfadeEnabled);
    crossfadeText.textContent = state.crossfadeEnabled ? 'Crossfade: 3s' : 'Crossfade: Tắt';
    showToast(state.crossfadeEnabled ? 'Crossfade: Bật (3 giây)' : 'Crossfade: Tắt', '🎛️');
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

    // Reconstruct audio URLs and cover URLs from stored Blobs
    state.songs = storedSongs.map(s => {
      let audioUrl = '';
      if (s.audioBlob instanceof Blob) {
        audioUrl = URL.createObjectURL(s.audioBlob);
      }
      let coverUrl = 'logo.png';
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

    rebuildQueue(false);
    renderTrackList();
    updateLibraryBadges();
    setupEventHandlers();

    // Check & auto-scan linked music folder on startup
    autoScanLinkedFolder();

    if (state.songs.length > 0) {
      state.currentIndex = 0;
      updateUIWithSong(state.songs[0]);
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
