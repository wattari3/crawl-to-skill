import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import * as cheerio from 'cheerio';
import { type CrawlConfig } from '../config/schema.js';
import { type Logger } from '../utils/logger.js';

export interface ExtractedContent {
  /** 抽出されたメインコンテンツのHTML */
  html: string;
  /** ページタイトル */
  title: string;
  /** Readabilityが抽出した抜粋（存在する場合） */
  excerpt?: string;
}

/**
 * HTMLからメインコンテンツを抽出する
 * contentSelector 指定時: Cheerioで該当要素を抽出
 * 未指定時: @mozilla/readability で自動抽出
 */
export function extractContent(
  html: string,
  url: string,
  config: CrawlConfig,
  logger: Logger
): ExtractedContent {
  const { contentSelector, useReadability, removeSelectors } = config.content;

  // まず不要な要素を除去（Cheerioで前処理）
  const $ = cheerio.load(html);
  const selectorsToRemove = removeSelectors.join(', ');
  if (selectorsToRemove) {
    $(selectorsToRemove).remove();
  }
  const cleanedHtml = $.html();

  // contentSelector が指定されている場合はセレクタで抽出
  if (contentSelector) {
    const $clean = cheerio.load(cleanedHtml);
    const selected = $clean(contentSelector);
    if (selected.length === 0) {
      logger.warn(`contentSelector "${contentSelector}" が見つかりません: ${url}。body全体を使用します`);
      return {
        html: $clean('body').html() ?? cleanedHtml,
        title: $clean('title').text() || url,
      };
    }
    return {
      html: selected.html() ?? '',
      title: $clean('title').text() || url,
    };
  }

  // Readability を使用してメインコンテンツを自動抽出
  if (useReadability) {
    const dom = new JSDOM(cleanedHtml, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      // Readabilityが失敗した場合は body 全体にフォールバック
      logger.warn(`Readabilityによる抽出に失敗しました: ${url}。body全体を使用します`);
      const $clean = cheerio.load(cleanedHtml);
      return {
        html: $clean('body').html() ?? cleanedHtml,
        title: $clean('title').text() || url,
      };
    }

    return {
      html: article.content,
      title: article.title,
      excerpt: article.excerpt ?? undefined,
    };
  }

  // Readabilityも使わない場合は body 全体を返す
  const $clean = cheerio.load(cleanedHtml);
  return {
    html: $clean('body').html() ?? cleanedHtml,
    title: $clean('title').text() || url,
  };
}
