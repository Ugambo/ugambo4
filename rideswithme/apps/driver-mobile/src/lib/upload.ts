import { ApiError, type ApiClient } from '@rideswithme/api-client';
import type {
  DocumentType,
  DriverDocumentView,
  UploadContentType,
} from '@rideswithme/shared-types';

export interface PreparedFile {
  /** File body ready to PUT (a Blob in React Native). */
  body: Blob;
  contentType: UploadContentType;
  sizeBytes: number;
}

export type UploadStage = 'requesting' | 'uploading' | 'saving';

export interface UploadOptions {
  documentType: DocumentType;
  file: PreparedFile;
  documentNumber?: string;
  expiresOn?: string;
  onStage?: (stage: UploadStage) => void;
  /** Attempts per step for network failures (default 3). */
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

const isRetryable = (err: unknown) =>
  err instanceof ApiError && (err.status === 0 || err.status >= 500 || err.code === 'RATE_LIMITED');

/**
 * Uploads a document the way flaky mobile data needs: ask for a signed URL, PUT
 * the file straight to storage, then attach it. Network failures are retried
 * with backoff; if the storage step keeps failing (e.g. the signed URL expired
 * while the phone was offline) a fresh URL is requested. Validation errors are
 * not retried.
 */
export async function uploadDocument(
  driver: ApiClient['driver'],
  opts: UploadOptions,
): Promise<DriverDocumentView> {
  const attempts = opts.attempts ?? 3;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let i = 1; ; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i >= attempts || !isRetryable(err)) throw err;
        await sleep(1000 * 2 ** (i - 1));
      }
    }
  }

  for (let round = 1; ; round++) {
    opts.onStage?.('requesting');
    const ticket = await withRetry(() =>
      driver.requestUpload({
        documentType: opts.documentType,
        contentType: opts.file.contentType,
        sizeBytes: opts.file.sizeBytes,
      }),
    );
    opts.onStage?.('uploading');
    try {
      await withRetry(() => driver.uploadToStorage(ticket, opts.file.body));
    } catch (err) {
      // Storage refused the signed request (expired or rejected): start again with a new ticket once.
      if (round < 2 && err instanceof ApiError && err.status >= 400 && err.status < 500) continue;
      throw err;
    }
    opts.onStage?.('saving');
    return withRetry(() =>
      driver.submitDocument({
        uploadId: ticket.uploadId,
        ...(opts.documentNumber && { documentNumber: opts.documentNumber }),
        ...(opts.expiresOn && { expiresOn: opts.expiresOn }),
      }),
    );
  }
}
