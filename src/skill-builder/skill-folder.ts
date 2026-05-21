import fs from 'node:fs';
import path from 'node:path';
import { type CrawlReport } from '../types.js';

interface SkillPage {
  filename: string;
  title: string;
  markdown: string;
}

interface BuildSkillFolderOptions {
  skillName: string;
  outputDir: string;
  startUrl: string;
  pages: SkillPage[];
  ragStats: { totalChunks: number; textChunks: number; ocrChunks: number };
  tempRagIndexPath?: string;
  report: CrawlReport;
  tempImagesDir?: string;
}

/**
 * Skillフォルダを生成する（同名フォルダが存在する場合は上書き）
 */
export function buildSkillFolder(options: BuildSkillFolderOptions): void {
  const { skillName, outputDir, startUrl, pages, ragStats, tempRagIndexPath, report, tempImagesDir } = options;

  // 同名フォルダが存在する場合は削除して再作成
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true });
  }

  const refsDir = path.join(outputDir, 'references');
  const imagesDir = path.join(outputDir, 'images');
  const ragDir = path.join(outputDir, 'rag');

  fs.mkdirSync(refsDir, { recursive: true });
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.mkdirSync(ragDir, { recursive: true });

  // 一時画像ディレクトリから画像を移動
  if (tempImagesDir && fs.existsSync(tempImagesDir)) {
    const files = fs.readdirSync(tempImagesDir);
    for (const file of files) {
      fs.renameSync(
        path.join(tempImagesDir, file),
        path.join(imagesDir, file)
      );
    }
    // 空になった一時ディレクトリを削除
    fs.rmdirSync(tempImagesDir);
  }

  // 各ページのMarkdownを保存
  for (const page of pages) {
    const filePath = path.join(refsDir, page.filename);
    fs.writeFileSync(filePath, page.markdown, 'utf-8');
  }

  // RAGインデックスを移動
  if (tempRagIndexPath && fs.existsSync(tempRagIndexPath)) {
    fs.renameSync(
      tempRagIndexPath,
      path.join(ragDir, 'index.jsonl')
    );
  }

  // クロールレポートを保存
  fs.writeFileSync(
    path.join(outputDir, 'crawl-report.json'),
    JSON.stringify(report, null, 2),
    'utf-8'
  );

  // SKILL.md を生成
  const skillMd = generateSkillMd(skillName, startUrl, pages, ragStats, report);
  fs.writeFileSync(path.join(outputDir, 'SKILL.md'), skillMd, 'utf-8');
}

/** SKILL.md の内容を生成する */
function generateSkillMd(
  skillName: string,
  startUrl: string,
  pages: SkillPage[],
  ragStats: { totalChunks: number; textChunks: number; ocrChunks: number },
  report: CrawlReport
): string {
  const pageList = pages
    .map(p => `- [${p.title || p.filename}](references/${p.filename})`)
    .join('\n');

  return `---
name: ${skillName}
description: |
  ${startUrl} をクロールして生成したリファレンス集。
  ${pages.length} ページのコンテンツを収録。
---

# ${skillName} — Skill Reference

- クロール日時: ${report.startedAt}
- 起点URL: ${startUrl}
- 収録ページ数: ${pages.length}
- 画像数: ${report.imagesDownloaded}

## 使用方法

このSkillフォルダを \`.agents/skills/${skillName}/\` にコピーするだけで参照可能です。

### AIエージェントへの指示（Prompt）
本Skillを利用するAIエージェントは以下の指示に必ず従ってください：
1. **検索の拡張**: ユーザーの指示が短い・または曖昧な場合でも、意図を拡張・具体化して広範に関連情報を検索すること。
2. **検索ツールの駆使**: 情報を探す際は、ディレクトリに対する \`grep_search\` ツール（Grep）や、後述の \`rag/index.jsonl\` を用いたインデックス検索を駆使して徹底的に調査すること。
3. **参照元の明記**: ユーザーに情報を提供する際は、見つかった情報の根拠となるページの「参照元ファイルパス」（例: \`references/xxx.md\`）を必ず明示的に表示し、リンクすること。

## 収録ページ一覧

${pageList}

## RAGインデックス

テキストおよび画像OCR結果のRAGインデックスは [rag/index.jsonl](rag/index.jsonl) に格納されています。
全 ${ragStats.totalChunks} チャンク（テキスト: ${ragStats.textChunks}, OCR: ${ragStats.ocrChunks}）を収録。

## クロールレポート

詳細は [crawl-report.json](crawl-report.json) を参照してください。
成功: ${report.succeeded} / 合計: ${report.totalRequests} リクエスト
`;
}
