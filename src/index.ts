#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import { Dataset } from 'crawlee';
import { loadConfig, resolveSkillName, resolveOutputDir } from './config/loader.js';
import { runCrawler } from './crawler/crawler.js';
import { performLogin } from './crawler/auth-handler.js';
import { extractContent } from './processor/content-extractor.js';
import { convertHtmlToMarkdown } from './processor/html-to-markdown.js';
import { downloadImages } from './processor/image-handler.js';
import { runOcr } from './processor/image-ocr.js';
import { RagIndexer } from './rag/indexer.js';
import { buildSkillFolder } from './skill-builder/skill-folder.js';
import { createLogger } from './utils/logger.js';
import { urlToFilename } from './utils/slug.js';
import { type CrawlReport, type ImageEntry, type CrawlResult } from './types.js';

const program = new Command();

program
  .name('crawling')
  .description('WebページをクロールしてAIエージェント用Skillフォルダとして出力するCLIツール')
  .version('0.1.0');

program
  .command('crawl [url]')
  .description('指定URLをクロールしてSkillフォルダを生成する')
  .option('-c, --config <path>', 'JSON設定ファイルのパス')
  .option('--name <skill-name>', 'Skill名（フォルダ名）')
  .option('--depth <n>', 'クロール深度（0=無制限）', (v) => parseInt(v, 10))
  .option('--max-requests <n>', '最大リクエスト数', (v) => parseInt(v, 10))
  .option('--output <dir>', '出力先ディレクトリ')
  .option('--no-images', '画像のダウンロードをスキップ')
  .option('--no-ocr', 'OCR処理をスキップ')
  .option('--verbose', '詳細ログを出力')
  .action(async (url: string | undefined, options: {
    config?: string;
    name?: string;
    depth?: number;
    maxRequests?: number;
    output: string;
    images: boolean;
    ocr: boolean;
    verbose: boolean;
  }) => {
    const logger = createLogger(options.verbose);
    const startedAt = new Date().toISOString();

    try {
      // 設定読み込み
      const config = loadConfig(options.config, {
        name: options.name,
        startUrl: url,
        depth: options.depth,
        maxRequests: options.maxRequests,
        output: options.output,
        images: options.images,
        ocr: options.ocr,
        verbose: options.verbose,
      });

      // OCRフラグの上書き（--no-ocr フラグ）
      if (!options.ocr) {
        config.images.ocr = false;
      }

      // startUrls の確認
      if (!config.startUrls || config.startUrls.length === 0) {
        logger.fail('startUrls が指定されていません。URLを引数または設定ファイルで指定してください。');
        process.exit(1);
      }

      const skillName = resolveSkillName(config, config.startUrls[0]);
      const outputDir = resolveOutputDir(config, skillName);

      logger.info(`🕷️  Crawling — Skill: "${skillName}"`);
      logger.info(`起点URL: ${config.startUrls.join(', ')}`);
      logger.info(`出力先: ${outputDir}`);

      // 認証フロー（設定がある場合）
      let storageStatePath: string | undefined;
      if (config.auth) {
        logger.info('🔐 認証フローを実行します...');
        storageStatePath = await performLogin(config, skillName, logger);
      }

      // クロール実行
      logger.info('🔍 クロールを開始します...');
      const { datasetId, failedUrls, totalRequests } = await runCrawler(
        config,
        config.startUrls,
        storageStatePath,
        logger
      );

      const dataset = await Dataset.open<CrawlResult>(datasetId);
      const datasetInfo = await dataset.getInfo();
      const itemCount = datasetInfo?.itemCount ?? 0;

      if (itemCount === 0) {
        logger.fail('クロール結果が0件です。URLとネットワーク接続を確認してください。');
        process.exit(1);
      }

      logger.succeed(`クロール完了: ${itemCount} ページ取得`);

      // テンポラリディレクトリ設定
      const tempImagesDir = path.join(path.dirname(outputDir), `.images-tmp-${skillName}`);
      const tempRagIndexPath = path.join(path.dirname(outputDir), `.rag-tmp-${skillName}.jsonl`);

      const pages: Array<{ filename: string; title: string; markdown: string }> = [];
      const allImageEntries: ImageEntry[] = [];
      let textChunksCount = 0;
      let ocrChunksCount = 0;

      const indexer = new RagIndexer(tempRagIndexPath, skillName, config);

      // 各ページをDatasetから1件ずつ処理（OOM対策）
      logger.info('📝 コンテンツを変換中...');
      
      await dataset.forEach(async (result: CrawlResult, index) => {
        // コンテンツ抽出
        const extracted = extractContent(result.html, result.url, config, logger);

        // 画像ダウンロード
        let imageEntries: ImageEntry[] = [];
        if (config.images.download) {
          imageEntries = await downloadImages(result.imageUrls, tempImagesDir, config, logger);
          allImageEntries.push(...imageEntries);
        }

        // Markdown変換
        const markdown = convertHtmlToMarkdown(extracted.html, result.url, imageEntries);
        const filename = urlToFilename(result.url);
        const title = extracted.title || result.title || result.url;

        pages.push({
          filename,
          title,
          markdown,
        });

        // テキストチャンク追加
        const prevChunkCount = indexer.getTotalChunks();
        indexer.addTextPage({
          sourceFile: `references/${filename}`,
          sourceUrl: result.url,
          title,
          markdown
        });
        textChunksCount += (indexer.getTotalChunks() - prevChunkCount);
        
        logger.progress(index + 1, itemCount);
      });

      logger.succeed(`コンテンツ変換完了: ${pages.length} ページ, ${allImageEntries.length} 画像`);

      // OCR処理
      let ocrProcessedCount = 0;
      if (config.images.ocr && allImageEntries.length > 0) {
        logger.info('🔤 OCR処理を実行中...');

        // 重複除去
        const uniqueEntries = [...new Map(
          allImageEntries.map(e => [e.filename, e])
        ).values()];

        const ocrResults = await runOcr(uniqueEntries, tempImagesDir, config, logger);
        ocrProcessedCount = ocrResults.length;
        
        // OCRチャンク追加
        for (const ocr of ocrResults) {
          const prevChunkCount = indexer.getTotalChunks();
          indexer.addOcrResult(ocr);
          ocrChunksCount += (indexer.getTotalChunks() - prevChunkCount);
        }
        
        logger.succeed(`OCR完了: ${ocrProcessedCount} 件`);
      }

      // Dataset を破棄してディスクスペース解放
      await dataset.drop();

      // クロールレポート
      const completedAt = new Date().toISOString();
      const report: CrawlReport = {
        startedAt,
        completedAt,
        totalRequests,
        succeeded: pages.length,
        failed: failedUrls.length,
        failedUrls,
        imagesDownloaded: allImageEntries.length,
        ocrProcessed: ocrProcessedCount,
      };

      const ragStats = {
        totalChunks: indexer.getTotalChunks(),
        textChunks: textChunksCount,
        ocrChunks: ocrChunksCount
      };

      // Skillフォルダ生成
      logger.info('📁 Skillフォルダを生成中...');
      buildSkillFolder({
        skillName,
        outputDir,
        startUrl: config.startUrls[0],
        pages,
        ragStats,
        tempRagIndexPath,
        report,
        tempImagesDir,
      });

      logger.succeed(`✅ 完了! Skillフォルダを生成しました: ${outputDir}`);

      if (failedUrls.length > 0) {
        logger.warn(`${failedUrls.length} 件のページでエラーが発生しました。crawl-report.json を確認してください。`);
      }

      console.log('\n使用方法:');
      console.log(`  ${outputDir} を .agents/skills/${skillName}/ にコピーしてください`);
    } catch (error) {
      logger.fail(`エラー: ${(error as Error).message}`);
      if (options.verbose) {
        console.error((error as Error).stack);
      }
      process.exit(1);
    }
  });

program.parse();
