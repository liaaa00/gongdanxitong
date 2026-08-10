import { describe, expect, it } from 'vitest';
import { readDownloadError } from './dispatchedOrders';

describe('离职证明下载错误消息', () => {
  it('returns the backend JSON business message', async () => {
    const response = new Response(JSON.stringify({
      message: '选择第 4 项原因时必须填写适用的劳动合同法条款',
    }), { status: 400 });

    await expect(readDownloadError(response, '离职证明导出失败')).resolves.toBe(
      '选择第 4 项原因时必须填写适用的劳动合同法条款',
    );
  });

  it('includes the status code when the response body is empty', async () => {
    const response = new Response('', { status: 500 });

    await expect(readDownloadError(response, '离职证明导出失败')).resolves.toBe(
      '离职证明导出失败 (500)',
    );
  });
});
