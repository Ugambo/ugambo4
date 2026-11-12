import { describe, expect, it, vi } from 'vitest';
import { ApiError, type ApiClient } from '@rideswithme/api-client';
import { uploadDocument } from './upload';

const ticket = (n: number) => ({
  uploadId: `00000000-0000-4000-8000-00000000000${n}`,
  uploadUrl: `https://storage/${n}`,
  method: 'PUT' as const,
  headers: {},
  expiresAt: '',
});
const doc = { id: 'd1', documentType: 'profile_photo', status: 'pending' };

function fakeDriver(overrides: Partial<ApiClient['driver']> = {}) {
  let n = 0;
  return {
    requestUpload: vi.fn(async () => ticket(++n)),
    uploadToStorage: vi.fn(async () => undefined),
    submitDocument: vi.fn(async () => doc),
    ...overrides,
  } as unknown as ApiClient['driver'] & Record<string, ReturnType<typeof vi.fn>>;
}

const file = { body: new Blob(['x']), contentType: 'image/jpeg' as const, sizeBytes: 1 };
const noSleep = async () => undefined;

describe('uploadDocument', () => {
  it('requests a ticket, uploads, then attaches with number and expiry', async () => {
    const driver = fakeDriver();
    const stages: string[] = [];
    await uploadDocument(driver, {
      documentType: 'drivers_licence',
      file,
      documentNumber: 'ABC123',
      expiresOn: '2028-01-01',
      onStage: (s) => stages.push(s),
      sleep: noSleep,
    });
    expect(stages).toEqual(['requesting', 'uploading', 'saving']);
    expect(driver.submitDocument).toHaveBeenCalledWith({
      uploadId: ticket(1).uploadId,
      documentNumber: 'ABC123',
      expiresOn: '2028-01-01',
    });
  });

  it('retries network failures with backoff', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'))
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'))
      .mockResolvedValueOnce(undefined);
    const sleep = vi.fn(async (_ms: number) => undefined);
    const driver = fakeDriver({ uploadToStorage: upload });
    await uploadDocument(driver, { documentType: 'profile_photo', file, sleep });
    expect(upload).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it('gets a fresh signed URL when storage rejects the old one', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(403, 'UPLOAD_INVALID', 'expired'))
      .mockResolvedValueOnce(undefined);
    const driver = fakeDriver({ uploadToStorage: upload });
    await uploadDocument(driver, { documentType: 'profile_photo', file, sleep: noSleep });
    expect(driver.requestUpload).toHaveBeenCalledTimes(2);
    expect(driver.submitDocument).toHaveBeenCalledWith({ uploadId: ticket(2).uploadId });
  });

  it('does not retry validation errors', async () => {
    const submit = vi.fn().mockRejectedValue(new ApiError(422, 'VALIDATION_FAILED', 'bad'));
    const driver = fakeDriver({ submitDocument: submit });
    await expect(
      uploadDocument(driver, { documentType: 'profile_photo', file, sleep: noSleep }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
