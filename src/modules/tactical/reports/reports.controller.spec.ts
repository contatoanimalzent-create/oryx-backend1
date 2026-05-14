import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClassStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { TacticalReportsController } from './reports.controller';
import type { ClassReport, UnitReport } from './reports.dto';
import { TacticalReportsService } from './reports.service';

const UNIT_ID = '11111111-1111-1111-1111-111111111111';
const CLASS_ID = '22222222-2222-2222-2222-222222222222';

const UNIT_VIEW: UnitReport = {
  meta: { id: UNIT_ID, name: 'U', abbreviation: null, generatedAt: 'ts' },
  summary: {
    instructorCount: 0,
    classCount: 0,
    exerciseCount: 0,
    classesByStatus: { PLANNED: 0, ACTIVE: 0, COMPLETED: 0, CANCELLED: 0 },
    exercisesByStatus: { PLANNED: 0, RUNNING: 0, COMPLETED: 0, CANCELLED: 0 },
  },
  instructors: [],
  classes: [],
};

const CLASS_VIEW: ClassReport = {
  meta: {
    id: CLASS_ID,
    name: 'C',
    status: ClassStatus.PLANNED,
    startsAt: 'ts',
    endsAt: null,
    unitId: UNIT_ID,
    unitName: 'U',
    leadInstructorId: 'L',
    leadInstructorName: 'Lead',
    leadInstructorEmail: 'l@o.test',
    generatedAt: 'ts',
  },
  summary: {
    exerciseCount: 0,
    exercisesByStatus: { PLANNED: 0, RUNNING: 0, COMPLETED: 0, CANCELLED: 0 },
    completionRate: 0,
  },
  exercises: [],
};

interface FakeRes {
  headers: Record<string, string>;
  body: string | Buffer | null;
  setHeader: (k: string, v: string) => void;
  send: (b: string) => void;
  end: (b: Buffer) => void;
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    headers: {},
    body: null,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    send(b) {
      this.body = b;
    },
    end(b) {
      this.body = b;
    },
  };
  return res;
}

describe('TacticalReportsController', () => {
  let controller: TacticalReportsController;
  let service: {
    getUnitReport: ReturnType<typeof vi.fn>;
    getClassReport: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      getUnitReport: vi.fn().mockResolvedValue(UNIT_VIEW),
      getClassReport: vi.fn().mockResolvedValue(CLASS_VIEW),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [TacticalReportsController],
      providers: [{ provide: TacticalReportsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(TacticalReportsController);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('unit', () => {
    it('JSON forwards the eventId and returns service view', async () => {
      const out = await controller.unitJson({ id: UNIT_ID });
      expect(service.getUnitReport).toHaveBeenCalledWith(UNIT_ID);
      expect(out).toBe(UNIT_VIEW);
    });

    it('CSV writes BOM + content-disposition', async () => {
      const res = makeRes();
      await controller.unitCsv({ id: UNIT_ID }, res as never);
      expect(res.headers['Content-Disposition']).toContain('unit-');
      expect(typeof res.body).toBe('string');
      expect((res.body as string).charCodeAt(0)).toBe(0xfeff);
    });

    it('PDF writes Buffer with %PDF magic header', async () => {
      const res = makeRes();
      await controller.unitPdf({ id: UNIT_ID }, res as never);
      const buf = res.body as Buffer;
      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF');
      expect(res.headers['Content-Disposition']).toContain('.pdf');
      expect(res.headers['Content-Length']).toBe(String(buf.length));
    });

    it('rejects non-uuid id with 400', async () => {
      await expect(controller.unitJson({ id: 'nope' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('class', () => {
    it('JSON returns view', async () => {
      const out = await controller.classJson({ id: CLASS_ID });
      expect(service.getClassReport).toHaveBeenCalledWith(CLASS_ID);
      expect(out).toBe(CLASS_VIEW);
    });

    it('CSV emits content-disposition for the class id', async () => {
      const res = makeRes();
      await controller.classCsv({ id: CLASS_ID }, res as never);
      expect(res.headers['Content-Disposition']).toContain(`class-${CLASS_ID}`);
    });

    it('PDF emits content-disposition for the class id', async () => {
      const res = makeRes();
      await controller.classPdf({ id: CLASS_ID }, res as never);
      expect(res.headers['Content-Disposition']).toContain('.pdf');
      const buf = res.body as Buffer;
      expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF');
    });
  });
});
