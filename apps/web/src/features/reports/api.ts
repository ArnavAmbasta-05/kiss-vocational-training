import type { ReportFormat } from '@vtmp/shared';
import { downloadFile } from '../../lib/download';

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'report';

/** BRQ-8.1: the student's own report ("me") or, for an admin, any student's. */
export const downloadStudentReport = (studentId: string, rollNo: string, enrollmentId?: string) =>
  downloadFile(
    `/reports/students/${studentId}.pdf${enrollmentId ? `?enrollmentId=${enrollmentId}` : ''}`,
    `performance-report-${slug(rollNo)}.pdf`,
  );

export const downloadBatchReport = (batchId: string, name: string, format: ReportFormat) =>
  downloadFile(
    `/reports/batches/${batchId}?format=${format}`,
    `batch-report-${slug(name)}.${format}`,
  );

export const downloadCourseReport = (courseId: string, code: string, format: ReportFormat) =>
  downloadFile(
    `/reports/courses/${courseId}?format=${format}`,
    `course-report-${slug(code)}.${format}`,
  );
