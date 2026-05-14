import { ClassStatus, ExerciseStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { classReportToCsv, unitReportToCsv } from './csv';
import { renderClassReport, renderUnitReport } from './pdf';
import type { ClassReport, UnitReport } from './reports.dto';

const UNIT_REPORT: UnitReport = {
  meta: {
    id: 'unit-1',
    name: 'My, "Unit"',
    abbreviation: 'M-U',
    generatedAt: '2026-05-12T20:00:00.000Z',
  },
  summary: {
    instructorCount: 2,
    classCount: 1,
    exerciseCount: 3,
    classesByStatus: { PLANNED: 0, ACTIVE: 1, COMPLETED: 0, CANCELLED: 0 },
    exercisesByStatus: { PLANNED: 1, RUNNING: 1, COMPLETED: 1, CANCELLED: 0 },
  },
  instructors: [
    {
      userId: 'u1',
      displayName: 'Alice',
      email: 'a@o.test',
      assignedAt: '2026-05-12T20:00:00.000Z',
    },
  ],
  classes: [
    {
      id: 'c1',
      name: 'Line\nBreak',
      status: ClassStatus.ACTIVE,
      startsAt: '2026-05-12T20:00:00.000Z',
      endsAt: null,
      leadInstructorName: 'L',
      exerciseCount: 3,
    },
  ],
};

const CLASS_REPORT: ClassReport = {
  meta: {
    id: 'c1',
    name: 'Class',
    status: ClassStatus.ACTIVE,
    startsAt: '2026-05-12T20:00:00.000Z',
    endsAt: null,
    unitId: 'u1',
    unitName: 'Unit',
    leadInstructorId: 'L',
    leadInstructorName: 'Lead',
    leadInstructorEmail: 'l@o.test',
    generatedAt: '2026-05-12T20:00:00.000Z',
  },
  summary: {
    exerciseCount: 2,
    exercisesByStatus: { PLANNED: 1, RUNNING: 0, COMPLETED: 1, CANCELLED: 0 },
    completionRate: 0.5,
  },
  exercises: [
    {
      id: 'e1',
      name: 'Ex',
      description: 'short',
      status: ExerciseStatus.COMPLETED,
      scheduledAt: null,
      eventId: null,
    },
    {
      id: 'e2',
      name: 'Ex 2',
      description: null,
      status: ExerciseStatus.PLANNED,
      scheduledAt: '2026-05-13T10:00:00.000Z',
      eventId: 'event-x',
    },
  ],
};

describe('CSV serializers (RFC 4180)', () => {
  it('starts with BOM and uses CRLF line endings', () => {
    const csv = unitReportToCsv(UNIT_REPORT);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.includes('\r\n')).toBe(true);
  });

  it('escapes commas, quotes, and newlines in fields', () => {
    const csv = unitReportToCsv(UNIT_REPORT);
    // Quoted because contains comma + quote, inner quote doubled.
    expect(csv).toContain('"My, ""Unit"""');
    // Quoted because contains newline.
    expect(csv).toContain('"Line\nBreak"');
  });

  it('emits sectioned headers for sections', () => {
    const csv = unitReportToCsv(UNIT_REPORT);
    expect(csv).toContain('# UNIT REPORT');
    expect(csv).toContain('# SUMMARY');
    expect(csv).toContain('# INSTRUCTORS');
    expect(csv).toContain('# CLASSES');
  });

  it('class report serializes meta + summary + exercises', () => {
    const csv = classReportToCsv(CLASS_REPORT);
    expect(csv).toContain('# CLASS REPORT');
    expect(csv).toContain('# SUMMARY');
    expect(csv).toContain('# EXERCISES');
    expect(csv).toContain('completionRate,0.5000');
  });
});

describe('PDF renderers (pdfkit)', () => {
  it('renders unit report to a non-empty PDF buffer', async () => {
    const buf = await renderUnitReport(UNIT_REPORT);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    // PDF magic header.
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('renders class report to a non-empty PDF buffer', async () => {
    const buf = await renderClassReport(CLASS_REPORT);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF');
  });
});
