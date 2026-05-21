import path from 'node:path';
import Tesseract from 'tesseract.js';
import { type ImageEntry, type OcrResult } from '../types.js';
import { type CrawlConfig } from '../config/schema.js';
import { type Logger } from '../utils/logger.js';

/**
 * 画像一覧に対してOCR処理を行い、テキスト抽出結果を返す
 */
export async function runOcr(
  imageEntries: ImageEntry[],
  imagesDir: string,
  config: CrawlConfig,
  logger: Logger
): Promise<OcrResult[]> {
  if (!config.images.ocr || imageEntries.length === 0) return [];

  const ocrResults: OcrResult[] = [];
  const languages = config.images.ocrLanguages.join('+');
  const minConfidence = config.rag.minOcrConfidence;

  logger.info(`OCR処理開始: ${imageEntries.length} 件, 言語: ${languages}`);

  // Tesseract.js はワーカーを使って並列処理
  const workerCount = Math.min(imageEntries.length, config.rag.maxOcrWorkers);
  const scheduler = Tesseract.createScheduler();
  const workers: Tesseract.Worker[] = [];

  for (let i = 0; i < workerCount; i++) {
    const worker = await Tesseract.createWorker(languages);
    scheduler.addWorker(worker);
    workers.push(worker);
  }

  try {
    const tasks = imageEntries.map(async (entry) => {
      const filePath = path.join(imagesDir, entry.filename);

      // OCR処理対象外の画像拡張子はスキップ
      const ext = path.extname(entry.filename).toLowerCase();
      if (['.svg', '.gif'].includes(ext)) {
        return;
      }

      try {
        const result = await scheduler.addJob('recognize', filePath);
        const { text, confidence } = result.data;

        if (confidence < minConfidence) {
          logger.verbose(`OCR信頼度が低いためスキップ (${confidence.toFixed(1)}%): ${entry.filename}`);
          return;
        }

        const trimmedText = text.trim();
        if (trimmedText.length === 0) return;

        ocrResults.push({
          imageFilename: entry.filename,
          text: trimmedText,
          confidence,
        });

        logger.verbose(`OCR完了: ${entry.filename} (信頼度: ${confidence.toFixed(1)}%)`);
      } catch (error) {
        logger.warn(`OCRエラー: ${entry.filename} — ${(error as Error).message}`);
      }
    });

    await Promise.all(tasks);
  } finally {
    await scheduler.terminate();
  }

  logger.info(`OCR処理完了: ${ocrResults.length} 件抽出`);
  return ocrResults;
}
