import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { type CrawlConfig, type AuthStep } from '../config/schema.js';
import { type Logger } from '../utils/logger.js';

/** storageState キャッシュファイルのパス */
function getStorageStatePath(skillName: string): string {
  const scratchDir = path.resolve('.scratch');
  fs.mkdirSync(scratchDir, { recursive: true });
  return path.join(scratchDir, `auth-state-${skillName}.json`);
}

/** キャッシュが有効期限内かチェック */
function isCacheValid(cachePath: string, ttlMinutes: number): boolean {
  if (!fs.existsSync(cachePath)) return false;
  const stat = fs.statSync(cachePath);
  const ageMs = Date.now() - stat.mtimeMs;
  return ageMs < ttlMinutes * 60 * 1000;
}

/**
 * 設定ファイルの auth.steps を順次実行してログインし、
 * storageState を返す（キャッシュがあればそれを使用）
 */
export async function performLogin(
  config: CrawlConfig,
  skillName: string,
  logger: Logger
): Promise<string | undefined> {
  const auth = config.auth;
  if (!auth) return undefined;

  const cachePath = getStorageStatePath(skillName);
  const ttl = auth.storageStateTTLMinutes;

  if (isCacheValid(cachePath, ttl)) {
    logger.info(`認証キャッシュを再利用します（${cachePath}）`);
    return cachePath;
  }

  logger.info(`ログインフローを実行します: ${auth.loginUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(auth.loginUrl, { waitUntil: 'networkidle' });

    for (const step of auth.steps) {
      await executeAuthStep(page, step, logger);
    }

    // 成功チェック
    if (auth.successCheck) {
      const { selector, expectedText } = auth.successCheck;
      const element = page.locator(selector).first();
      await element.waitFor({ state: 'visible', timeout: 10000 });

      if (expectedText) {
        const text = await element.innerText();
        if (!text.includes(expectedText)) {
          throw new Error(
            `ログイン成功チェック失敗: "${selector}" のテキストが "${expectedText}" を含みません。実際: "${text}"`
          );
        }
      }
      logger.info('ログイン成功を確認しました');
    }

    // storageState を保存
    await context.storageState({ path: cachePath });
    logger.info(`認証状態を保存しました: ${cachePath}`);

    return cachePath;
  } finally {
    await browser.close();
  }
}

/** 単一の認証ステップを実行する */
async function executeAuthStep(
  page: import('playwright').Page,
  step: AuthStep,
  logger: Logger
): Promise<void> {
  logger.verbose(`認証ステップ実行: ${step.action}`);

  switch (step.action) {
    case 'fill':
      await page.locator(step.selector).fill(step.value);
      break;
    case 'click':
      await page.locator(step.selector).click();
      break;
    case 'check':
      await page.locator(step.selector).check();
      break;
    case 'select':
      await page.locator(step.selector).selectOption(step.value);
      break;
    case 'waitForNavigation':
      await page.waitForLoadState('networkidle');
      break;
    case 'waitForSelector':
      await page.locator(step.selector).waitFor({ state: 'visible' });
      break;
    case 'wait':
      await new Promise(resolve => setTimeout(resolve, step.milliseconds));
      break;
  }
}
