const { parseArgs } = require('node:util');

const {
  OUTPUT_DIR_ENV,
  downloadWav,
  ensureExecutablePath,
  ensureDestinationReady,
  fetchSourceMetadata,
  getBundledFfmpegPath,
  getBundledYtDlpPath,
  resolveDestinationPath,
  validateSourceVideoUrl,
} = require('./lib');

function printUsage() {
  console.log(`ytwav <youtube-url> [options]
ytwav help

根据单个公开的 YouTube 普通视频链接下载对应的 WAV。

选项:
  -o, --output <name>   指定输出文件名，仅文件名，自动补 .wav
  -v, --verbose         输出底层 yt-dlp / ffmpeg 日志
  -h, --help            显示帮助

环境变量:
  ${OUTPUT_DIR_ENV}     覆盖默认输出目录，默认是 ~/Downloads
`);
}

async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      output: {
        type: 'string',
        short: 'o',
      },
      verbose: {
        type: 'boolean',
        short: 'v',
        default: false,
      },
      help: {
        type: 'boolean',
        short: 'h',
        default: false,
      },
    },
  });

  if (values.help || (positionals.length === 1 && positionals[0] === 'help')) {
    printUsage();
    return 0;
  }

  if (positionals.length !== 1) {
    printUsage();
    throw new Error('必须且只能传入一个 YouTube 视频链接。');
  }

  const validation = validateSourceVideoUrl(positionals[0]);
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  const ytDlpPath = getBundledYtDlpPath();
  const ffmpegPath = getBundledFfmpegPath();
  const resolvedYtDlpPath = await ensureExecutablePath(ytDlpPath, 'yt-dlp');
  const resolvedFfmpegPath = await ensureExecutablePath(ffmpegPath, 'ffmpeg');

  console.log('读取视频信息...');
  const metadata = await fetchSourceMetadata(validation.normalizedUrl, resolvedYtDlpPath);
  const destinationPath = resolveDestinationPath(metadata, values.output);

  await ensureDestinationReady(destinationPath);

  console.log(`开始下载并转换为 WAV: ${destinationPath}`);
  const result = await downloadWav(validation.normalizedUrl, destinationPath, {
    ffmpegPath: resolvedFfmpegPath,
    verbose: values.verbose,
    ytDlpPath: resolvedYtDlpPath,
  });

  console.log(`已生成 WAV: ${result.path}`);
  return 0;
}

module.exports = {
  main,
  printUsage,
};
