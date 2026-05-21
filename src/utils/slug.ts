import path from 'node:path';
import crypto from 'node:crypto';
import slugify from 'slugify';

/**
 * URLのパス部分を安全なMarkdownファイル名に変換する（同期版）
 *
 * 変換ルール:
 * 1. クエリパラメータ・フラグメントを除去
 * 2. パスの先頭・末尾の "/" を除去
 * 3. "/" を "--" に変換（各セグメントをスラッグ化）
 * 4. 空の場合は "index"
 * 5. .md 拡張子を付与
 * 6. 250文字超過時はSHA-256先頭16桁に置換
 */
export function urlToFilename(url: string): string {
  let urlPath: string;

  try {
    const parsed = new URL(url);
    urlPath = parsed.pathname;
  } catch {
    urlPath = url;
  }

  // 既存の拡張子・先頭末尾スラッシュを除去
  const cleanPath = urlPath
    .replace(/\.[^./]+$/, '')
    .replace(/^\/+|\/+$/g, '');

  if (!cleanPath) return 'index.md';

  // / を -- に変換し、各セグメントをスラッグ化
  const segments = cleanPath.split('/').map(seg =>
    slugify(seg, { lower: true, strict: true, replacement: '-' })
  );
  const slug = segments.filter(Boolean).join('--') || 'index';

  // 250文字を超える場合はハッシュに置換
  if (slug.length > 250) {
    const hash = crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
    return `page-${hash}.md`;
  }

  return `${slug}.md`;
}
