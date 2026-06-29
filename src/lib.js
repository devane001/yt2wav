const { spawn } = require('node:child_process');
const { constants } = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const ffmpegStaticPath = require('ffmpeg-static');

const OUTPUT_DIR_ENV = 'YTDL_WAV_OUTPUT_DIR';
const DEFAULT_WAV_EXTENSION = '.wav';
const DEFAULT_SAMPLE_RATE = '44100';
const DEFAULT_CHANNELS = '2';
const DEFAULT_SAMPLE_FORMAT = 's16';
const DOWNLOAD_PROGRESS_PREFIX = '__PROGRESS__:';
const RUNTIME_BINARY_CACHE_DIR = path.join(os.tmpdir(), 'youtube-download-bin');

function getBundledYtDlpPath() {
  const packageEntry = require.resolve('@choewy/yt-dlp');
  const packageRoot = path.resolve(path.dirname(packageEntry), '..');
  const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  return path.join(packageRoot, 'bin', binaryName);
}

function getBundledFfmpegPath() {
  return ffmpegStaticPath;
}

function expandHomeDir(input, homeDir = os.homedir()) {
  if (!input) {
    return input;
  }

  if (input === '~') {
    return homeDir;
  }

  if (input.startsWith('~/')) {
    return path.join(homeDir, input.slice(2));
  }

  return input;
}

function resolveOutputDirectory(env = process.env, homeDir = os.homedir()) {
  const configured = env[OUTPUT_DIR_ENV]?.trim();
  const rawPath = configured || path.join(homeDir, 'Downloads');
  return path.resolve(expandHomeDir(rawPath, homeDir));
}

function sanitizeFileStem(input) {
  const normalized = String(input ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-. ]+|[-. ]+$/g, '');

  if (!normalized) {
    return 'audio';
  }

  return normalized.slice(0, 180);
}

function toWavFileName(input) {
  const raw = path.basename(String(input ?? '').trim());
  const parsed = path.parse(raw);
  const stemSource = parsed.name || raw || 'audio';
  return `${sanitizeFileStem(stemSource)}${DEFAULT_WAV_EXTENSION}`;
}

function buildDefaultFileName(metadata) {
  return toWavFileName(`${metadata.title}-${metadata.id}`);
}

function resolveOutputFileName(metadata, explicitOutputName) {
  if (explicitOutputName) {
    return toWavFileName(explicitOutputName);
  }

  return buildDefaultFileName(metadata);
}

function resolveDestinationPath(metadata, explicitOutputName, env = process.env, homeDir = os.homedir()) {
  const outputDir = resolveOutputDirectory(env, homeDir);
  const fileName = resolveOutputFileName(metadata, explicitOutputName);
  return path.join(outputDir, fileName);
}

function normalizeSourceVideoInput(input) {
  let normalized = String(input ?? '').trim();

  while (
    normalized.length >= 2 &&
    ((normalized.startsWith('`') && normalized.endsWith('`')) ||
      (normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'")))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  normalized = normalized.replace(/\\([?=&#])/g, '$1');

  return normalized;
}

function validateSourceVideoUrl(input) {
  let url;
  const normalizedInput = normalizeSourceVideoInput(input);

  try {
    url = new URL(normalizedInput);
  } catch {
    return {
      ok: false,
      reason: 'URL 无效。',
    };
  }

  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const isYoutubeHost = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(hostname);
  const isShortHost = hostname === 'youtu.be';

  if (!isYoutubeHost && !isShortHost) {
    return {
      ok: false,
      reason: '只支持 YouTube 视频链接。',
    };
  }

  if (url.searchParams.has('list')) {
    return {
      ok: false,
      reason: '当前只支持单个普通视频，不支持播放列表。',
    };
  }

  if (pathname.startsWith('/shorts/')) {
    return {
      ok: false,
      reason: '当前不支持 Shorts 链接。',
    };
  }

  if (isYoutubeHost && pathname !== '/watch') {
    return {
      ok: false,
      reason: '当前只支持普通 YouTube 视频页面链接。',
    };
  }

  if (isShortHost && pathname.split('/').filter(Boolean).length !== 1) {
    return {
      ok: false,
      reason: '短链接格式无效。',
    };
  }

  if (isYoutubeHost && !url.searchParams.get('v')) {
    return {
      ok: false,
      reason: '视频链接缺少 v 参数。',
    };
  }

  return {
    ok: true,
    normalizedUrl: url.toString(),
  };
}

async function assertBinaryAccess(binaryPath, label) {
  await fs.access(binaryPath, constants.X_OK);
  if (!binaryPath) {
    throw new Error(`${label} 未找到。`);
  }
}

async function materializePackagedBinary(binaryPath, fileName) {
  const targetPath = path.join(RUNTIME_BINARY_CACHE_DIR, fileName);

  try {
    await fs.access(targetPath, constants.X_OK);
    return targetPath;
  } catch {
    await fs.mkdir(RUNTIME_BINARY_CACHE_DIR, { recursive: true });
    await fs.copyFile(binaryPath, targetPath);
    await fs.chmod(targetPath, 0o755);
    return targetPath;
  }
}

async function ensureExecutablePath(binaryPath, label) {
  if (!binaryPath) {
    throw new Error(`${label} 未找到。`);
  }

  const runtimePath = process.pkg
    ? await materializePackagedBinary(binaryPath, path.basename(binaryPath))
    : binaryPath;

  await assertBinaryAccess(runtimePath, label);
  return runtimePath;
}

function parsePrintedValue(output, prefix) {
  const line = output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(prefix));

  return line ? line.slice(prefix.length) : '';
}

function splitBufferedLines(buffer, chunk) {
  const text = buffer + chunk.toString('utf8');
  const lines = text.split(/\r?\n/);
  return {
    rest: lines.pop() ?? '',
    lines,
  };
}

function runBinary(binaryPath, args, { verbose = false, onStdoutLine, onStderrLine } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdout = [];
    const stderr = [];
    let stdoutBuffer = '';
    let stderrBuffer = '';

    child.stdout.on('data', (chunk) => {
      stdout.push(chunk);
      const { lines, rest } = splitBufferedLines(stdoutBuffer, chunk);
      stdoutBuffer = rest;
      for (const line of lines) {
        onStdoutLine?.(line);
      }
      if (verbose) {
        process.stdout.write(chunk);
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr.push(chunk);
      const { lines, rest } = splitBufferedLines(stderrBuffer, chunk);
      stderrBuffer = rest;
      for (const line of lines) {
        onStderrLine?.(line);
      }
      if (verbose) {
        process.stderr.write(chunk);
      }
    });

    child.once('error', reject);
    child.once('close', (code) => {
      if (stdoutBuffer) {
        onStdoutLine?.(stdoutBuffer);
      }
      if (stderrBuffer) {
        onStderrLine?.(stderrBuffer);
      }

      const stdoutText = Buffer.concat(stdout).toString('utf8');
      const stderrText = Buffer.concat(stderr).toString('utf8');

      if (code === 0) {
        resolve(stdoutText);
        return;
      }

      const detail = stderrText || stdoutText || `exit code ${code}`;
      reject(new Error(detail.trim()));
    });
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '未知大小';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function parseDownloadProgressLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith(DOWNLOAD_PROGRESS_PREFIX)) {
    return null;
  }

  const payload = trimmed.slice(DOWNLOAD_PROGRESS_PREFIX.length);
  const [percentRaw = '', downloadedRaw = '', estimatedRaw = '', totalRaw = ''] = payload.split('|');
  const percent = Number.parseFloat(percentRaw.replace('%', '').trim());
  const downloadedBytes = Number.parseInt(downloadedRaw, 10);
  const totalBytes = Number.parseInt(totalRaw, 10);
  const estimatedTotalBytes = Number.parseInt(estimatedRaw, 10);
  const effectiveTotalBytes = Number.isFinite(totalBytes) ? totalBytes : estimatedTotalBytes;

  if (!Number.isFinite(percent)) {
    return null;
  }

  return {
    percent,
    downloadedBytes: Number.isFinite(downloadedBytes) ? downloadedBytes : null,
    totalBytes: Number.isFinite(effectiveTotalBytes) ? effectiveTotalBytes : null,
  };
}

async function fetchSourceMetadata(url, ytDlpPath = getBundledYtDlpPath()) {
  const stdout = await runBinary(ytDlpPath, [
    '--dump-single-json',
    '--skip-download',
    '--no-playlist',
    '--quiet',
    '--no-warnings',
    url,
  ]);

  const metadata = JSON.parse(stdout);
  if (!metadata?.id || !metadata?.title) {
    throw new Error('无法解析视频标题或视频 ID。');
  }

  return {
    id: metadata.id,
    title: metadata.title,
  };
}

async function ensureDestinationReady(destinationPath) {
  const directory = path.dirname(destinationPath);
  await fs.mkdir(directory, { recursive: true });

  try {
    await fs.access(destinationPath, constants.F_OK);
    throw new Error(`目标文件已存在: ${destinationPath}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }

    throw error;
  }
}

async function downloadWav(
  url,
  destinationPath,
  {
    verbose = false,
    ytDlpPath = getBundledYtDlpPath(),
    ffmpegPath = getBundledFfmpegPath(),
  } = {},
) {
  const destinationStem = path.parse(destinationPath).name;
  const outputTemplate = path.join(path.dirname(destinationPath), `${destinationStem}.%(ext)s`);
  let lastProgressText = '';
  let conversionAnnounced = false;

  const args = [
    '--ffmpeg-location',
    ffmpegPath,
    '--extract-audio',
    '--audio-format',
    'wav',
    '--format',
    'bestaudio/best',
    '--no-playlist',
    '--abort-on-error',
    '--no-overwrites',
    '--no-post-overwrites',
    '--output',
    outputTemplate,
    '--postprocessor-args',
    `ExtractAudio+ffmpeg:-ar ${DEFAULT_SAMPLE_RATE} -ac ${DEFAULT_CHANNELS} -sample_fmt ${DEFAULT_SAMPLE_FORMAT}`,
    '--newline',
    '--progress',
    '--progress-delta',
    '1',
    '--progress-template',
    `download:${DOWNLOAD_PROGRESS_PREFIX}%(progress._percent_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes_estimate)s|%(progress.total_bytes)s`,
    '--print',
    'after_move:__FINAL_PATH__:%(filepath)s',
  ];

  if (!verbose) {
    args.push('--quiet', '--no-warnings');
  }

  args.push(url);

  const stdout = await runBinary(ytDlpPath, args, {
    verbose,
    onStdoutLine(line) {
      if (verbose) {
        return;
      }

      const progress = parseDownloadProgressLine(line);
      if (!progress) {
        return;
      }

      const sizeText = progress.totalBytes
        ? `${formatBytes(progress.downloadedBytes ?? 0)} / ${formatBytes(progress.totalBytes)}`
        : formatBytes(progress.downloadedBytes ?? 0);
      const progressText = `下载进度: ${progress.percent.toFixed(1)}% (${sizeText})`;

      if (progressText !== lastProgressText) {
        console.log(progressText);
        lastProgressText = progressText;
      }

      if (progress.percent >= 100 && !conversionAnnounced) {
        console.log('下载完成，正在转换为 WAV...');
        conversionAnnounced = true;
      }
    },
  });
  const finalPath = parsePrintedValue(stdout, '__FINAL_PATH__:');

  return {
    path: finalPath || destinationPath,
  };
}

module.exports = {
  OUTPUT_DIR_ENV,
  assertBinaryAccess,
  buildDefaultFileName,
  downloadWav,
  ensureExecutablePath,
  fetchSourceMetadata,
  formatBytes,
  getBundledFfmpegPath,
  getBundledYtDlpPath,
  parseDownloadProgressLine,
  parsePrintedValue,
  resolveDestinationPath,
  resolveOutputDirectory,
  resolveOutputFileName,
  sanitizeFileStem,
  toWavFileName,
  normalizeSourceVideoInput,
  validateSourceVideoUrl,
  ensureDestinationReady,
};
