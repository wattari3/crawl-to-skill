import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { type CrawlConfig } from '../config/schema.js';
import { type ImageEntry } from '../types.js';
import { type Logger } from '../utils/logger.js';

/** URLが除外パターンに一致するか確認（シンプルなワイルドカードマッチ） */
function matchesExcludePattern(url: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // ** をワイルドカードに変換してチェック
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // 特殊文字エスケープ
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*');
    if (new RegExp(regexStr).test(url)) return true;
  }
  return false;
}

/** ファイル名をハッシュ付きで安全な名前に変換 */
function buildFilename(url: string, contentBuffer: Buffer): string {
  const urlPath = new URL(url).pathname;
  const ext = path.extname(urlPath) || '.png';
  const basename = path.basename(urlPath, ext)
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .substring(0, 40) || 'image';
  const hash = crypto
    .createHash('sha256')
    .update(contentBuffer)
    .digest('hex')
    .substring(0, 8);
  return `${basename}-${hash}${ext}`;
}

/**
 * 画像URLのリストをダウンロードし、images/ フォルダに保存して ImageEntry[] を返す
 */
export async function downloadImages(
  imageUrls: string[],
  imagesDir: string,
  config: CrawlConfig,
  logger: Logger
): Promise<ImageEntry[]> {
  if (!config.images.download || imageUrls.length === 0) return [];

  fs.mkdirSync(imagesDir, { recursive: true });

  const entries: ImageEntry[] = [];
  const downloadedUrls = new Map<string, ImageEntry>(); // 重複除去キャッシュ

  for (const url of imageUrls) {
    // 既にダウンロード済みの場合はキャッシュを返す
    if (downloadedUrls.has(url)) {
      entries.push(downloadedUrls.get(url)!);
      continue;
    }

    // 除外パターンチェック
    if (matchesExcludePattern(url, config.images.excludePatterns)) {
      logger.verbose(`画像除外: ${url}`);
      continue;
    }

    // SVGインライン除外
    if (url.endsWith('.svg')) {
      logger.verbose(`SVG除外: ${url}`);
      continue;
    }

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CrawlingBot/1.0)' },
      });

      if (!response.ok) {
        logger.warn(`画像取得失敗 (${response.status}): ${url}`);
        continue;
      }

      const contentType = response.headers.get('content-type') ?? '';
      // 画像以外のコンテンツタイプはスキップ
      if (!contentType.startsWith('image/')) {
        logger.verbose(`画像以外のコンテンツタイプ (${contentType}): ${url}`);
        continue;
      }

      let buffer = Buffer.from(await response.arrayBuffer());

      // リサイズが必要かチェック（sharp で処理）
      if (!contentType.includes('svg')) {
        try {
          const metadata = await sharp(buffer).metadata();
          if (metadata.width && metadata.width > config.images.maxWidthPx) {
            buffer = Buffer.from(
              await sharp(buffer)
                .resize({ width: config.images.maxWidthPx, withoutEnlargement: true })
                .toBuffer()
            );
            logger.verbose(`画像リサイズ: ${url} (幅${metadata.width}px → ${config.images.maxWidthPx}px)`);
          }
        } catch {
          // sharp で処理できない形式はそのまま保存
        }
      }

      const filename = buildFilename(url, buffer);
      const filePath = path.join(imagesDir, filename);
      fs.writeFileSync(filePath, buffer);

      const entry: ImageEntry = {
        originalUrl: url,
        filename,
        relativePath: `images/${filename}`,
      };

      entries.push(entry);
      downloadedUrls.set(url, entry);
      logger.verbose(`画像保存: ${filename}`);
    } catch (error) {
      logger.warn(`画像ダウンロードエラー: ${url} — ${(error as Error).message}`);
    }
  }

  return entries;
}
