import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { type BrandingView, ErrorCode } from '@rideswithme/shared-types';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import type { RequestContext } from '../common/request-context';
import { DB } from '../database/database.module';
import type { BrandingAssetsTable, Database } from '../database/types';

/** Largest logo accepted (the dashboard shrinks it to 512 x 512 before upload). */
export const LOGO_MAX_BYTES = 75_000;

type ImageType = BrandingAssetsTable['content_type'];

/** The image type from the file's first bytes (never trusting the name or a header). SVG is refused: it can carry script. */
export function sniffImage(b: Buffer): ImageType | null {
  if (
    b.length > 8 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length > 12 &&
    b.toString('ascii', 0, 4) === 'RIFF' &&
    b.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

/**
 * The system's logo. One row; none means the built-in "R" mark. Every app
 * asks GET /v1/branding for the version and loads the image from
 * /v1/branding/logo?v=<version>, so a new logo shows at once and the old
 * one can be cached for a long time.
 */
@Injectable()
export class BrandingService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    private readonly audit: AuditService,
  ) {}

  async view(): Promise<BrandingView> {
    const row = await this.db
      .selectFrom('branding_assets')
      .select(['version', 'updated_at'])
      .where('key', '=', 'logo')
      .executeTakeFirst();
    return {
      logoVersion: row?.version ?? null,
      logoPath: row ? `/v1/branding/logo?v=${row.version}` : null,
      updatedAt: row?.updated_at.toISOString() ?? null,
    };
  }

  async logo(): Promise<{ data: Buffer; contentType: string; version: string } | null> {
    const row = await this.db
      .selectFrom('branding_assets')
      .select(['data', 'content_type', 'version'])
      .where('key', '=', 'logo')
      .executeTakeFirst();
    return row ? { data: row.data, contentType: row.content_type, version: row.version } : null;
  }

  async setLogo(
    base64: string,
    actor: { userId: string },
    ctx: Partial<RequestContext>,
  ): Promise<BrandingView> {
    const data = Buffer.from(base64, 'base64');
    if (data.length === 0 || data.length > LOGO_MAX_BYTES)
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `The logo must be at most ${Math.round(LOGO_MAX_BYTES / 1000)} KB`,
        { details: [{ path: 'image', message: 'Too large' }] },
      );
    const contentType = sniffImage(data);
    if (!contentType)
      throw new AppException(ErrorCode.UPLOAD_INVALID, 'Use a PNG, JPEG or WebP image');
    const version = createHash('sha256').update(data).digest('hex').slice(0, 16);
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('branding_assets')
        .values({ key: 'logo', content_type: contentType, data, version, updated_by: actor.userId })
        .onConflict((oc) =>
          oc.column('key').doUpdateSet({
            content_type: contentType,
            data,
            version,
            updated_by: actor.userId,
            updated_at: new Date(),
          }),
        )
        .execute();
      await this.audit.record(
        {
          actor: { type: 'user', userId: actor.userId },
          action: 'admin.branding.logo_changed',
          metadata: { contentType, bytes: data.length, version },
          context: ctx,
        },
        trx,
      );
    });
    return this.view();
  }

  async removeLogo(actor: { userId: string }, ctx: Partial<RequestContext>): Promise<BrandingView> {
    await this.db.transaction().execute(async (trx) => {
      const removed = await trx
        .deleteFrom('branding_assets')
        .where('key', '=', 'logo')
        .executeTakeFirst();
      if (removed.numDeletedRows > 0n)
        await this.audit.record(
          {
            actor: { type: 'user', userId: actor.userId },
            action: 'admin.branding.logo_removed',
            context: ctx,
          },
          trx,
        );
    });
    return this.view();
  }
}
