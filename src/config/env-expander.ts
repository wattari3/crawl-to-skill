/**
 * 文字列中の ${ENV_VAR} 形式を process.env から展開するユーティリティ
 * 未定義の環境変数は即時エラーとする
 */

export function expandEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, varName: string) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      throw new Error(
        `環境変数 "${varName}" が未定義です。設定ファイル内の \${${varName}} を展開できません。`
      );
    }
    return envValue;
  });
}

/**
 * オブジェクトのすべての文字列値に対して環境変数展開を再帰的に適用する
 */
export function expandEnvVarsDeep<T>(obj: T): T {
  if (typeof obj === 'string') {
    return expandEnvVars(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(expandEnvVarsDeep) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = expandEnvVarsDeep(value);
    }
    return result as T;
  }
  return obj;
}
