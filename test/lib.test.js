const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  buildDefaultFileName,
  formatBytes,
  normalizeSourceVideoInput,
  parseDownloadProgressLine,
  resolveDestinationPath,
  resolveOutputDirectory,
  sanitizeFileStem,
  toWavFileName,
  validateSourceVideoUrl,
} = require('../src/lib');

test('sanitizeFileStem strips invalid filename characters', () => {
  assert.equal(sanitizeFileStem(' A:/B*?<>|"  '), 'A-B');
});

test('toWavFileName appends wav extension when missing', () => {
  assert.equal(toWavFileName('demo-file'), 'demo-file.wav');
});

test('toWavFileName replaces non-wav extensions', () => {
  assert.equal(toWavFileName('demo-file.mp3'), 'demo-file.wav');
});

test('buildDefaultFileName uses title and id', () => {
  assert.equal(
    buildDefaultFileName({ title: 'Test Video', id: 'abc123' }),
    'Test Video-abc123.wav',
  );
});

test('formatBytes formats byte sizes for progress display', () => {
  assert.equal(formatBytes(1536), '1.5 KB');
});

test('resolveOutputDirectory defaults to Downloads under home', () => {
  assert.equal(resolveOutputDirectory({}, '/tmp/home'), path.resolve('/tmp/home/Downloads'));
});

test('resolveOutputDirectory honors env override', () => {
  assert.equal(
    resolveOutputDirectory({ YTDL_WAV_OUTPUT_DIR: '~/custom-audio' }, '/tmp/home'),
    path.resolve('/tmp/home/custom-audio'),
  );
});

test('resolveDestinationPath combines resolved directory with explicit file name', () => {
  assert.equal(
    resolveDestinationPath(
      { title: 'Video', id: 'xyz' },
      'sample-name',
      { YTDL_WAV_OUTPUT_DIR: '/tmp/audio' },
      '/tmp/home',
    ),
    path.resolve('/tmp/audio/sample-name.wav'),
  );
});

test('normalizeSourceVideoInput trims spaces and wrapping backticks', () => {
  assert.equal(
    normalizeSourceVideoInput(' `https://www.youtube.com/watch/?v=kF-7DlzE8JA` '),
    'https://www.youtube.com/watch/?v=kF-7DlzE8JA',
  );
});

test('normalizeSourceVideoInput unescapes shell-escaped query characters', () => {
  assert.equal(
    normalizeSourceVideoInput('https://www.youtube.com/watch\\?v\\=vUCI-U1fg7s'),
    'https://www.youtube.com/watch?v=vUCI-U1fg7s',
  );
});

test('parseDownloadProgressLine parses percent and byte counts', () => {
  assert.deepEqual(
    parseDownloadProgressLine('__PROGRESS__: 61.0%|2096128|NA|3433755'),
    {
      percent: 61,
      downloadedBytes: 2096128,
      totalBytes: 3433755,
    },
  );
});

test('validateSourceVideoUrl accepts ordinary watch url', () => {
  const result = validateSourceVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(result.ok, true);
});

test('validateSourceVideoUrl accepts watch url with trailing slash', () => {
  const result = validateSourceVideoUrl('https://www.youtube.com/watch/?v=dQw4w9WgXcQ');
  assert.equal(result.ok, true);
});

test('validateSourceVideoUrl accepts youtu.be short link', () => {
  const result = validateSourceVideoUrl('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(result.ok, true);
});

test('validateSourceVideoUrl accepts wrapped url input', () => {
  const result = validateSourceVideoUrl(' `https://www.youtube.com/watch/?v=dQw4w9WgXcQ` ');
  assert.equal(result.ok, true);
});

test('validateSourceVideoUrl accepts shell-escaped watch url input', () => {
  const result = validateSourceVideoUrl('https://www.youtube.com/watch\\?v\\=dQw4w9WgXcQ');
  assert.equal(result.ok, true);
});

test('validateSourceVideoUrl rejects playlist url', () => {
  const result = validateSourceVideoUrl(
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123',
  );
  assert.equal(result.ok, false);
});

test('validateSourceVideoUrl rejects shorts url', () => {
  const result = validateSourceVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ');
  assert.equal(result.ok, false);
});
