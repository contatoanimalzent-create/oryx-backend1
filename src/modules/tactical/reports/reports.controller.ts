import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import type { ZodSchema } from 'zod';
import { z } from 'zod';

import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { classReportToCsv, unitReportToCsv } from './csv';
import { renderClassReport, renderUnitReport } from './pdf';
import { type ClassReport, type UnitReport } from './reports.dto';
import { TacticalReportsService } from './reports.service';

const unitIdParam = z.object({ id: z.string().uuid() });
const classIdParam = z.object({ id: z.string().uuid() });

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

/**
 * Reports surface inherits the rest of tactical's RBAC: ADMIN or
 * INSTRUCTOR. CSV/PDF responses use `@Res({ passthrough: false })`
 * because we set Content-Type and Content-Disposition manually and
 * write a Buffer body — Nest's automatic serialization would mangle
 * binary output. JSON variants stay declarative (return the view, let
 * Nest serialize).
 */
@Controller('tactical')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.INSTRUCTOR)
export class TacticalReportsController {
  constructor(private readonly reports: TacticalReportsService) {}

  // ─── Unit report ────────────────────────────────────────────────────────

  @Get('units/:id/report')
  async unitJson(@Param() params: unknown): Promise<UnitReport> {
    const { id } = parse(unitIdParam, params);
    return this.reports.getUnitReport(id);
  }

  @Get('units/:id/report.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async unitCsv(@Param() params: unknown, @Res() res: Response): Promise<void> {
    const { id } = parse(unitIdParam, params);
    const report = await this.reports.getUnitReport(id);
    res.setHeader('Content-Disposition', `attachment; filename="unit-${id}-report.csv"`);
    res.send(unitReportToCsv(report));
  }

  @Get('units/:id/report.pdf')
  @Header('Content-Type', 'application/pdf')
  async unitPdf(@Param() params: unknown, @Res() res: Response): Promise<void> {
    const { id } = parse(unitIdParam, params);
    const report = await this.reports.getUnitReport(id);
    const buffer = await renderUnitReport(report);
    res.setHeader('Content-Disposition', `attachment; filename="unit-${id}-report.pdf"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }

  // ─── Class report ───────────────────────────────────────────────────────

  @Get('classes/:id/report')
  async classJson(@Param() params: unknown): Promise<ClassReport> {
    const { id } = parse(classIdParam, params);
    return this.reports.getClassReport(id);
  }

  @Get('classes/:id/report.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async classCsv(@Param() params: unknown, @Res() res: Response): Promise<void> {
    const { id } = parse(classIdParam, params);
    const report = await this.reports.getClassReport(id);
    res.setHeader('Content-Disposition', `attachment; filename="class-${id}-report.csv"`);
    res.send(classReportToCsv(report));
  }

  @Get('classes/:id/report.pdf')
  @Header('Content-Type', 'application/pdf')
  async classPdf(@Param() params: unknown, @Res() res: Response): Promise<void> {
    const { id } = parse(classIdParam, params);
    const report = await this.reports.getClassReport(id);
    const buffer = await renderClassReport(report);
    res.setHeader('Content-Disposition', `attachment; filename="class-${id}-report.pdf"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }
}
