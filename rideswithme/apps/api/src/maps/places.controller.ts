import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { Kysely } from 'kysely';
import {
  ErrorCode,
  type Place,
  type PlaceSuggestion,
  type SavedPlace,
} from '@rideswithme/shared-types';
import {
  autocompleteQuerySchema,
  placeDetailsQuerySchema,
  reverseGeocodeQuerySchema,
  savedPlaceSchema,
  uuidSchema,
} from '@rideswithme/validation';
import type { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../auth/principal';
import { AppException } from '../common/app-exception';
import { languageFromHeader } from '../common/language';
import { zod } from '../common/zod-validation.pipe';
import { DB, isUniqueViolation } from '../database/database.module';
import { latOf, lngOf, point } from '../database/geo';
import type { Database } from '../database/types';
import { MapsService } from './maps.service';

const MAX_SAVED_PLACES = 20;

@Controller('v1')
export class PlacesController {
  constructor(
    private readonly maps: MapsService,
    @Inject(DB) private readonly db: Kysely<Database>,
  ) {}

  @Get('places/autocomplete')
  autocomplete(
    @CurrentPrincipal() p: Principal,
    @Query(zod(autocompleteQuerySchema)) q: z.output<typeof autocompleteQuerySchema>,
    @Headers('accept-language') lang?: string,
  ): Promise<PlaceSuggestion[]> {
    const near =
      q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined;
    return this.maps.autocomplete(p.userId, q.q, languageFromHeader(lang), near, q.sessionToken);
  }

  @Get('places/details/:placeId')
  async details(
    @CurrentPrincipal() p: Principal,
    @Param('placeId') placeId: string,
    @Query(zod(placeDetailsQuerySchema)) q: z.output<typeof placeDetailsQuerySchema>,
    @Headers('accept-language') lang?: string,
  ): Promise<Place> {
    if (!/^[A-Za-z0-9:_-]{1,300}$/.test(placeId))
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Invalid place id');
    const place = await this.maps.placeDetails(
      p.userId,
      placeId,
      languageFromHeader(lang),
      q.sessionToken,
    );
    if (!place) throw new AppException(ErrorCode.NOT_FOUND, 'Place not found');
    return place;
  }

  @Get('places/reverse')
  reverse(
    @CurrentPrincipal() p: Principal,
    @Query(zod(reverseGeocodeQuerySchema)) q: z.output<typeof reverseGeocodeQuerySchema>,
    @Headers('accept-language') lang?: string,
  ): Promise<Place> {
    return this.maps.reverseGeocode(p.userId, { lat: q.lat, lng: q.lng }, languageFromHeader(lang));
  }

  @Get('me/saved-places')
  async listSaved(@CurrentPrincipal() p: Principal): Promise<SavedPlace[]> {
    const rows = await this.db
      .selectFrom('saved_places')
      .select([
        'id',
        'label',
        'name',
        'address',
        'place_id',
        latOf('location').as('lat'),
        lngOf('location').as('lng'),
      ])
      .where('user_id', '=', p.userId)
      .orderBy('label')
      .orderBy('created_at')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      name: r.name,
      address: r.address,
      placeId: r.place_id,
      location: { lat: r.lat, lng: r.lng },
    }));
  }

  /** Saves a place. Saving "home" or "work" again replaces the previous one. */
  @Post('me/saved-places')
  async save(
    @CurrentPrincipal() p: Principal,
    @Body(zod(savedPlaceSchema)) body: z.output<typeof savedPlaceSchema>,
  ): Promise<SavedPlace> {
    const id = await this.db.transaction().execute(async (trx) => {
      if (body.label !== 'other') {
        await trx
          .deleteFrom('saved_places')
          .where('user_id', '=', p.userId)
          .where('label', '=', body.label)
          .execute();
      } else {
        const { n } = await trx
          .selectFrom('saved_places')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('user_id', '=', p.userId)
          .executeTakeFirstOrThrow();
        if (Number(n) >= MAX_SAVED_PLACES) {
          throw new AppException(
            ErrorCode.CONFLICT,
            `You can save up to ${MAX_SAVED_PLACES} places`,
          );
        }
      }
      try {
        const row = await trx
          .insertInto('saved_places')
          .values({
            user_id: p.userId,
            label: body.label,
            name: body.name,
            address: body.address,
            location: point(body.location),
            place_id: body.placeId ?? null,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        return row.id;
      } catch (err) {
        if (isUniqueViolation(err)) throw new AppException(ErrorCode.CONFLICT, 'Already saved');
        throw err;
      }
    });
    return {
      id,
      label: body.label,
      name: body.name,
      address: body.address,
      location: body.location,
      placeId: body.placeId ?? null,
    };
  }

  @Delete('me/saved-places/:id')
  @HttpCode(204)
  async remove(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<void> {
    const res = await this.db
      .deleteFrom('saved_places')
      .where('id', '=', id)
      .where('user_id', '=', p.userId)
      .executeTakeFirst();
    if (res.numDeletedRows === 0n)
      throw new AppException(ErrorCode.NOT_FOUND, 'Saved place not found');
  }
}
