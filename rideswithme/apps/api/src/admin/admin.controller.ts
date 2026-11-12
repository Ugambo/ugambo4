import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type {
  AdminUserSummary,
  AuditLogEntry,
  Paginated,
  RoleSummary,
} from '@rideswithme/shared-types';
import { ROLE_KEYS } from '@rideswithme/shared-types';
import {
  assignRoleSchema,
  listAuditLogsQuerySchema,
  listUsersQuerySchema,
  suspendUserSchema,
  uuidSchema,
} from '@rideswithme/validation';
import { z } from 'zod';
import { CurrentPrincipal, type Principal, RequirePermissions } from '../auth/principal';
import { ReqContext, type RequestContext } from '../common/request-context';
import { zod } from '../common/zod-validation.pipe';
import { AdminService } from './admin.service';

const roleParam = z.enum(ROLE_KEYS);

@Controller('v1/admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  @RequirePermissions('users.read')
  listUsers(
    @Query(zod(listUsersQuerySchema)) query: z.output<typeof listUsersQuerySchema>,
  ): Promise<Paginated<AdminUserSummary>> {
    return this.admin.listUsers(query);
  }

  @Get('users/:id')
  @RequirePermissions('users.read')
  getUser(@Param('id', zod(uuidSchema)) id: string): Promise<AdminUserSummary> {
    return this.admin.getUser(id);
  }

  @Post('users/:id/roles')
  @HttpCode(200)
  @RequirePermissions('roles.assign')
  assignRole(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(assignRoleSchema)) body: z.output<typeof assignRoleSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<AdminUserSummary> {
    return this.admin.assignRole(
      id,
      body.role,
      { type: 'user', userId: principal.userId, principal },
      ctx,
    );
  }

  @Delete('users/:id/roles/:role')
  @RequirePermissions('roles.assign')
  removeRole(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Param('role', zod(roleParam)) role: z.output<typeof roleParam>,
    @ReqContext() ctx: RequestContext,
  ): Promise<AdminUserSummary> {
    return this.admin.removeRole(
      id,
      role,
      { type: 'user', userId: principal.userId, principal },
      ctx,
    );
  }

  @Post('users/:id/suspend')
  @HttpCode(200)
  @RequirePermissions('users.manage')
  suspend(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(suspendUserSchema)) body: z.output<typeof suspendUserSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<AdminUserSummary> {
    return this.admin.suspend(
      id,
      body.reason,
      { type: 'user', userId: principal.userId, principal },
      ctx,
    );
  }

  @Post('users/:id/reactivate')
  @HttpCode(200)
  @RequirePermissions('users.manage')
  reactivate(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<AdminUserSummary> {
    return this.admin.reactivate(id, { type: 'user', userId: principal.userId, principal }, ctx);
  }

  @Get('roles')
  @RequirePermissions('roles.read')
  listRoles(): Promise<RoleSummary[]> {
    return this.admin.listRoles();
  }

  @Get('audit-logs')
  @RequirePermissions('audit_logs.read')
  listAuditLogs(
    @Query(zod(listAuditLogsQuerySchema)) query: z.output<typeof listAuditLogsQuerySchema>,
  ): Promise<Paginated<AuditLogEntry>> {
    return this.admin.listAuditLogs(query);
  }
}
