import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type { Kysely } from 'kysely';
import {
  type AdminVehicleCategoryView,
  ErrorCode,
  SETTING_DEFINITIONS,
  SETTING_KEYS,
  type SettingKey,
  type SettingValue,
  type SettingView,
  type SupportContactView,
} from '@rideswithme/shared-types';
import {
  normalizeNigerianPhone,
  type UpdateSettingsInput,
  type UpdateVehicleCategoryInput,
} from '@rideswithme/validation';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import type { RequestContext } from '../common/request-context';
import { APP_CONFIG, type AppConfig, configFieldSchema } from '../config/config';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';

/** How often each API instance picks up changes made through another instance. */
const REFRESH_MS = 30_000;

type Mutable = Record<string, unknown>;

/**
 * System settings changed from the dashboard. A saved value replaces the .env
 * value of the same name on the shared config object, so every service sees it
 * the next time it reads the setting; no restart. Only settings that services
 * read at the moment of use are offered (SETTING_DEFINITIONS). Resetting one
 * deletes its row and returns to the .env value.
 */
@Injectable()
export class SettingsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SettingsService.name);
  /** The .env values, as loaded at start-up. */
  private readonly defaults: Mutable;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {
    const c = config as unknown as Mutable;
    this.defaults = Object.fromEntries(SETTING_KEYS.map((k) => [k, c[k]]));
  }

  async onModuleInit() {
    await this.refresh();
    this.timer = setInterval(
      () =>
        void this.refresh().catch((err: unknown) =>
          this.logger.error({ err }, 'Settings refresh failed'),
        ),
      REFRESH_MS,
    );
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Applies the saved values (and puts back the .env value for any that were reset). */
  async refresh(): Promise<void> {
    const rows = await this.db.selectFrom('system_settings').select(['key', 'value']).execute();
    const saved = new Map(rows.map((r) => [r.key, r.value]));
    const c = this.config as unknown as Mutable;
    for (const key of SETTING_KEYS) {
      const raw = saved.get(key);
      if (raw === undefined) {
        c[key] = this.defaults[key];
        continue;
      }
      const parsed = configFieldSchema(key)?.safeParse(raw);
      if (parsed?.success) c[key] = parsed.data;
      else {
        c[key] = this.defaults[key];
        this.logger.warn({ key }, 'Saved setting is no longer valid; using the .env value');
      }
    }
  }

  async list(): Promise<SettingView[]> {
    const rows = await this.db
      .selectFrom('system_settings as s')
      .leftJoin('users as u', 'u.id', 's.updated_by')
      .select(['s.key', 's.updated_at', 's.updated_by', 'u.full_name'])
      .execute();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const c = this.config as unknown as Mutable;
    return SETTING_KEYS.map((key) => {
      const row = byKey.get(key);
      return {
        key,
        ...SETTING_DEFINITIONS[key],
        value: toView(c[key]),
        defaultValue: toView(this.defaults[key]),
        changed: row !== undefined,
        updatedAt: row?.updated_at.toISOString() ?? null,
        updatedBy: row?.updated_by ? { id: row.updated_by, name: row.full_name } : null,
      };
    });
  }

  async update(
    input: UpdateSettingsInput,
    actor: { userId: string },
    ctx: Partial<RequestContext>,
  ): Promise<SettingView[]> {
    const c = this.config as unknown as Mutable;
    const next: Mutable = {};
    const raws = new Map<SettingKey, string | null>();
    const problems: { path: string; message: string }[] = [];

    for (const [key, given] of Object.entries(input.values) as [SettingKey, SettingValue][]) {
      // Staff may type local numbers (0803...); the rule wants +234....
      const value =
        SETTING_DEFINITIONS[key].unit === 'phones' && Array.isArray(given)
          ? given.map((p) => normalizeNigerianPhone(p) ?? p)
          : given;
      const raw = toRaw(value);
      if (raw === null) {
        // Back to the .env value; a setting the .env leaves unset becomes unset again.
        raws.set(key, null);
        next[key] = this.defaults[key];
        continue;
      }
      const parsed = configFieldSchema(key)?.safeParse(raw);
      if (!parsed?.success) {
        problems.push({
          path: `values.${key}`,
          message: parsed?.error.issues[0]?.message ?? 'Not a valid value',
        });
        continue;
      }
      raws.set(key, raw);
      next[key] = parsed.data;
    }

    const after = { ...c, ...next };
    const num = (k: SettingKey) => after[k] as number;
    if (num('WALLET_TOPUP_MIN_KOBO') > num('WALLET_TOPUP_MAX_KOBO'))
      problems.push({
        path: 'values.WALLET_TOPUP_MIN_KOBO',
        message: 'Must not be more than the largest top-up',
      });
    if (num('WALLET_TOPUP_MAX_KOBO') > num('WALLET_MAX_BALANCE_KOBO'))
      problems.push({
        path: 'values.WALLET_TOPUP_MAX_KOBO',
        message: 'Must not be more than the largest wallet balance',
      });
    if (num('OFFER_TIMEOUT_SECONDS') >= num('SEARCH_TIMEOUT_SECONDS'))
      problems.push({
        path: 'values.OFFER_TIMEOUT_SECONDS',
        message: 'Must be shorter than the time spent searching for a driver',
      });
    if (problems.length)
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Some settings are not valid', {
        details: problems,
      });

    const changes: Record<string, { from: SettingValue; to: SettingValue }> = {};
    for (const key of raws.keys()) {
      const from = toView(c[key]);
      const to = toView(next[key]);
      if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to };
    }

    await this.db.transaction().execute(async (trx) => {
      for (const [key, raw] of raws) {
        if (raw === null) {
          await trx.deleteFrom('system_settings').where('key', '=', key).execute();
          continue;
        }
        await trx
          .insertInto('system_settings')
          .values({ key, value: JSON.stringify(raw), updated_by: actor.userId })
          .onConflict((oc) =>
            oc.column('key').doUpdateSet({
              value: JSON.stringify(raw),
              updated_by: actor.userId,
              updated_at: new Date(),
            }),
          )
          .execute();
      }
      if (Object.keys(changes).length)
        await this.audit.record(
          {
            actor: { type: 'user', userId: actor.userId },
            action: 'admin.settings.updated',
            metadata: { changes, reason: input.reason },
            context: ctx,
          },
          trx,
        );
    });
    await this.refresh();
    return this.list();
  }

  supportContact(): SupportContactView {
    return {
      phone: this.config.SUPPORT_PHONE ?? null,
      email: this.config.SUPPORT_EMAIL ?? null,
    };
  }

  // --- Vehicle types ---

  async vehicleCategories(): Promise<AdminVehicleCategoryView[]> {
    const rows = await this.db
      .selectFrom('vehicle_categories as c')
      .leftJoin('fare_rules as f', (j) =>
        j.onRef('f.vehicle_category_id', '=', 'c.id').on('f.is_active', '=', true),
      )
      .select(({ fn }) => [
        'c.id',
        'c.key',
        'c.name',
        'c.description',
        'c.seats',
        'c.is_enabled',
        fn.count<string>('f.service_area_id').distinct().as('areas'),
      ])
      .groupBy('c.id')
      .orderBy('c.sort_order')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      seats: r.seats,
      isEnabled: r.is_enabled,
      areasWithFares: Number(r.areas),
    }));
  }

  async updateVehicleCategory(
    key: string,
    input: UpdateVehicleCategoryInput,
    actor: { userId: string },
    ctx: Partial<RequestContext>,
  ): Promise<AdminVehicleCategoryView[]> {
    await this.db.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom('vehicle_categories')
        .select(['id', 'name', 'description', 'seats', 'is_enabled'])
        .where('key', '=', key)
        .forUpdate()
        .executeTakeFirst();
      if (!current) throw new AppException(ErrorCode.NOT_FOUND, 'Vehicle type not found');
      await trx
        .updateTable('vehicle_categories')
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.seats !== undefined && { seats: input.seats }),
          ...(input.isEnabled !== undefined && { is_enabled: input.isEnabled }),
        })
        .where('id', '=', current.id)
        .execute();
      await this.audit.record(
        {
          actor: { type: 'user', userId: actor.userId },
          action: 'admin.vehicle_category.updated',
          target: { type: 'vehicle_category', id: current.id },
          metadata: { key, ...input },
          context: ctx,
        },
        trx,
      );
    });
    return this.vehicleCategories();
  }
}

/** A config value as the dashboard shows it. */
function toView(v: unknown): SettingValue {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  return String(v);
}

/** A value from the dashboard in the .env text form its rule expects; null for "reset". */
function toRaw(v: SettingValue): string | null {
  if (v === null) return null;
  if (Array.isArray(v)) {
    const list = v.map((x) => x.trim()).filter(Boolean);
    return list.length ? list.join(',') : '';
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = v.trim();
  return s === '' ? null : s;
}
