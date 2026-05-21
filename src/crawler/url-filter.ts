import { type CrawlConfig } from '../config/schema.js';

/**
 * 設定ファイルの globs / exclude を Crawlee の enqueueLinks 用オプションに変換する
 */
export function buildEnqueueLinksOptions(
  config: CrawlConfig,
  baseUrls: string[]
): { globs?: string[]; exclude?: string[] } {
  const result: { globs?: string[]; exclude?: string[] } = {};

  // globs が設定されている場合はそのまま使用
  // 未設定の場合は startUrls のドメインをベースに同一ホストをデフォルトとする
  if (config.crawl.globs && config.crawl.globs.length > 0) {
    result.globs = config.crawl.globs;
  } else {
    // デフォルト: startUrls のホスト名を元に同一オリジン内をクロール
    const origins = baseUrls
      .map(url => {
        try {
          const parsed = new URL(url);
          return `${parsed.origin}/**`;
        } catch {
          return null;
        }
      })
      .filter((u): u is string => u !== null);
    if (origins.length > 0) {
      result.globs = origins;
    }
  }

  if (config.crawl.exclude && config.crawl.exclude.length > 0) {
    result.exclude = config.crawl.exclude;
  }

  return result;
}
