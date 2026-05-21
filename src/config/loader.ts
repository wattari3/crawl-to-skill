import fs from 'node:fs';
import path from 'node:path';
import { ConfigSchema, type CrawlConfig } from './schema.js';
import { expandEnvVarsDeep } from './env-expander.js';
import { DEFAULTS } from './defaults.js';

export interface CliOverrides {
  name?: string;
  startUrl?: string;
  depth?: number;
  maxRequests?: number;
  output?: string;
  images?: boolean;
  ocr?: boolean;
  verbose?: boolean;
}

/**
 * JSON設定ファイルを読み込み、CLIフラグとマージして設定オブジェクトを返す
 */
export function loadConfig(configPath: string | undefined, cliOverrides: CliOverrides): CrawlConfig {
  let rawConfig: Record<string, unknown> = {};

  if (configPath) {
    const absPath = path.resolve(configPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`設定ファイルが見つかりません: ${absPath}`);
    }
    const content = fs.readFileSync(absPath, 'utf-8');
    try {
      rawConfig = JSON.parse(content) as Record<string, unknown>;
    } catch (e) {
      throw new Error(`設定ファイルのJSONパースに失敗しました: ${(e as Error).message}`);
    }
  }

  // CLIフラグで設定ファイルを上書き（CLIフラグ優先）
  if (cliOverrides.name) rawConfig['name'] = cliOverrides.name;
  if (cliOverrides.output) rawConfig['output'] = cliOverrides.output;
  if (cliOverrides.startUrl) rawConfig['startUrls'] = [cliOverrides.startUrl];

  const crawlSection = (rawConfig['crawl'] as Record<string, unknown>) ?? {};
  if (cliOverrides.depth !== undefined) crawlSection['depth'] = cliOverrides.depth;
  if (cliOverrides.maxRequests !== undefined) crawlSection['maxRequests'] = cliOverrides.maxRequests;
  rawConfig['crawl'] = crawlSection;

  const imagesSection = (rawConfig['images'] as Record<string, unknown>) ?? {};
  if (cliOverrides.images === false) imagesSection['download'] = false;
  if (cliOverrides.ocr === false) imagesSection['ocr'] = false;
  rawConfig['images'] = imagesSection;

  // Zodバリデーション
  const result = ConfigSchema.safeParse(rawConfig);
  if (!result.success) {
    const errors = result.error.errors
      .map(e => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`設定ファイルのバリデーションエラー:\n${errors}`);
  }

  const config = result.data;

  // 認証セクションのみ環境変数展開（機密情報を含む可能性があるため）
  if (config.auth) {
    config.auth = expandEnvVarsDeep(config.auth);
  }

  return config;
}

/**
 * 設定からSkill名を決定する（URLフォールバック付き）
 */
export function resolveSkillName(config: CrawlConfig, fallbackUrl?: string): string {
  if (config.name) return config.name;
  const url = fallbackUrl ?? config.startUrls?.[0];
  if (!url) return 'unnamed-skill';
  try {
    return new URL(url).hostname.replace(/\./g, '-');
  } catch {
    return 'unnamed-skill';
  }
}

/**
 * 出力先ディレクトリの絶対パスを返す
 */
export function resolveOutputDir(config: CrawlConfig, skillName: string): string {
  return path.resolve(config.output, skillName);
}
