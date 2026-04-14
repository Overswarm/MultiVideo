// ================================================================
// MultiVideo — app.js
// ================================================================

// -- Layout definitions -----------------------------------------------

const LAYOUTS = [
  { id: '1x1',              name: '1\u00d71',                   slots: 1  },
  { id: '1x2',              name: '1\u00d72 (stacked)',         slots: 2  },
  { id: '2x1',              name: '2\u00d71 (side by side)',    slots: 2  },
  { id: '2x2',              name: '2\u00d72 Grid',              slots: 4  },
  { id: '3x3',              name: '3\u00d73 Grid',              slots: 9  },
  { id: '4x4',              name: '4\u00d74 Grid',              slots: 16 },
  { id: 'top1-bot2',        name: '1 Top + 2 Bottom',          slots: 3  },
  { id: 'top1-bot3',        name: '1 Top + 3 Bottom',          slots: 4  },
  { id: 'top1-bot4',        name: '1 Top + 4 Bottom',          slots: 5  },
  { id: 'center-surround',  name: 'Center + Surround',         slots: 9  },
  { id: 'theater3',         name: 'Theater (3-pane)',           slots: 3  },
  { id: 'theater4',         name: 'Theater (4-pane)',           slots: 4  },
  { id: 'pip',              name: 'Picture-in-Picture',         slots: 2  },
];

// -- Application state ------------------------------------------------

const state = {
  videos: [],
  players: new Map(),
  layoutIndex: 3,
  rotationOffset: 0,
  autoCycle: { enabled: false, intervalSec: 30, jitterSec: 10 },
  cycleTimer: null,
  sidebarOpen: true,
  isFullscreen: false,
  allMuted: true,
  allPlaying: true,
};

// -- DOM references ---------------------------------------------------

const $ = (sel) => document.querySelector(sel);
const dom = {};

function cacheDom() {
  dom.app              = $('#app');
  dom.sidebar          = $('#sidebar');
  dom.collapseBtn      = $('#collapseBtn');
  dom.toggleSidebarBtn = $('#toggleSidebarBtn');
  dom.dropZone         = $('#dropZone');
  dom.pickFilesBtn     = $('#pickFilesBtn');
  dom.urlInput         = $('#urlInput');
  dom.addUrlBtn        = $('#addUrlBtn');
  dom.videoCount       = $('#videoCount');
  dom.videoList        = $('#videoList');
  dom.clearAllBtn      = $('#clearAllBtn');
  dom.layoutSelect     = $('#layoutSelect');
  dom.prevLayoutBtn    = $('#prevLayoutBtn');
  dom.nextLayoutBtn    = $('#nextLayoutBtn');
  dom.playAllBtn       = $('#playAllBtn');
  dom.pauseAllBtn      = $('#pauseAllBtn');
  dom.muteAllBtn       = $('#muteAllBtn');
  dom.unmuteAllBtn     = $('#unmuteAllBtn');
  dom.restartAllBtn    = $('#restartAllBtn');
  dom.autoCycleToggle  = $('#autoCycleToggle');
  dom.cycleIntervalInput = $('#cycleIntervalInput');
  dom.cycleJitterInput = $('#cycleJitterInput');
  dom.cycleStatus      = $('#cycleStatus');
  dom.fullscreenBtn    = $('#fullscreenBtn');
  dom.stage            = $('#stage');
  dom.emptyState       = $('#emptyState');
  dom.topBar           = $('#topBar');
  dom.presetNameInput  = $('#presetNameInput');
  dom.savePresetBtn    = $('#savePresetBtn');
  dom.presetList       = $('#presetList');
  dom.exportPresetsBtn = $('#exportPresetsBtn');
  dom.importPresetsBtn = $('#importPresetsBtn');
  dom.importFileInput  = $('#importFileInput');
  dom.toastStack       = $('#toastStack');
}

// -- Utilities --------------------------------------------------------

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function toast(msg, type = 'info', duration = 3000) {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  dom.toastStack.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, duration);
}

const hasFSA = typeof window.showOpenFilePicker === 'function';

// -- Time parsing -----------------------------------------------------

// Parses time strings like "1h2m3s", "2m30s", "90", "5m", or plain seconds
// Returns time in seconds, or 0 if no valid time found
function parseTimeParam(value) {
  if (!value) return 0;
  // Pure number (seconds)
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  // XhYmZs format (any combination)
  let seconds = 0;
  const h = value.match(/(\d+)h/);
  const m = value.match(/(\d+)m/);
  const s = value.match(/(\d+)s/);
  if (h) seconds += parseInt(h[1], 10) * 3600;
  if (m) seconds += parseInt(m[1], 10) * 60;
  if (s) seconds += parseInt(s[1], 10);
  return seconds;
}

// Converts seconds to "XhYmZs" string for Twitch embed URLs
function secondsToHms(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  let str = '';
  if (h) str += h + 'h';
  if (m) str += m + 'm';
  str += s + 's';
  return str;
}

// -- URL parsing ------------------------------------------------------

function parseVideoUrl(urlStr) {
  let url;
  try { url = new URL(urlStr); } catch { return null; }

  // YouTube
  if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
    let videoId = null;
    if (url.hostname.includes('youtu.be')) {
      videoId = url.pathname.slice(1).split('/')[0];
    } else if (url.pathname.startsWith('/watch')) {
      videoId = url.searchParams.get('v');
    } else if (url.pathname.startsWith('/embed/')) {
      videoId = url.pathname.split('/embed/')[1]?.split(/[/?]/)[0];
    } else if (url.pathname.startsWith('/live/')) {
      videoId = url.pathname.split('/live/')[1]?.split(/[/?]/)[0];
    } else if (url.pathname.startsWith('/shorts/')) {
      videoId = url.pathname.split('/shorts/')[1]?.split(/[/?]/)[0];
    }
    if (videoId) {
      // Extract start time: ?t=90 or ?t=1m30s or &start=90
      const startTime = parseTimeParam(url.searchParams.get('t'))
                     || parseTimeParam(url.searchParams.get('start'))
                     || 0;
      const label = startTime ? ' @' + secondsToHms(startTime) : '';
      return { type: 'youtube', videoId, startTime, originalUrl: urlStr, name: 'YouTube: ' + videoId + label };
    }
  }

  // Twitch
  if (url.hostname.includes('twitch.tv')) {
    if (url.hostname === 'clips.twitch.tv') {
      const slug = url.pathname.slice(1).split('/')[0];
      if (slug) return { type: 'twitch', twitchInfo: { subtype: 'clip', value: slug }, startTime: 0, originalUrl: urlStr, name: 'Twitch clip: ' + slug };
    }
    if (url.pathname.startsWith('/videos/')) {
      const vodId = url.pathname.split('/videos/')[1]?.split(/[/?]/)[0];
      const startTime = parseTimeParam(url.searchParams.get('t')) || 0;
      const label = startTime ? ' @' + secondsToHms(startTime) : '';
      if (vodId) return { type: 'twitch', twitchInfo: { subtype: 'vod', value: vodId }, startTime, originalUrl: urlStr, name: 'Twitch VOD: ' + vodId + label };
    }
    const clipMatch = url.pathname.match(/\/[^/]+\/clip\/([^/?]+)/);
    if (clipMatch) {
      return { type: 'twitch', twitchInfo: { subtype: 'clip', value: clipMatch[1] }, startTime: 0, originalUrl: urlStr, name: 'Twitch clip: ' + clipMatch[1] };
    }
    const channel = url.pathname.slice(1).split('/')[0];
    if (channel) {
      return { type: 'twitch', twitchInfo: { subtype: 'channel', value: channel }, startTime: 0, originalUrl: urlStr, name: 'Twitch: ' + channel };
    }
  }

  // Direct video URL
  if (/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url.pathname)) {
    return { type: 'direct-url', url: urlStr, startTime: 0, originalUrl: urlStr, name: url.pathname.split('/').pop() };
  }

  return null;
}

// -- IndexedDB --------------------------------------------------------

const DB_NAME = 'multivideo';
const DB_VERSION = 1;
let _dbInstance = null;

function openDB() {
  if (_dbInstance) return Promise.resolve(_dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('presets'))     db.createObjectStore('presets',     { keyPath: 'id' });
      if (!db.objectStoreNames.contains('fileHandles')) db.createObjectStore('fileHandles', { keyPath: 'key' });
    };
    req.onsuccess = () => { _dbInstance = req.result; resolve(_dbInstance); };
    req.onerror   = () => reject(req.error);
  });
}

async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbPut(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function dbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// -- Video item management --------------------------------------------

function addVideoItem(item) {
  const videoItem = {
    id: uid(),
    type: item.type,
    name: item.name || 'Untitled',
    file: item.file || null,
    handleKey: item.handleKey || null,
    objectUrl: null,
    videoId: item.videoId || null,
    twitchInfo: item.twitchInfo || null,
    url: item.url || null,
    originalUrl: item.originalUrl || null,
    startTime: item.startTime || 0,
  };
  if (videoItem.file) {
    videoItem.objectUrl = URL.createObjectURL(videoItem.file);
  }
  state.videos.push(videoItem);
  updateUI();
  return videoItem;
}

function removeVideoItem(id) {
  const idx = state.videos.findIndex(v => v.id === id);
  if (idx < 0) return;
  const item = state.videos[idx];
  const player = state.players.get(id);
  if (player) { player.destroy(); state.players.delete(id); }
  if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
  state.videos.splice(idx, 1);
  if (state.rotationOffset >= state.videos.length && state.videos.length > 0) {
    state.rotationOffset = 0;
  }
  updateUI();
  if (state.autoCycle.enabled) startAutoCycle();
}

function moveVideoItem(id, direction) {
  const idx = state.videos.findIndex(v => v.id === id);
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= state.videos.length) return;
  [state.videos[idx], state.videos[newIdx]] = [state.videos[newIdx], state.videos[idx]];
  updateUI();
}

function clearAllVideos() {
  for (const [, player] of state.players) player.destroy();
  state.players.clear();
  for (const item of state.videos) {
    if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
  }
  state.videos = [];
  state.rotationOffset = 0;
  updateUI();
}

// -- File picking -----------------------------------------------------

async function pickFiles() {
  if (hasFSA) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [{
          description: 'Video files',
          accept: { 'video/*': ['.mp4','.webm','.ogg','.mov','.mkv','.avi','.m4v'] },
        }],
      });
      for (const handle of handles) {
        const file = await handle.getFile();
        const handleKey = uid();
        await dbPut('fileHandles', { key: handleKey, handle });
        addVideoItem({ type: 'file', file, handleKey, name: file.name });
      }
    } catch (err) {
      if (err.name !== 'AbortError') toast('File picker error: ' + err.message, 'err');
    }
  } else {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'video/*';
    input.onchange = () => {
      for (const file of input.files) {
        addVideoItem({ type: 'file', file, name: file.name });
      }
    };
    input.click();
  }
}

function handleDrop(files) {
  const videoExts = /\.(mp4|webm|ogg|mov|mkv|avi|m4v)$/i;
  const videoFiles = [...files].filter(f => f.type.startsWith('video/') || videoExts.test(f.name));
  if (videoFiles.length === 0) {
    toast('No video files found in drop', 'warn');
    return;
  }
  for (const file of videoFiles) {
    addVideoItem({ type: 'file', file, name: file.name });
  }
  toast('Added ' + videoFiles.length + ' video(s)', 'ok');
}

// -- SDK loaders ------------------------------------------------------

let _ytAPIPromise = null;
function loadYouTubeAPI() {
  if (_ytAPIPromise) return _ytAPIPromise;
  if (window.YT && window.YT.Player) return Promise.resolve();
  _ytAPIPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => reject(new Error('Failed to load YouTube API'));
    document.head.appendChild(tag);
    setTimeout(() => reject(new Error('YouTube API load timeout')), 15000);
  });
  return _ytAPIPromise;
}

let _twitchSDKPromise = null;
function loadTwitchSDK() {
  if (_twitchSDKPromise) return _twitchSDKPromise;
  if (window.Twitch && window.Twitch.Player) return Promise.resolve();
  _twitchSDKPromise = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = 'https://player.twitch.tv/js/embed/v1.js';
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error('Failed to load Twitch SDK'));
    document.head.appendChild(tag);
    setTimeout(() => reject(new Error('Twitch SDK load timeout')), 15000);
  });
  return _twitchSDKPromise;
}

// -- Player creation --------------------------------------------------

function getOrCreatePlayer(videoItem) {
  if (state.players.has(videoItem.id)) return state.players.get(videoItem.id);

  let player;

  switch (videoItem.type) {
    case 'file':
    case 'direct-url': {
      const video = document.createElement('video');
      video.src = videoItem.objectUrl || videoItem.url || videoItem.originalUrl;
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      const fileStartTime = videoItem.startTime || 0;
      if (fileStartTime > 0) {
        video.addEventListener('loadedmetadata', () => { video.currentTime = fileStartTime; }, { once: true });
      }
      player = {
        play()    { video.play().catch(() => {}); },
        pause()   { video.pause(); },
        mute()    { video.muted = true; },
        unmute()  { video.muted = false; },
        restart() { video.currentTime = fileStartTime; video.play().catch(() => {}); },
        destroy() { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); },
        element: video,
        type: 'local',
      };
      break;
    }

    case 'youtube': {
      // Use the official YouTube IFrame Player API for reliable control
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'width:100%;height:100%;background:#000;';
      const target = document.createElement('div');
      const divId = 'yt-' + uid();
      target.id = divId;
      wrapper.appendChild(target);

      const vid = videoItem.videoId;
      const ytStart = videoItem.startTime || 0;
      let ytPlayer = null;
      let ready = false;
      let initialSeekDone = false;
      let pendingCmds = [];

      const whenReady = (fn) => {
        if (ready && ytPlayer) fn(ytPlayer);
        else pendingCmds.push(fn);
      };

      const styleIframe = () => {
        const iframe = wrapper.querySelector('iframe');
        if (iframe) {
          iframe.style.width = '100%';
          iframe.style.height = '100%';
          iframe.style.border = '0';
        }
      };

      const tryInit = () => {
        loadYouTubeAPI().then(() => {
          // YT.Player needs the target in the DOM; retry if not yet attached
          if (!document.getElementById(divId)) {
            setTimeout(tryInit, 250);
            return;
          }
          ytPlayer = new YT.Player(divId, {
            videoId: vid,
            width: '100%',
            height: '100%',
            playerVars: {
              autoplay: 1,
              mute: 1,
              start: ytStart,
              enablejsapi: 1,
              playsinline: 1,
              rel: 0,
              modestbranding: 1,
            },
            events: {
              onReady: () => {
                ready = true;
                styleIframe();
                // Try seeking immediately
                if (ytStart > 0) {
                  ytPlayer.seekTo(ytStart, true);
                  ytPlayer.playVideo();
                }
                for (const fn of pendingCmds) fn(ytPlayer);
                pendingCmds = [];
              },
              onStateChange: (event) => {
                // YT.PlayerState.PLAYING = 1
                // Seek again on first play — more reliable than onReady
                // because the video stream is actually loaded
                if (!initialSeekDone && event.data === 1 && ytStart > 0) {
                  initialSeekDone = true;
                  ytPlayer.seekTo(ytStart, true);
                }
              },
            },
          });
        }).catch(err => {
          toast('YouTube API: ' + err.message, 'err');
        });
      };
      tryInit();

      player = {
        play()    { whenReady(p => p.playVideo()); },
        pause()   { whenReady(p => p.pauseVideo()); },
        mute()    { whenReady(p => p.mute()); },
        unmute()  { whenReady(p => p.unMute()); },
        restart() {
          whenReady(p => {
            initialSeekDone = true; // don't double-seek after restart
            p.seekTo(ytStart, true);
            p.playVideo();
          });
        },
        destroy() {
          pendingCmds = [];
          if (ytPlayer && ytPlayer.destroy) try { ytPlayer.destroy(); } catch {}
          wrapper.remove();
        },
        element: wrapper,
        type: 'youtube',
      };
      break;
    }

    case 'twitch': {
      const info = videoItem.twitchInfo;
      const host = location.hostname || 'localhost';
      const twitchStart = videoItem.startTime || 0;

      // Twitch clips don't work with the Player SDK — use iframe fallback
      if (info.subtype === 'clip') {
        const iframe = document.createElement('iframe');
        const clipSrc = 'https://clips.twitch.tv/embed?clip=' + info.value + '&parent=' + host + '&autoplay=true&muted=true';
        iframe.src = clipSrc;
        iframe.allow = 'autoplay; encrypted-media; fullscreen';
        iframe.setAttribute('allowfullscreen', '');
        iframe.setAttribute('frameborder', '0');

        player = {
          play()    {},
          pause()   {},
          mute()    {},
          unmute()  {},
          restart() { iframe.src = ''; iframe.src = clipSrc; },
          destroy() { iframe.src = ''; iframe.remove(); },
          element: iframe,
          type: 'twitch',
        };
      } else {
        // Channels and VODs use the Twitch Player SDK for full control.
        // Because the SDK can share state between players of the same
        // video, restart destroys and recreates the player to ensure
        // each instance independently starts at its own time offset.
        const container = document.createElement('div');
        container.style.cssText = 'width:100%;height:100%;background:#000;';

        let twitchPlayer = null;
        let ready = false;
        let pendingCmds = [];

        const whenReady = (fn) => {
          if (ready && twitchPlayer) fn(twitchPlayer);
          else pendingCmds.push(fn);
        };

        const buildOpts = () => {
          const opts = {
            width: '100%',
            height: '100%',
            parent: [host],
            autoplay: true,
            muted: true,
          };
          if (info.subtype === 'channel') {
            opts.channel = info.value;
          } else if (info.subtype === 'vod') {
            opts.video = info.value;
            if (twitchStart > 0) opts.time = secondsToHms(twitchStart);
          }
          return opts;
        };

        const styleIframe = () => {
          const iframe = container.querySelector('iframe');
          if (iframe) {
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = '0';
          }
        };

        const initPlayer = () => {
          ready = false;
          twitchPlayer = null;
          pendingCmds = [];
          container.innerHTML = '';
          const innerDiv = document.createElement('div');
          innerDiv.id = 'tw-' + uid();
          container.appendChild(innerDiv);

          loadTwitchSDK().then(() => {
            if (!container.isConnected) {
              // Container not in DOM yet, retry
              setTimeout(initPlayer, 250);
              return;
            }
            twitchPlayer = new Twitch.Player(innerDiv.id, buildOpts());
            twitchPlayer.addEventListener(Twitch.Player.READY, () => {
              ready = true;
              styleIframe();
              for (const fn of pendingCmds) fn(twitchPlayer);
              pendingCmds = [];
            });
          }).catch(err => {
            toast('Twitch SDK: ' + err.message, 'err');
          });
        };
        initPlayer();

        player = {
          play()    { whenReady(p => p.play()); },
          pause()   { whenReady(p => p.pause()); },
          mute()    { whenReady(p => p.setMuted(true)); },
          unmute()  { whenReady(p => p.setMuted(false)); },
          restart() {
            // Destroy and recreate — avoids shared-state issues
            // when multiple players load the same video
            initPlayer();
          },
          destroy() {
            pendingCmds = [];
            container.innerHTML = '';
            container.remove();
          },
          element: container,
          type: 'twitch',
        };
      }
      break;
    }

    default:
      return null;
  }

  state.players.set(videoItem.id, player);
  return player;
}

// -- Hidden container for off-screen players --------------------------

let _hiddenContainer = null;

function getHiddenContainer() {
  if (!_hiddenContainer) {
    _hiddenContainer = document.createElement('div');
    _hiddenContainer.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0;';
    document.body.appendChild(_hiddenContainer);
  }
  return _hiddenContainer;
}

// -- Rendering --------------------------------------------------------

function updateUI() {
  renderVideoList();
  renderStage();
  dom.videoCount.textContent = state.videos.length;
  dom.app.classList.toggle('has-videos', state.videos.length > 0);
}

function renderVideoList() {
  dom.videoList.innerHTML = '';
  state.videos.forEach((item, idx) => {
    const li = document.createElement('li');

    const typeSpan = document.createElement('span');
    typeSpan.className = 'vi-type ' + (item.type === 'direct-url' ? 'file' : item.type);
    typeSpan.textContent = item.type === 'direct-url' ? 'URL' : item.type;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'vi-name';
    nameSpan.textContent = item.name;
    nameSpan.title = item.name;

    const actions = document.createElement('span');
    actions.className = 'vi-actions';

    if (idx > 0) {
      const upBtn = document.createElement('button');
      upBtn.className = 'icon-btn';
      upBtn.title = 'Move up';
      upBtn.textContent = '\u25B2';
      upBtn.onclick = () => moveVideoItem(item.id, -1);
      actions.appendChild(upBtn);
    }
    if (idx < state.videos.length - 1) {
      const downBtn = document.createElement('button');
      downBtn.className = 'icon-btn';
      downBtn.title = 'Move down';
      downBtn.textContent = '\u25BC';
      downBtn.onclick = () => moveVideoItem(item.id, 1);
      actions.appendChild(downBtn);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'icon-btn';
    removeBtn.title = 'Remove';
    removeBtn.textContent = '\u2715';
    removeBtn.onclick = () => removeVideoItem(item.id);
    actions.appendChild(removeBtn);

    li.appendChild(typeSpan);
    li.appendChild(nameSpan);
    li.appendChild(actions);
    dom.videoList.appendChild(li);
  });
}

function renderStage() {
  const layout = LAYOUTS[state.layoutIndex];
  dom.stage.setAttribute('data-layout', layout.id);

  const n = state.videos.length;
  if (n === 0) {
    for (const [, player] of state.players) {
      getHiddenContainer().appendChild(player.element);
    }
    dom.stage.innerHTML = '';
    return;
  }

  const slotCount = Math.min(layout.slots, n);

  // Determine which videos are visible in current rotation
  const visibleItems = [];
  for (let i = 0; i < slotCount; i++) {
    const videoIdx = (state.rotationOffset + i) % n;
    visibleItems.push(state.videos[videoIdx]);
  }

  // Move ALL players to hidden container so clearing the stage won't destroy them
  for (const [, player] of state.players) {
    if (player.element.parentNode && player.element.parentNode !== getHiddenContainer()) {
      getHiddenContainer().appendChild(player.element);
    }
  }

  // Clear stage of overlay / slot divs
  dom.stage.innerHTML = '';

  // Build slots
  for (const item of visibleItems) {
    const slot = document.createElement('div');
    slot.className = 'vid-slot';

    const player = getOrCreatePlayer(item);
    if (!player) continue;

    slot.appendChild(player.element);

    // Hover overlay
    const overlay = document.createElement('div');
    overlay.className = 'slot-overlay';

    const header = document.createElement('div');
    header.className = 'slot-header';
    const title = document.createElement('span');
    title.className = 'slot-title';
    title.textContent = item.name;
    header.appendChild(title);

    const footer = document.createElement('div');
    footer.className = 'slot-footer';

    // Solo audio button
    const soloBtn = document.createElement('button');
    soloBtn.textContent = '\uD83D\uDD09 Solo audio';
    soloBtn.onclick = () => {
      for (const [otherId, otherPlayer] of state.players) {
        if (otherId === item.id) otherPlayer.unmute();
        else otherPlayer.mute();
      }
      state.allMuted = false;
      toast('Audio: ' + item.name, 'ok');
    };
    footer.appendChild(soloBtn);

    // Per-video play/pause
    const ppBtn = document.createElement('button');
    ppBtn.textContent = '\u23EF';
    ppBtn.title = 'Play / Pause';
    ppBtn.onclick = () => {
      const el = player.element;
      if (el.paused !== undefined) {
        el.paused ? player.play() : player.pause();
      }
    };
    footer.appendChild(ppBtn);

    overlay.appendChild(header);
    overlay.appendChild(footer);
    slot.appendChild(overlay);

    dom.stage.appendChild(slot);
  }
}

// -- Global controls --------------------------------------------------

function playAll() {
  for (const [, p] of state.players) p.play();
  state.allPlaying = true;
}

function pauseAll() {
  for (const [, p] of state.players) p.pause();
  state.allPlaying = false;
}

function muteAll() {
  for (const [, p] of state.players) p.mute();
  state.allMuted = true;
}

function unmuteAll() {
  for (const [, p] of state.players) p.unmute();
  state.allMuted = false;
}

function restartAll() {
  for (const [, p] of state.players) p.restart();
  state.allPlaying = true;
}

// -- Layout switching -------------------------------------------------

function setLayout(index) {
  state.layoutIndex = ((index % LAYOUTS.length) + LAYOUTS.length) % LAYOUTS.length;
  dom.layoutSelect.value = state.layoutIndex;
  state.rotationOffset = 0;
  renderStage();
  if (state.autoCycle.enabled) startAutoCycle();
}

function nextLayout() { setLayout(state.layoutIndex + 1); }
function prevLayout() { setLayout(state.layoutIndex - 1); }

// -- Auto-cycle -------------------------------------------------------

function startAutoCycle() {
  stopAutoCycle();
  if (!state.autoCycle.enabled) return;

  const layout = LAYOUTS[state.layoutIndex];
  if (state.videos.length <= layout.slots) {
    dom.cycleStatus.textContent = '(all visible)';
    return;
  }

  scheduleCycleTick();
  dom.cycleStatus.textContent = 'cycling\u2026';
}

function stopAutoCycle() {
  if (state.cycleTimer) { clearTimeout(state.cycleTimer); state.cycleTimer = null; }
  dom.cycleStatus.textContent = '';
}

function scheduleCycleTick() {
  const base   = state.autoCycle.intervalSec;
  const jitter = state.autoCycle.jitterSec;
  const delay  = Math.max(1000, (base + (Math.random() * 2 - 1) * jitter) * 1000);

  state.cycleTimer = setTimeout(() => {
    advanceCycle();
    scheduleCycleTick();
  }, delay);
}

function advanceCycle() {
  if (state.videos.length === 0) return;
  state.rotationOffset = (state.rotationOffset + 1) % state.videos.length;
  renderStage();
}

// -- Fullscreen -------------------------------------------------------

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().then(() => {
      state.isFullscreen = true;
      dom.app.classList.add('fullscreen-mode');
    }).catch(err => toast('Fullscreen error: ' + err.message, 'err'));
  } else {
    document.exitFullscreen();
  }
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    state.isFullscreen = false;
    dom.app.classList.remove('fullscreen-mode');
  }
});

// -- Presets ----------------------------------------------------------

async function savePreset(name) {
  if (!name.trim()) { toast('Enter a preset name', 'warn'); return; }

  const preset = {
    id: uid(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
    layoutIndex: state.layoutIndex,
    autoCycle: { ...state.autoCycle },
    items: state.videos.map(v => {
      const base = { type: v.type, name: v.name, startTime: v.startTime || 0 };
      if (v.type === 'file')       { base.handleKey = v.handleKey; base.fileName = v.name; }
      if (v.type === 'youtube')    { base.videoId = v.videoId; base.originalUrl = v.originalUrl; }
      if (v.type === 'twitch')     { base.twitchInfo = v.twitchInfo; base.originalUrl = v.originalUrl; }
      if (v.type === 'direct-url') { base.url = v.url || v.originalUrl; base.originalUrl = v.originalUrl; }
      return base;
    }),
  };

  await dbPut('presets', preset);
  toast('Saved preset: ' + name, 'ok');
  dom.presetNameInput.value = '';
  renderPresetList();
}

async function loadPreset(id) {
  const preset = await dbGet('presets', id);
  if (!preset) { toast('Preset not found', 'err'); return; }

  clearAllVideos();

  // Restore layout
  state.layoutIndex = preset.layoutIndex ?? 3;
  dom.layoutSelect.value = state.layoutIndex;

  // Restore auto-cycle settings
  if (preset.autoCycle) {
    state.autoCycle = { ...preset.autoCycle };
    dom.autoCycleToggle.checked   = state.autoCycle.enabled;
    dom.cycleIntervalInput.value  = state.autoCycle.intervalSec;
    dom.cycleJitterInput.value    = state.autoCycle.jitterSec;
  }

  // Restore video items
  let filesMissing = 0;
  for (const item of preset.items) {
    if (item.type === 'file') {
      // Attempt to restore from File System Access handle
      if (item.handleKey && hasFSA) {
        const record = await dbGet('fileHandles', item.handleKey);
        if (record?.handle) {
          try {
            let perm = await record.handle.queryPermission({ mode: 'read' });
            if (perm === 'prompt') perm = await record.handle.requestPermission({ mode: 'read' });
            if (perm === 'granted') {
              const file = await record.handle.getFile();
              addVideoItem({ type: 'file', file, handleKey: item.handleKey, name: file.name, startTime: item.startTime || 0 });
              continue;
            }
          } catch {}
        }
      }
      filesMissing++;
    } else if (item.type === 'youtube') {
      addVideoItem({ type: 'youtube', videoId: item.videoId, startTime: item.startTime || 0, originalUrl: item.originalUrl, name: item.name });
    } else if (item.type === 'twitch') {
      addVideoItem({ type: 'twitch', twitchInfo: item.twitchInfo, startTime: item.startTime || 0, originalUrl: item.originalUrl, name: item.name });
    } else if (item.type === 'direct-url') {
      addVideoItem({ type: 'direct-url', url: item.url, startTime: item.startTime || 0, originalUrl: item.originalUrl, name: item.name });
    }
  }

  if (filesMissing > 0) {
    toast(filesMissing + ' local file(s) need re-adding (permission expired)', 'warn', 5000);
  }

  // Apply layout after items are loaded
  renderStage();
  if (state.autoCycle.enabled) startAutoCycle();
  toast('Loaded preset: ' + preset.name, 'ok');
}

async function deletePreset(id) {
  await dbDelete('presets', id);
  toast('Preset deleted', 'ok');
  renderPresetList();
}

async function exportAllPresets() {
  const presets = await dbGetAll('presets');
  if (presets.length === 0) { toast('No presets to export', 'warn'); return; }

  const exportData = presets.map(p => ({
    ...p,
    items: p.items.map(i => { const c = { ...i }; delete c.handleKey; return c; }),
  }));

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'multivideo-presets.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Exported ' + presets.length + ' preset(s)', 'ok');
}

async function importPresets(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('Expected a JSON array');
    let count = 0;
    for (const preset of data) {
      if (preset.name && preset.items) {
        preset.id = uid();
        await dbPut('presets', preset);
        count++;
      }
    }
    toast('Imported ' + count + ' preset(s)', 'ok');
    renderPresetList();
  } catch (err) {
    toast('Import failed: ' + err.message, 'err');
  }
}

async function renderPresetList() {
  const presets = await dbGetAll('presets');
  dom.presetList.innerHTML = '';

  if (presets.length === 0) {
    const li = document.createElement('li');
    li.style.color = 'var(--text-faint)';
    li.style.justifyContent = 'center';
    li.textContent = 'No saved presets';
    dom.presetList.appendChild(li);
    return;
  }

  presets.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  for (const preset of presets) {
    const li = document.createElement('li');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'pr-name';
    nameSpan.textContent = preset.name;
    nameSpan.title = preset.items.length + ' video(s) \u2014 ' + (LAYOUTS[preset.layoutIndex]?.name || '?') + ' layout';

    const metaSpan = document.createElement('span');
    metaSpan.className = 'pr-meta';
    metaSpan.textContent = preset.items.length + 'v';

    const actions = document.createElement('span');
    actions.className = 'pr-actions';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'icon-btn';
    loadBtn.title = 'Load preset';
    loadBtn.textContent = '\u25B6';
    loadBtn.onclick = () => loadPreset(preset.id);

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.title = 'Delete preset';
    delBtn.textContent = '\u2715';
    delBtn.onclick = () => deletePreset(preset.id);

    actions.appendChild(loadBtn);
    actions.appendChild(delBtn);
    li.appendChild(nameSpan);
    li.appendChild(metaSpan);
    li.appendChild(actions);
    dom.presetList.appendChild(li);
  }
}

// -- Sidebar toggle ---------------------------------------------------

function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  dom.app.classList.toggle('sidebar-collapsed', !state.sidebarOpen);
  dom.app.classList.toggle('sidebar-open', state.sidebarOpen);
}

// -- Add URL ----------------------------------------------------------

function addUrl() {
  const urlStr = dom.urlInput.value.trim();
  if (!urlStr) return;
  const parsed = parseVideoUrl(urlStr);
  if (!parsed) {
    toast('Unsupported URL. Supported: YouTube, Twitch, or direct video links (.mp4, .webm, etc.)', 'warn', 4000);
    return;
  }
  addVideoItem(parsed);
  dom.urlInput.value = '';
  toast('Added: ' + parsed.name, 'ok');
}

// -- Keyboard shortcuts -----------------------------------------------

function handleKeydown(e) {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  switch (e.key.toLowerCase()) {
    case ' ':
      e.preventDefault();
      state.allPlaying ? pauseAll() : playAll();
      break;
    case 'm':
      e.preventDefault();
      state.allMuted ? unmuteAll() : muteAll();
      break;
    case 'l':
      e.preventDefault();
      nextLayout();
      break;
    case 'f':
      e.preventDefault();
      toggleFullscreen();
      break;
    case 'c':
      e.preventDefault();
      toggleSidebar();
      break;
    case 'escape':
      if (state.isFullscreen) document.exitFullscreen();
      break;
  }
}

// -- Initialisation ---------------------------------------------------

function init() {
  cacheDom();

  // Populate layout dropdown
  LAYOUTS.forEach((layout, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = layout.name + ' (' + layout.slots + ' slot' + (layout.slots > 1 ? 's' : '') + ')';
    dom.layoutSelect.appendChild(opt);
  });
  dom.layoutSelect.value = state.layoutIndex;

  // -- Wire up events -------------------------------------------------

  dom.collapseBtn.addEventListener('click', toggleSidebar);
  dom.toggleSidebarBtn.addEventListener('click', toggleSidebar);
  dom.pickFilesBtn.addEventListener('click', pickFiles);
  dom.addUrlBtn.addEventListener('click', addUrl);
  dom.urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') addUrl(); });
  dom.clearAllBtn.addEventListener('click', clearAllVideos);

  dom.layoutSelect.addEventListener('change', () => setLayout(+dom.layoutSelect.value));
  dom.prevLayoutBtn.addEventListener('click', prevLayout);
  dom.nextLayoutBtn.addEventListener('click', nextLayout);

  dom.playAllBtn.addEventListener('click', playAll);
  dom.pauseAllBtn.addEventListener('click', pauseAll);
  dom.muteAllBtn.addEventListener('click', muteAll);
  dom.unmuteAllBtn.addEventListener('click', unmuteAll);
  dom.restartAllBtn.addEventListener('click', restartAll);

  dom.autoCycleToggle.addEventListener('change', () => {
    state.autoCycle.enabled = dom.autoCycleToggle.checked;
    if (state.autoCycle.enabled) startAutoCycle(); else stopAutoCycle();
  });
  dom.cycleIntervalInput.addEventListener('change', () => {
    state.autoCycle.intervalSec = Math.max(5, +dom.cycleIntervalInput.value || 30);
    dom.cycleIntervalInput.value = state.autoCycle.intervalSec;
    if (state.autoCycle.enabled) startAutoCycle();
  });
  dom.cycleJitterInput.addEventListener('change', () => {
    state.autoCycle.jitterSec = Math.max(0, +dom.cycleJitterInput.value || 10);
    dom.cycleJitterInput.value = state.autoCycle.jitterSec;
    if (state.autoCycle.enabled) startAutoCycle();
  });

  dom.fullscreenBtn.addEventListener('click', toggleFullscreen);

  dom.savePresetBtn.addEventListener('click', () => savePreset(dom.presetNameInput.value));
  dom.presetNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') savePreset(dom.presetNameInput.value);
  });
  dom.exportPresetsBtn.addEventListener('click', exportAllPresets);
  dom.importPresetsBtn.addEventListener('click', () => dom.importFileInput.click());
  dom.importFileInput.addEventListener('change', () => {
    if (dom.importFileInput.files[0]) importPresets(dom.importFileInput.files[0]);
    dom.importFileInput.value = '';
  });

  // -- Drag & drop ----------------------------------------------------

  dom.dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dom.dropZone.classList.add('drag-active');
  });
  dom.dropZone.addEventListener('dragleave', () => dom.dropZone.classList.remove('drag-active'));
  dom.dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dom.dropZone.classList.remove('drag-active');
    if (e.dataTransfer?.files?.length) handleDrop(e.dataTransfer.files);
  });

  // Also accept drops anywhere on the page
  document.body.addEventListener('dragover', e => e.preventDefault());
  document.body.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) handleDrop(e.dataTransfer.files);
  });

  // -- Keyboard -------------------------------------------------------

  document.addEventListener('keydown', handleKeydown);

  // -- Initial render -------------------------------------------------

  renderPresetList();
  updateUI();

  if (!hasFSA) {
    toast('Tip: serve via localhost for persistent file presets', 'warn', 5000);
  }
}

init();
