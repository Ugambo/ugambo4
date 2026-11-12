import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ErrorCode } from '@rideswithme/shared-types';
import { AppException } from '../common/app-exception';
import { APP_CONFIG, type AppConfig } from '../config/config';

export interface ObjectInfo {
  sizeBytes: number;
  contentType: string | null;
}

/**
 * Private S3-compatible storage (AWS S3, MinIO, DigitalOcean Spaces, Cloudflare R2).
 * Nothing is public: clients get short-lived signed URLs for one upload or one view.
 */
@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly internal: S3Client;
  private readonly signer: S3Client;
  private readonly bucket: string;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const base = {
      region: config.S3_REGION,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      },
      // Only send checksums when the operation requires them; several S3-compatible
      // services reject the newer default checksum headers on presigned uploads.
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
    };
    this.internal = new S3Client({
      ...base,
      ...(config.S3_ENDPOINT && { endpoint: config.S3_ENDPOINT }),
    });
    const publicEndpoint = config.S3_PUBLIC_ENDPOINT ?? config.S3_ENDPOINT;
    this.signer = new S3Client({ ...base, ...(publicEndpoint && { endpoint: publicEndpoint }) });
    this.bucket = config.S3_BUCKET;
  }

  async onModuleInit() {
    if (!this.config.S3_CREATE_BUCKET) return;
    try {
      await this.internal.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.internal.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created bucket ${this.bucket}`);
    }
  }

  /** Signed PUT URL. The client must send exactly the returned headers. */
  async presignUpload(key: string, contentType: string, contentLength: number) {
    const sse =
      this.config.S3_SERVER_SIDE_ENCRYPTION === 'AES256' ? ('AES256' as const) : undefined;
    const url = await this.wrap(() =>
      getSignedUrl(
        this.signer,
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: contentType,
          ContentLength: contentLength,
          ...(sse && { ServerSideEncryption: sse }),
        }),
        {
          expiresIn: this.config.UPLOAD_URL_TTL_SECONDS,
          // Make these headers part of the signature so they cannot be changed.
          signableHeaders: new Set([
            'content-type',
            'content-length',
            ...(sse ? ['x-amz-server-side-encryption'] : []),
          ]),
          unhoistableHeaders: new Set(sse ? ['x-amz-server-side-encryption'] : []),
        },
      ),
    );
    const headers: Record<string, string> = { 'Content-Type': contentType };
    if (sse) headers['x-amz-server-side-encryption'] = sse;
    return { url, headers };
  }

  /** Signed GET URL for viewing a private object inline. */
  presignView(key: string, contentType: string) {
    return this.wrap(() =>
      getSignedUrl(
        this.signer,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ResponseContentType: contentType,
          ResponseContentDisposition: 'inline',
          ResponseCacheControl: 'private, no-store',
        }),
        { expiresIn: this.config.DOWNLOAD_URL_TTL_SECONDS },
      ),
    );
  }

  /** Size and type of an uploaded object, or null if it does not exist. */
  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const res = await this.internal.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { sizeBytes: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw this.unavailable(err);
    }
  }

  /** First bytes of an object, for content sniffing. */
  async readHead(key: string, bytes = 16): Promise<Buffer> {
    const res = await this.wrap(() =>
      this.internal.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
      ),
    );
    const body = await res.Body?.transformToByteArray();
    return Buffer.from(body ?? []);
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw this.unavailable(err);
    }
  }

  private unavailable(err: unknown) {
    this.logger.error({ err }, 'Object storage request failed');
    return new AppException(ErrorCode.STORAGE_UNAVAILABLE, 'Object storage is unavailable', {
      status: 503,
    });
  }
}
