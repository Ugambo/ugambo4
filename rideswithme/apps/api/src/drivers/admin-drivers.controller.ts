import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type {
  AdminDriverDetail,
  AdminDriverListItem,
  DocumentViewUrl,
  DriverDocumentView,
  Paginated,
} from '@rideswithme/shared-types';
import {
  approveDocumentSchema,
  listDriversQuerySchema,
  rejectDocumentSchema,
  rejectWithReasonSchema,
  uuidSchema,
} from '@rideswithme/validation';
import type { z } from 'zod';
import { CurrentPrincipal, type Principal, RequirePermissions } from '../auth/principal';
import { ReqContext, type RequestContext } from '../common/request-context';
import { zod } from '../common/zod-validation.pipe';
import { AdminDriversService } from './admin-drivers.service';

@Controller('v1/admin/drivers')
export class AdminDriversController {
  constructor(private readonly drivers: AdminDriversService) {}

  @Get()
  @RequirePermissions('drivers.read')
  list(
    @Query(zod(listDriversQuerySchema)) q: z.output<typeof listDriversQuerySchema>,
  ): Promise<Paginated<AdminDriverListItem>> {
    return this.drivers.list(q);
  }

  @Get(':id')
  @RequirePermissions('drivers.read')
  detail(@Param('id', zod(uuidSchema)) id: string): Promise<AdminDriverDetail> {
    return this.drivers.detail(id);
  }

  @Post(':id/documents/:documentId/view-url')
  @HttpCode(200)
  @RequirePermissions('drivers.documents_view')
  viewUrl(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Param('documentId', zod(uuidSchema)) documentId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<DocumentViewUrl> {
    return this.drivers.documentUrl({ userId: p.userId, context: ctx }, id, documentId);
  }

  @Post(':id/documents/:documentId/approve')
  @HttpCode(200)
  @RequirePermissions('drivers.verify')
  approveDocument(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Param('documentId', zod(uuidSchema)) documentId: string,
    @Body(zod(approveDocumentSchema)) body: z.output<typeof approveDocumentSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<DriverDocumentView> {
    return this.drivers.approveDocument(
      { userId: p.userId, context: ctx },
      id,
      documentId,
      body.expiresOn,
    );
  }

  @Post(':id/documents/:documentId/reject')
  @HttpCode(200)
  @RequirePermissions('drivers.verify')
  rejectDocument(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Param('documentId', zod(uuidSchema)) documentId: string,
    @Body(zod(rejectDocumentSchema)) body: z.output<typeof rejectDocumentSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<DriverDocumentView> {
    return this.drivers.rejectDocument(
      { userId: p.userId, context: ctx },
      id,
      documentId,
      body.reason,
      body.withdrawApproval,
    );
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('drivers.verify')
  approve(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<AdminDriverDetail> {
    return this.drivers.approveDriver({ userId: p.userId, context: ctx }, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions('drivers.verify')
  reject(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(rejectWithReasonSchema)) body: z.output<typeof rejectWithReasonSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<AdminDriverDetail> {
    return this.drivers.rejectDriver({ userId: p.userId, context: ctx }, id, body.reason);
  }
}
