# Bundle yt-dlp and ffmpeg with the CLI

This CLI will orchestrate media extraction in Node.js while bundling `yt-dlp` for upstream media retrieval and `ffmpeg` for WAV conversion. We chose this because YouTube extraction reliability depends on mature site-specific tooling, while bundling both binaries avoids forcing users to install external system dependencies before the CLI can work.
