import { z } from 'zod';
import { DEFAULTS } from './defaults.js';

// 認証ステップのスキーマ
const AuthStepSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('fill'), selector: z.string(), value: z.string() }),
  z.object({ action: z.literal('click'), selector: z.string() }),
  z.object({ action: z.literal('check'), selector: z.string() }),
  z.object({ action: z.literal('select'), selector: z.string(), value: z.string() }),
  z.object({ action: z.literal('waitForNavigation') }),
  z.object({ action: z.literal('waitForSelector'), selector: z.string() }),
  z.object({ action: z.literal('wait'), milliseconds: z.number().int().positive() }),
]);

// 認証設定スキーマ
const AuthConfigSchema = z.object({
  loginUrl: z.string().url(),
  steps: z.array(AuthStepSchema),
  successCheck: z.object({
    selector: z.string(),
    expectedText: z.string().optional(),
  }).optional(),
  storageStateTTLMinutes: z.number().int().positive()
    .default(DEFAULTS.auth.storageStateTTLMinutes),
}).optional();

// クロール設定スキーマ
const CrawlOptionsSchema = z.object({
  depth: z.number().int().min(0).optional(),
  maxRequests: z.number().int().positive().optional(),
  globs: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  maxRetries: z.number().int().min(0)
    .default(DEFAULTS.crawl.maxRetries),
  navigationTimeoutSecs: z.number().int().positive()
    .default(DEFAULTS.crawl.navigationTimeoutSecs),
  requestHandlerTimeoutSecs: z.number().int().positive()
    .default(DEFAULTS.crawl.requestHandlerTimeoutSecs),
}).default({});

// コンテンツ設定スキーマ
const ContentOptionsSchema = z.object({
  useReadability: z.boolean().default(DEFAULTS.content.useReadability),
  contentSelector: z.string().nullable().default(DEFAULTS.content.contentSelector),
  removeSelectors: z.array(z.string()).default([...DEFAULTS.content.removeSelectors]),
}).default({});

// 画像設定スキーマ
const ImageOptionsSchema = z.object({
  download: z.boolean().default(DEFAULTS.images.download),
  maxWidthPx: z.number().int().positive().default(DEFAULTS.images.maxWidthPx),
  ocr: z.boolean().default(DEFAULTS.images.ocr),
  ocrLanguages: z.array(z.string()).default([...DEFAULTS.images.ocrLanguages]),
  excludePatterns: z.array(z.string()).default([...DEFAULTS.images.excludePatterns]),
}).default({});

// RAG設定スキーマ
const RagOptionsSchema = z.object({
  chunkSize: z.number().int().positive().default(DEFAULTS.rag.chunkSize),
  chunkOverlap: z.number().int().min(0).default(DEFAULTS.rag.chunkOverlap),
  minOcrConfidence: z.number().int().min(0).max(100).default(DEFAULTS.rag.minOcrConfidence),
  maxOcrWorkers: z.number().int().positive().default(DEFAULTS.rag.maxOcrWorkers),
}).default({});

// メイン設定スキーマ
export const ConfigSchema = z.object({
  name: z.string().min(1).optional(),
  startUrls: z.array(z.string().url()).min(1).optional(),
  output: z.string().default(DEFAULTS.output),
  crawl: CrawlOptionsSchema,
  content: ContentOptionsSchema,
  images: ImageOptionsSchema,
  rag: RagOptionsSchema,
  auth: AuthConfigSchema,
}).strict();

export type CrawlConfig = z.infer<typeof ConfigSchema>;
export type AuthStep = z.infer<typeof AuthStepSchema>;

