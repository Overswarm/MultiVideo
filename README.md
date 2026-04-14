# MultiVideo

A browser-based multi-video player that displays multiple videos simultaneously with customizable layouts.

## Quick Start

For the best experience, serve the folder over localhost:

```bash
# Python 3
cd MultiVideo
python -m http.server 8080

# Then open http://localhost:8080 in Chrome
```

> **Why localhost?** Chrome's File System Access API (used to persist local files in presets across sessions) only works over HTTP(S), not `file://` URLs. Twitch embeds also require a proper hostname.

If you just want to try it quickly, you can open `index.html` directly in Chrome — everything works except cross-session file persistence in presets.

## Features

- **Multiple simultaneous videos** — local files (drag & drop or file picker) and URLs (YouTube, Twitch, direct video links)
- **13 layout presets** — 1×1 through 4×4 grids, theater modes, picture-in-picture, 1-top + N-bottom, center + surround
- **Auto-cycle** — when more videos are loaded than the layout has slots, automatically rotates through them on a configurable interval with ±N second jitter
- **Global controls** — Play all, Pause all, Mute all, Unmute all, Restart all
- **Per-video controls** — hover overlay with Solo Audio and Play/Pause
- **Fullscreen mode** — hides all UI so videos fill the entire screen with no borders
- **Presets** — save/load your video lists and layout settings; export/import as JSON for backup or sharing
- **Dark theme** — easy on the eyes

## Keyboard Shortcuts

| Key     | Action                       |
|---------|------------------------------|
| Space   | Toggle Play / Pause all      |
| M       | Toggle Mute / Unmute all     |
| L       | Next layout                  |
| F       | Toggle fullscreen            |
| C       | Toggle sidebar               |
| Escape  | Exit fullscreen              |

## Supported URL Formats

| Service  | URL patterns                                                                 |
|----------|------------------------------------------------------------------------------|
| YouTube  | `youtube.com/watch?v=ID`, `youtu.be/ID`, `/live/ID`, `/shorts/ID`, `/embed/ID` |
| Twitch   | `twitch.tv/CHANNEL`, `twitch.tv/videos/ID`, `clips.twitch.tv/SLUG`          |
| Direct   | Any URL ending in `.mp4`, `.webm`, `.ogg`, `.mov`, `.m4v`                    |

## Notes

- **Local files** are the primary focus. YouTube and Twitch embeds work but have limited control (YouTube supports play/pause/mute via postMessage; Twitch control is more limited due to iframe restrictions).
- **Duplicate videos** are allowed — you can add the same video multiple times.
- **Presets with local files** persist across sessions when served over localhost (Chrome re-asks for file permission once per session). When opened via `file://`, presets save URL-based videos but local files will need to be re-added.
- **Auto-cycle jitter**: setting interval to 90s with ±10s jitter means each swap happens after a random delay between 80–100 seconds.

## Browser Support

Designed for and tested in **Google Chrome**. Other Chromium browsers (Edge, Brave) should also work. Firefox and Safari have partial support (no File System Access API, so no persistent file presets).
