import type { Role } from '@vtmp/shared';

export interface NavItem {
  to: string;
  /** i18n key in the common namespace. */
  labelKey: string;
  end?: boolean;
}

/**
 * Sidebar per role. Every core task is one click from the dashboard here, which keeps each
 * task within three clicks (NFR-04).
 */
export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  STUDENT: [
    { to: '/student', labelKey: 'nav.dashboard', end: true },
    { to: '/student/courses', labelKey: 'nav.student.courses' },
    { to: '/student/enrollment', labelKey: 'nav.student.enrollment' },
    { to: '/student/training', labelKey: 'nav.student.training' },
    { to: '/student/skills', labelKey: 'nav.student.skills' },
    { to: '/student/passport', labelKey: 'nav.student.passport' },
    { to: '/student/opportunities', labelKey: 'nav.student.opportunities' },
    { to: '/student/certificates', labelKey: 'nav.student.certificates' },
  ],
  TRAINER: [
    { to: '/trainer', labelKey: 'nav.dashboard', end: true },
    { to: '/trainer/batches', labelKey: 'nav.trainer.batches' },
    { to: '/trainer/sessions', labelKey: 'nav.trainer.sessions' },
    { to: '/trainer/assessments', labelKey: 'nav.trainer.assessments' },
    { to: '/trainer/competencies', labelKey: 'nav.trainer.competencies' },
    { to: '/trainer/at-risk', labelKey: 'nav.trainer.atRisk' },
  ],
  ADMIN: [
    { to: '/admin', labelKey: 'nav.dashboard', end: true },
    { to: '/admin/users', labelKey: 'nav.admin.users' },
    { to: '/admin/courses', labelKey: 'nav.admin.courses' },
    { to: '/admin/enrollments', labelKey: 'nav.admin.enrollments' },
    { to: '/admin/batches', labelKey: 'nav.admin.batches' },
    { to: '/admin/competencies', labelKey: 'nav.admin.competencies' },
    { to: '/admin/completions', labelKey: 'nav.admin.completions' },
    { to: '/admin/certificates', labelKey: 'nav.admin.certificates' },
    { to: '/admin/at-risk', labelKey: 'nav.admin.atRisk' },
    { to: '/admin/opportunities', labelKey: 'nav.admin.opportunities' },
    { to: '/admin/reports', labelKey: 'nav.admin.reports' },
    { to: '/admin/audit', labelKey: 'nav.admin.audit' },
  ],
};
