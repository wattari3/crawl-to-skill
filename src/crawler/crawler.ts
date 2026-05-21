import { PlaywrightCrawler, Dataset } from 'crawlee';
import { type CrawlConfig } from '../config/schema.js';
import { type CrawlResult, type FailedUrl } from '../types.js';
import { buildEnqueueLinksOptions } from './url-filter.js';
import { type Logger } from '../utils/logger.js';
import { DEFAULTS } from '../config/defaults.js';

export interface CrawlerRunResult {
  datasetId: string;
  failedUrls: FailedUrl[];
  totalRequests: number;
}

/**
 * PlaywrightCrawler を設定・実行し、クロール結果を返す
 */
export async function runCrawler(
  config: CrawlConfig,
  startUrls: string[],
  storageStatePath: string | undefined,
  logger: Logger
): Promise<CrawlerRunResult> {
  const failedUrls: FailedUrl[] = [];
  let totalRequests = 0;

  const enqueueOptions = buildEnqueueLinksOptions(config, startUrls);

  // maxCrawlDepth: depth が 0 の場合は無制限（設定しない）
  const depth = config.crawl.depth ?? DEFAULTS.crawl.depth;
  const maxCrawlDepth = depth === 0 ? undefined : depth;

  // maxRequestsPerCrawl: 設定値を使用。未設定の場合はデフォルト
  const maxRequestsPerCrawl = config.crawl.maxRequests ?? DEFAULTS.crawl.maxRequests;

  logger.info(
    `クロール設定: 深度=${maxCrawlDepth ?? '無制限'}, 最大リクエスト数=${maxRequestsPerCrawl}`
  );

  // ユニークなデータセットIDを生成
  const datasetId = `crawl-${Date.now()}`;
  const dataset = await Dataset.open(datasetId);

  const crawler = new PlaywrightCrawler({
    // 深度・リクエスト数制限
    ...(maxCrawlDepth !== undefined ? { maxCrawlDepth } : {}),
    maxRequestsPerCrawl,

    // リトライ・タイムアウト
    maxRequestRetries: config.crawl.maxRetries,
    navigationTimeoutSecs: config.crawl.navigationTimeoutSecs,
    requestHandlerTimeoutSecs: config.crawl.requestHandlerTimeoutSecs,

    // 認証: storageState をコンテキストに注入
    ...(storageStatePath
      ? {
          browserPoolOptions: {
            preLaunchHooks: [],
            prePageCreateHooks: [
              async (
                _pageId: any,
                _browserController: any,
                pageOptions: any
              ) => {
                if (pageOptions) {
                  pageOptions['storageState'] = storageStatePath;
                }
              },
            ],
          },
        }
      : {}),

    // リクエストハンドラ
    async requestHandler({ request, page, enqueueLinks, log }) {
      const url = request.url;
      logger.verbose(`処理中: ${url}`);

      // ページが完全にロードされるまで待機
      await page.waitForLoadState('domcontentloaded');

      const title = await page.title();
      const html = await page.content();

      // 画像URLを収集（img[src] + img[data-src] でlazy loading対応）
      const imageUrls = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs
          .map(img => img.getAttribute('src') ?? img.getAttribute('data-src') ?? '')
          .filter(src => src && !src.startsWith('data:') && !src.startsWith('blob:'));
      });

      // 絶対URLに変換
      const resolvedImageUrls = imageUrls
        .map(src => {
          try {
            return new URL(src, url).href;
          } catch {
            return null;
          }
        })
        .filter((u): u is string => u !== null);

      totalRequests++;
      
      const result: CrawlResult = { url, title, html, imageUrls: resolvedImageUrls };
      await dataset.pushData(result);
      
      logger.progress(totalRequests, maxRequestsPerCrawl);

      // 次のリンクをキューに追加
      await enqueueLinks(enqueueOptions);
    },

    // 失敗ハンドラ
    failedRequestHandler({ request, error }) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`クロール失敗: ${request.url} — ${errorMessage}`);
      failedUrls.push({ url: request.url, error: errorMessage });
    },
  });

  await crawler.run(startUrls);

  return { datasetId, failedUrls, totalRequests };
}
