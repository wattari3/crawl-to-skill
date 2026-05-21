// デフォルト値の一元管理

export const DEFAULTS = {
  output: './output',
  crawl: {
    depth: 3,
    maxRequests: 100,
    maxRetries: 3,
    navigationTimeoutSecs: 60,
    requestHandlerTimeoutSecs: 120,
  },
  content: {
    useReadability: true,
    contentSelector: null as string | null,
    removeSelectors: ['nav', 'header', 'footer', 'aside', 'script', 'style', 'noscript', '.cookie-banner', '.ad', '.advertisement'],
  },
  images: {
    download: true,
    maxWidthPx: 2048,
    ocr: true,
    ocrLanguages: ['jpn', 'eng'] as string[],
    excludePatterns: ['**/tracking/**', '**/pixel/**', '**/beacon/**'] as string[],
  },
  rag: {
    chunkSize: 1000,
    chunkOverlap: 200,
    minOcrConfidence: 30,
    maxOcrWorkers: 4,
  },
  auth: {
    storageStateTTLMinutes: 60,
  },
} as const;
