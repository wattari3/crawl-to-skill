import fs from 'node:fs';
import { type RagChunk, type OcrResult, type RagIndexMetadata } from '../types.js';
import { type CrawlConfig } from '../config/schema.js';

export interface PageData {
  sourceFile: string;
  sourceUrl: string;
  title: string;
  markdown: string;
}

/**
 * Markdownテキストを見出し境界優先でチャンクに分割する
 */
function splitMarkdownIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  // 見出し（# から ######）で分割
  const sections = text.split(/(?=^#{1,6}\s)/m);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const section of sections) {
    if (currentChunk.length + section.length <= chunkSize) {
      currentChunk += section;
    } else {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      // オーバーラップ: 前のチャンクの末尾を引き継ぐ
      const overlapText = currentChunk.slice(-overlap);
      currentChunk = overlapText + section;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // チャンクサイズを超える単独セクションはさらに段落で分割
  const finalChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= chunkSize * 1.5) {
      finalChunks.push(chunk);
    } else {
      const paragraphs = chunk.split(/\n\n+/);
      let subChunk = '';
      for (const para of paragraphs) {
        if (subChunk.length + para.length <= chunkSize) {
          subChunk += (subChunk ? '\n\n' : '') + para;
        } else {
          if (subChunk.trim()) finalChunks.push(subChunk.trim());
          subChunk = chunk.slice(-overlap) + '\n\n' + para;
        }
      }
      if (subChunk.trim()) finalChunks.push(subChunk.trim());
    }
  }

  return finalChunks.filter(c => c.length > 0);
}

/** Markdownテキストから見出し一覧を抽出する */
function extractHeadings(text: string): string[] {
  const matches = text.match(/^#{1,6}\s+(.+)$/gm) ?? [];
  return matches.map(h => h.replace(/^#+\s+/, '').trim());
}

/**
 * RAGインデックスをJSONLines形式でストリーミング生成するクラス
 */
export class RagIndexer {
  private chunkCounter = 0;
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;

  constructor(
    private readonly outputPath: string,
    skillName: string,
    config: CrawlConfig
  ) {
    this.chunkSize = config.rag.chunkSize;
    this.chunkOverlap = config.rag.chunkOverlap;

    // ファイルを初期化し、メタデータを1行目に書き込む
    const metadata: RagIndexMetadata = {
      type: 'metadata',
      version: '1.0',
      skillName,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(this.outputPath, JSON.stringify(metadata) + '\n');
  }

  /**
   * テキストページを追加してチャンク化・書き出し
   */
  public addTextPage(page: PageData): void {
    const pageChunks = splitMarkdownIntoChunks(page.markdown, this.chunkSize, this.chunkOverlap);
    const totalChunksInPage = pageChunks.length;

    for (let idx = 0; idx < pageChunks.length; idx++) {
      const content = pageChunks[idx];
      this.writeChunk({
        type: 'chunk',
        id: `chunk-${String(++this.chunkCounter).padStart(4, '0')}`,
        source: 'text',
        sourceFile: page.sourceFile,
        sourceUrl: page.sourceUrl,
        title: page.title,
        headings: extractHeadings(content),
        content,
        charCount: content.length,
        chunkIndex: idx,
        totalChunksInPage,
      });
    }
  }

  /**
   * OCR結果を追加してチャンク化・書き出し
   */
  public addOcrResult(ocr: OcrResult): void {
    const ocrChunks = splitMarkdownIntoChunks(ocr.text, this.chunkSize, this.chunkOverlap);
    const totalChunksInPage = ocrChunks.length;

    for (let idx = 0; idx < ocrChunks.length; idx++) {
      const content = ocrChunks[idx];
      this.writeChunk({
        type: 'chunk',
        id: `chunk-${String(++this.chunkCounter).padStart(4, '0')}`,
        source: 'ocr',
        sourceFile: `images/${ocr.imageFilename}`,
        sourceUrl: '',
        title: `OCR: ${ocr.imageFilename}`,
        headings: [],
        content,
        charCount: content.length,
        chunkIndex: idx,
        totalChunksInPage,
        confidence: ocr.confidence,
      });
    }
  }

  private writeChunk(chunk: RagChunk): void {
    fs.appendFileSync(this.outputPath, JSON.stringify(chunk) + '\n');
  }

  public getTotalChunks(): number {
    return this.chunkCounter;
  }
}
