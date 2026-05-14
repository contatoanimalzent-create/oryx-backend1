import type { ClassReport, UnitReport } from './reports.dto';

/**
 * Tactical report CSV serialization (RFC 4180). Reports are inherently
 * heterogeneous (meta + summary + 1-N item tables) so we emit multiple
 * sections separated by blank lines and a `# SECTION` heading row. Excel,
 * LibreOffice, Numbers, and pandas with `comment='#'` all handle this.
 *
 * Encoded output starts with the UTF-8 BOM so Excel-on-Windows picks the
 * right codepage for non-ASCII names.
 */

const BOM = '﻿';

export function unitReportToCsv(report: UnitReport): string {
  const lines: string[] = [];

  lines.push('# UNIT REPORT');
  lines.push(row('id', 'name', 'abbreviation', 'generatedAt'));
  lines.push(
    row(report.meta.id, report.meta.name, report.meta.abbreviation ?? '', report.meta.generatedAt),
  );

  lines.push('');
  lines.push('# SUMMARY');
  lines.push(row('metric', 'value'));
  lines.push(row('instructorCount', String(report.summary.instructorCount)));
  lines.push(row('classCount', String(report.summary.classCount)));
  lines.push(row('exerciseCount', String(report.summary.exerciseCount)));
  for (const [k, v] of Object.entries(report.summary.classesByStatus)) {
    lines.push(row(`classes_${k}`, String(v)));
  }
  for (const [k, v] of Object.entries(report.summary.exercisesByStatus)) {
    lines.push(row(`exercises_${k}`, String(v)));
  }

  lines.push('');
  lines.push('# INSTRUCTORS');
  lines.push(row('userId', 'displayName', 'email', 'assignedAt'));
  for (const i of report.instructors) {
    lines.push(row(i.userId, i.displayName, i.email, i.assignedAt));
  }

  lines.push('');
  lines.push('# CLASSES');
  lines.push(
    row('id', 'name', 'status', 'startsAt', 'endsAt', 'leadInstructorName', 'exerciseCount'),
  );
  for (const c of report.classes) {
    lines.push(
      row(
        c.id,
        c.name,
        c.status,
        c.startsAt,
        c.endsAt ?? '',
        c.leadInstructorName,
        String(c.exerciseCount),
      ),
    );
  }

  return BOM + lines.join('\r\n') + '\r\n';
}

export function classReportToCsv(report: ClassReport): string {
  const lines: string[] = [];

  lines.push('# CLASS REPORT');
  lines.push(
    row(
      'id',
      'name',
      'status',
      'startsAt',
      'endsAt',
      'unitId',
      'unitName',
      'leadInstructorName',
      'leadInstructorEmail',
      'generatedAt',
    ),
  );
  lines.push(
    row(
      report.meta.id,
      report.meta.name,
      report.meta.status,
      report.meta.startsAt,
      report.meta.endsAt ?? '',
      report.meta.unitId,
      report.meta.unitName,
      report.meta.leadInstructorName,
      report.meta.leadInstructorEmail,
      report.meta.generatedAt,
    ),
  );

  lines.push('');
  lines.push('# SUMMARY');
  lines.push(row('metric', 'value'));
  lines.push(row('exerciseCount', String(report.summary.exerciseCount)));
  lines.push(row('completionRate', report.summary.completionRate.toFixed(4)));
  for (const [k, v] of Object.entries(report.summary.exercisesByStatus)) {
    lines.push(row(`exercises_${k}`, String(v)));
  }

  lines.push('');
  lines.push('# EXERCISES');
  lines.push(row('id', 'name', 'description', 'status', 'scheduledAt', 'eventId'));
  for (const e of report.exercises) {
    lines.push(
      row(e.id, e.name, e.description ?? '', e.status, e.scheduledAt ?? '', e.eventId ?? ''),
    );
  }

  return BOM + lines.join('\r\n') + '\r\n';
}

/**
 * Field-level RFC 4180 escaping: fields containing `,`, `"` or any line
 * break get wrapped in double quotes and inner quotes doubled. Fields
 * without any of those characters pass through verbatim — keeps small
 * files diff-friendly.
 */
function row(...cells: string[]): string {
  return cells.map(escapeCell).join(',');
}

function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
