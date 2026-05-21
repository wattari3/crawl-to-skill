// 共通型定義

export interface CrawlResult {
  url: string;
  title: string;
  html: string;
  imageUrls: string[];
}

export interface ImageEntry {
  /** ダウンロード元URL */
  originalUrl: string;
  /** ローカル保存ファイル名（ハッシュ付き） */
  filename: string;
  /** images/ ディレクトリからの相対パス */
  relativePath: string;
}

export interface OcrResult {
  imageFilename: string;
  text: string;
  confidence: number;
}

export interface RagIndexMetadata {
  type: 'metadata';
  version: '1.0';
  skillName: string;
  createdAt: string;
}

export interface RagChunk {
  type: 'chunk';
  id: string;
  source: 'text' | 'ocr';
  sourceFile: string;
  sourceUrl: string;
  title: string;
  headings: string[];
  content: string;
  charCount: number;
  chunkIndex: number;
  totalChunksInPage: number;
  /** OCR結果の場合のみ存在 */
  confidence?: number;
}

export interface FailedUrl {
  url: string;
  error: string;
}

export interface CrawlReport {
  startedAt: string;
  completedAt: string;
  totalRequests: number;
  succeeded: number;
  failed: number;
  failedUrls: FailedUrl[];
  imagesDownloaded: number;
  ocrProcessed: number;
}
