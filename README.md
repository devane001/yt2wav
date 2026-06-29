# youtube-download

一个基于 Node.js 的 CLI 工具，用公开的 YouTube 普通视频链接下载对应的 `.wav`。

## 行为约定

- 一次命令只处理一个视频 URL
- 只支持公开可访问的普通 YouTube 视频
- 默认输出目录是 `~/Downloads`
- 可通过环境变量 `YTDL_WAV_OUTPUT_DIR` 覆盖默认输出目录
- `--output` 只接受文件名，不接受路径，缺少 `.wav` 时会自动补齐
- 默认文件名是 `视频标题-视频ID.wav`
- 目标文件已存在时直接失败，不覆盖
- 输出规格固定为 `44.1kHz / 16bit / stereo`
- 默认显示基于下载大小的百分比进度
- 默认只输出简洁日志，`--verbose` 会透出底层 `yt-dlp` / `ffmpeg` 日志

## 安装

```bash
npm install
```

本项目会随依赖一起准备：

- 内置 `yt-dlp` 二进制
- `ffmpeg-static`

## 用法

```bash
npm start -- "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

或直接执行：

```bash
node ./bin/youtube-wav.js "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

如果你全局安装或通过 `npx` 调用，也可以使用：

```bash
ytwav "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

## 选项

```text
-o, --output <name>   指定输出文件名，仅文件名，自动补 .wav
-v, --verbose         输出底层 yt-dlp / ffmpeg 日志
-h, --help            显示帮助
```

## 环境变量

```bash
export YTDL_WAV_OUTPUT_DIR=~/Music/youtube-wav
```

## 测试

```bash
npm test
```

## 打包可执行文件

```bash
npm run build:bin
```

产物默认在：

```text
dist/ytwav-macos-arm64
```

如果要安装软链到本机命令目录：

```bash
npm run link:bin
```

默认会链接到：

```text
$HOME/bin/ytwav
```

可选的多平台构建命令：

```bash
npm run build:macos-arm64
npm run build:linux-x64
```

## CI / Release

推送 `v*` 标签，或者在 GitHub Actions 手动触发 `Build And Release` 工作流后，会通过 Docker 构建并上传这些 release 资产：

- `ytwav-macos-arm64`
- `ytwav-linux-x64`
