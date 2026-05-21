import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { type ImageEntry } from '../types.js';

/**
 * Turndownサービスを初期化してGFM対応のMarkdown変換器を返す
 */
function createTurndownService(): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    hr: '---',
  });

  // GFMプラグイン（テーブル・タスクリスト等）を適用
  service.use(gfm);

  // コードブロックのシンタックスハイライトクラスを言語名に変換
  // 例: <code class="language-typescript"> → ```typescript
  service.addRule('fenced-code-block', {
    filter(node) {
      return (
        node.nodeName === 'CODE' &&
        node.parentNode?.nodeName === 'PRE'
      );
    },
    replacement(content, node) {
      const element = node as Element;
      const classes = element.getAttribute('class') ?? '';
      const langMatch = classes.match(/language-(\S+)/);
      const lang = langMatch?.[1] ?? '';
      return `\n\`\`\`${lang}\n${content.trim()}\n\`\`\`\n`;
    },
  });

  return service;
}

/**
 * HTML文字列をMarkdownに変換する
 * 画像の src を images/ 相対パスに書き換える
 */
export function convertHtmlToMarkdown(
  html: string,
  pageUrl: string,
  imageEntries: ImageEntry[]
): string {
  // img src を相対パスに書き換えるためのマップを構築
  const srcMap = new Map<string, string>();
  for (const entry of imageEntries) {
    srcMap.set(entry.originalUrl, entry.relativePath);
  }

  // img タグの src を相対パスに書き換えてから変換
  let processedHtml = html.replace(
    /<img([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi,
    (match, before: string, src: string, after: string) => {
      // 絶対URLに解決
      let absoluteSrc: string;
      try {
        absoluteSrc = new URL(src, pageUrl).href;
      } catch {
        return match;
      }

      const relativePath = srcMap.get(absoluteSrc);
      if (relativePath) {
        return `<img${before}src="${relativePath}"${after}>`;
      }
      return match;
    }
  );

  const service = createTurndownService();
  let markdown = service.turndown(processedHtml);

  // 連続する空行を最大2行に正規化
  markdown = markdown.replace(/\n{3,}/g, '\n\n');

  // 末尾の空白を除去
  markdown = markdown.trim();

  return markdown;
}
