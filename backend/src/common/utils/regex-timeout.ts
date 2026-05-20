import { Worker } from 'worker_threads';

interface RegexWorkerPayload {
  input: string;
  pattern: string;
}

interface RegexWorkerResult {
  result?: boolean;
  error?: string;
}

const workerScript = `
  const { parentPort } = require('worker_threads');
  parentPort.on('message', (payload) => {
    try {
      const re = new RegExp(payload.pattern);
      const result = re.test(payload.input);
      parentPort.postMessage({ result });
    } catch (error) {
      parentPort.postMessage({ error: error.message || 'regex error' });
    }
  });
`;

export function safeRegexTest(
  input: string,
  pattern: string,
  timeoutMs = 100,
): Promise<boolean> {
  return new Promise((resolve) => {
    const worker = new Worker(workerScript, { eval: true });
    let settled = false;
    let timer: NodeJS.Timeout;

    const finish = (result: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      void worker.terminate().finally(() => resolve(result));
    };

    timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref();

    worker.once('message', (message: RegexWorkerResult) => {
      finish(typeof message.error === 'string' ? false : Boolean(message.result));
    });

    worker.once('error', () => finish(false));

    worker.postMessage({ input, pattern } satisfies RegexWorkerPayload);
  });
}
