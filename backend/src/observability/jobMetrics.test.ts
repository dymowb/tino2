import { getJobMetrics, instrumentJob } from './jobMetrics';

describe('job metrics', () => {
  test('records success and failure without swallowing errors', async () => {
    await expect(instrumentJob('successful-test-job', async () => 3)).resolves.toBe(3);
    expect(getJobMetrics()['successful-test-job']).toMatchObject({ success: true });

    await expect(
      instrumentJob('failed-test-job', async () => {
        throw new Error('expected');
      })
    ).rejects.toThrow('expected');
    expect(getJobMetrics()['failed-test-job']).toMatchObject({ success: false });
  });
});
