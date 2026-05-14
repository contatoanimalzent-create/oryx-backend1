import PDFDocument from 'pdfkit';

import type { ClassReport, UnitReport } from './reports.dto';

/**
 * Tactical report PDF rendering via pdfkit. Documents are built in memory
 * (small enough to never warrant streaming) and returned as a single
 * Buffer the controller can hand to Express with the right headers.
 *
 * Layout is intentionally simple text-with-blocks — admins who need
 * fancy tables/charts/branding will get a dedicated session for that. The
 * goal here is "printable proof of state" usable for hand-offs and
 * regulatory filings.
 */

export function renderUnitReport(report: UnitReport): Promise<Buffer> {
  return buildPdf((doc) => {
    title(doc, 'Tactical Unit Report');
    meta(doc, [
      ['Unit', report.meta.name],
      ['Abbreviation', report.meta.abbreviation ?? '—'],
      ['Unit ID', report.meta.id],
      ['Generated at', report.meta.generatedAt],
    ]);

    sectionHeader(doc, 'Summary');
    rows(doc, [
      ['Instructors', String(report.summary.instructorCount)],
      ['Classes', String(report.summary.classCount)],
      ['Exercises (total)', String(report.summary.exerciseCount)],
    ]);
    subHeader(doc, 'Classes by status');
    rows(
      doc,
      Object.entries(report.summary.classesByStatus).map(([k, v]) => [k, String(v)]),
    );
    subHeader(doc, 'Exercises by status');
    rows(
      doc,
      Object.entries(report.summary.exercisesByStatus).map(([k, v]) => [k, String(v)]),
    );

    sectionHeader(doc, `Instructors (${report.instructors.length})`);
    if (report.instructors.length === 0) {
      doc.fontSize(10).text('No instructors assigned.');
    } else {
      for (const i of report.instructors) {
        doc.fontSize(10).text(`• ${i.displayName} <${i.email}> — assigned ${i.assignedAt}`);
      }
    }

    sectionHeader(doc, `Classes (${report.classes.length})`);
    if (report.classes.length === 0) {
      doc.fontSize(10).text('No classes yet.');
    } else {
      for (const c of report.classes) {
        const window = c.endsAt ? `${c.startsAt} → ${c.endsAt}` : `${c.startsAt} → ongoing`;
        doc.fontSize(10).text(`• ${c.name} [${c.status}] — ${window}`);
        doc
          .fontSize(9)
          .text(`  lead: ${c.leadInstructorName}    exercises: ${c.exerciseCount}    id: ${c.id}`, {
            indent: 12,
          });
      }
    }
  });
}

export function renderClassReport(report: ClassReport): Promise<Buffer> {
  return buildPdf((doc) => {
    title(doc, 'Tactical Class Report');
    meta(doc, [
      ['Class', report.meta.name],
      ['Status', report.meta.status],
      ['Unit', report.meta.unitName],
      [
        'Window',
        report.meta.endsAt
          ? `${report.meta.startsAt} → ${report.meta.endsAt}`
          : `${report.meta.startsAt} → ongoing`,
      ],
      ['Lead instructor', `${report.meta.leadInstructorName} <${report.meta.leadInstructorEmail}>`],
      ['Class ID', report.meta.id],
      ['Generated at', report.meta.generatedAt],
    ]);

    sectionHeader(doc, 'Summary');
    rows(doc, [
      ['Exercises', String(report.summary.exerciseCount)],
      ['Completion rate', `${(report.summary.completionRate * 100).toFixed(1)}%`],
    ]);
    subHeader(doc, 'Exercises by status');
    rows(
      doc,
      Object.entries(report.summary.exercisesByStatus).map(([k, v]) => [k, String(v)]),
    );

    sectionHeader(doc, `Exercises (${report.exercises.length})`);
    if (report.exercises.length === 0) {
      doc.fontSize(10).text('No exercises scheduled.');
    } else {
      for (const e of report.exercises) {
        const sched = e.scheduledAt ?? 'not scheduled';
        doc.fontSize(10).text(`• ${e.name} [${e.status}] — ${sched}`);
        if (e.description) {
          doc.fontSize(9).text(`  ${e.description}`, { indent: 12 });
        }
        doc
          .fontSize(9)
          .fillColor('#666')
          .text(`  id: ${e.id}    event: ${e.eventId ?? '—'}`, { indent: 12 })
          .fillColor('black');
      }
    }
  });
}

// ─── Internals ──────────────────────────────────────────────────────────

type DocBuilder = (doc: PDFKit.PDFDocument) => void;

function buildPdf(build: DocBuilder): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      build(doc);
      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

function title(doc: PDFKit.PDFDocument, text: string): void {
  doc.fontSize(18).text(text, { underline: false }).moveDown(0.5);
}

function meta(doc: PDFKit.PDFDocument, pairs: Array<[string, string]>): void {
  doc.fontSize(10);
  for (const [k, v] of pairs) {
    doc.text(`${k}: ${v}`);
  }
  doc.moveDown();
}

function sectionHeader(doc: PDFKit.PDFDocument, text: string): void {
  doc.moveDown(0.5).fontSize(13).text(text, { underline: true }).moveDown(0.3);
}

function subHeader(doc: PDFKit.PDFDocument, text: string): void {
  doc.moveDown(0.3).fontSize(11).text(text).moveDown(0.2);
}

function rows(doc: PDFKit.PDFDocument, pairs: Array<[string, string]>): void {
  doc.fontSize(10);
  for (const [k, v] of pairs) {
    doc.text(`  ${k}: ${v}`);
  }
}
