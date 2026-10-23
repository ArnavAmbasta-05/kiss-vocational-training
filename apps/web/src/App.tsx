import { lazy } from 'react';
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import type { Role } from '@vtmp/shared';
import { AppShell } from './components/layout/AppShell';
import { NAV_BY_ROLE } from './components/layout/nav';
import { RequireAuth, RequireRole, RoleHomeRedirect } from './lib/auth';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';

// Every page is its own chunk, loaded when first opened (NFR-10); the shell, login and 404
// stay in the main bundle. AppShell shows a spinner while a page chunk loads.
const AdminCoursesPage = lazy(() =>
  import('./features/admin-courses/AdminCoursesPage').then((m) => ({
    default: m.AdminCoursesPage,
  })),
);
const AdminEnrollmentsPage = lazy(() =>
  import('./features/admin-enrollments/AdminEnrollmentsPage').then((m) => ({
    default: m.AdminEnrollmentsPage,
  })),
);
const UsersPage = lazy(() =>
  import('./features/admin-users/UsersPage').then((m) => ({ default: m.UsersPage })),
);
const AdminBatchesPage = lazy(() =>
  import('./features/batches/AdminBatchesPage').then((m) => ({ default: m.AdminBatchesPage })),
);
const AllocationPage = lazy(() =>
  import('./features/batches/AllocationPage').then((m) => ({ default: m.AllocationPage })),
);
const BatchDetailPage = lazy(() =>
  import('./features/batches/BatchDetailPage').then((m) => ({ default: m.BatchDetailPage })),
);
const TrainerBatchesPage = lazy(() =>
  import('./features/batches/MyBatches').then((m) => ({ default: m.TrainerBatchesPage })),
);
const CertificatesPage = lazy(() =>
  import('./features/completion/CertificatesPage').then((m) => ({ default: m.CertificatesPage })),
);
const CompletionPage = lazy(() =>
  import('./features/completion/CompletionPage').then((m) => ({ default: m.CompletionPage })),
);
const MyCertificatesPage = lazy(() =>
  import('./features/completion/MyCertificates').then((m) => ({ default: m.MyCertificatesPage })),
);
const CataloguePage = lazy(() =>
  import('./features/catalogue/CataloguePage').then((m) => ({ default: m.CataloguePage })),
);
const CourseDetailPage = lazy(() =>
  import('./features/catalogue/CourseDetailPage').then((m) => ({ default: m.CourseDetailPage })),
);
const AttendancePage = lazy(() =>
  import('./features/training/AttendancePage').then((m) => ({ default: m.AttendancePage })),
);
const MarksPage = lazy(() =>
  import('./features/training/MarksPage').then((m) => ({ default: m.MarksPage })),
);
const MyTrainingPage = lazy(() =>
  import('./features/training/MyTrainingPage').then((m) => ({ default: m.MyTrainingPage })),
);
const TrainerAssessmentsPage = lazy(() =>
  import('./features/training/TrainerAssessmentsPage').then((m) => ({
    default: m.TrainerAssessmentsPage,
  })),
);
const TrainerSessionsPage = lazy(() =>
  import('./features/training/TrainerSessionsPage').then((m) => ({
    default: m.TrainerSessionsPage,
  })),
);
const ApplyPage = lazy(() =>
  import('./features/enrollment/ApplyPage').then((m) => ({ default: m.ApplyPage })),
);
const MyEnrollmentPage = lazy(() =>
  import('./features/enrollment/MyEnrollmentPage').then((m) => ({ default: m.MyEnrollmentPage })),
);
const ChangePasswordPage = lazy(() =>
  import('./features/profile/ChangePasswordPage').then((m) => ({ default: m.ChangePasswordPage })),
);
const ProfilePage = lazy(() =>
  import('./features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);

const ReportsPage = lazy(() =>
  import('./features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);

const AdminCompetenciesPage = lazy(() =>
  import('./features/competency/AdminCompetenciesPage').then((m) => ({
    default: m.AdminCompetenciesPage,
  })),
);
const TrainerCompetenciesPage = lazy(() =>
  import('./features/competency/TrainerCompetenciesPage').then((m) => ({
    default: m.TrainerCompetenciesPage,
  })),
);
const MySkillGapsPage = lazy(() =>
  import('./features/competency/MySkillGapsPage').then((m) => ({ default: m.MySkillGapsPage })),
);

/** Screens that exist today; every other nav item shows a "coming soon" page until built. */
const BUILT: Record<string, RouteObject['element']> = {
  '/admin/users': <UsersPage />,
  '/admin/courses': <AdminCoursesPage />,
  '/admin/enrollments': <AdminEnrollmentsPage />,
  '/admin/batches': <AdminBatchesPage />,
  '/admin/completions': <CompletionPage />,
  '/admin/certificates': <CertificatesPage />,
  '/admin/reports': <ReportsPage />,
  '/admin/competencies': <AdminCompetenciesPage />,
  '/trainer/competencies': <TrainerCompetenciesPage />,
  '/student/skills': <MySkillGapsPage />,
  '/trainer/batches': <TrainerBatchesPage />,
  '/trainer/sessions': <TrainerSessionsPage />,
  '/trainer/assessments': <TrainerAssessmentsPage />,
  '/student/training': <MyTrainingPage />,
  '/student/certificates': <MyCertificatesPage />,
  '/student/courses': <CataloguePage />,
  '/student/enrollment': <MyEnrollmentPage />,
};

/** Pages reached from inside a section rather than from the sidebar. */
const EXTRA: Partial<Record<Role, RouteObject[]>> = {
  STUDENT: [
    { path: 'courses/:id', element: <CourseDetailPage /> },
    { path: 'enrollment/apply', element: <ApplyPage /> },
  ],
  ADMIN: [
    { path: 'batches/allocation', element: <AllocationPage /> },
    { path: 'batches/:batchId', element: <BatchDetailPage admin /> },
    { path: 'sessions/:sessionId', element: <AttendancePage /> },
    { path: 'assessments/:assessmentId', element: <MarksPage /> },
  ],
  TRAINER: [
    { path: 'batches/:batchId', element: <BatchDetailPage admin={false} /> },
    { path: 'sessions/:sessionId', element: <AttendancePage back="/trainer/sessions" /> },
    { path: 'assessments/:assessmentId', element: <MarksPage back="/trainer/assessments" /> },
  ],
};

function roleSection(role: Role, base: string): RouteObject {
  return {
    path: base.slice(1),
    element: <RequireRole roles={[role]} />,
    children: [
      ...NAV_BY_ROLE[role].map((item) =>
        item.to === base
          ? { index: true, element: <DashboardPage /> }
          : {
              path: item.to.slice(base.length + 1),
              element: BUILT[item.to] ?? <ComingSoonPage titleKey={item.labelKey} />,
            },
      ),
      ...(EXTRA[role] ?? []),
    ],
  };
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <RoleHomeRedirect /> },
          roleSection('STUDENT', '/student'),
          roleSection('TRAINER', '/trainer'),
          roleSection('ADMIN', '/admin'),
          { path: 'profile', element: <ProfilePage /> },
          { path: 'profile/password', element: <ChangePasswordPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
