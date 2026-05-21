import ora, { type Ora } from 'ora';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  verbose(message: string): void;
  progress(current: number, total: number): void;
  succeed(message: string): void;
  fail(message: string): void;
}

/**
 * ora スピナーを使ったロガーを生成する
 */
export function createLogger(verbose: boolean): Logger {
  let spinner: Ora | null = null;

  const getSpinner = (): Ora => {
    if (!spinner) {
      spinner = ora({ color: 'cyan' });
    }
    return spinner;
  };

  return {
    info(message: string) {
      if (spinner?.isSpinning) {
        spinner.text = message;
      } else {
        getSpinner().start(message);
      }
    },

    warn(message: string) {
      const sp = getSpinner();
      const wasSpinning = sp.isSpinning;
      if (wasSpinning) sp.stop();
      console.warn(`⚠️  ${message}`);
      if (wasSpinning) sp.start();
    },

    error(message: string) {
      const sp = getSpinner();
      if (sp.isSpinning) sp.stop();
      console.error(`❌ ${message}`);
    },

    verbose(message: string) {
      if (!verbose) return;
      const sp = getSpinner();
      const wasSpinning = sp.isSpinning;
      if (wasSpinning) sp.stop();
      console.log(`   ${message}`);
      if (wasSpinning) sp.start();
    },

    progress(current: number, total: number) {
      getSpinner().text = `クロール中... ${current} / ${total} ページ`;
    },

    succeed(message: string) {
      getSpinner().succeed(message);
      spinner = null;
    },

    fail(message: string) {
      getSpinner().fail(message);
      spinner = null;
    },
  };
}
