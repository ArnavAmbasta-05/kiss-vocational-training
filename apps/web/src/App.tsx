import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import type { Role } from '@vtmp/shared';
import { AppShell } from './components/layout/AppShell';
import { NAV_BY_ROLE } from './components/layout/nav';
import { AdminCoursesPage } from './features/admin-courses/AdminCoursesPage';
import { AdminEnrollmentsPage } from './features/admin-enrollments/AdminEnrollmentsPage';
import { UsersPage } from './features/admin-users/UsersPage';
import { AdminBatchesPage } from './features/batches/AdminBatchesPage';
import { AllocationPage } from './features/batches/AllocationPage';
import { BatchDetailPage } from './features/batches/BatchDetailPage';
import { TrainerBatchesPage } from './features/batches/MyBatches';
import { CertificatesPage } from './features/completion/CertificatesPage';
import { CompletionPage } from './features/completion/CompletionPage';
import { MyCertificatesPage } from './features/completion/MyCertificates';
import { CataloguePage } from './features/catalogue/CataloguePage';
import { CourseDetailPage } from './features/catalogue/CourseDetailPage';
import { AttendancePage } from './features/training/AttendancePage';
import { MarksPage } from './features/training/MarksPage';
import { MyTrainingPage } from './features/training/MyTrainingPage';
import { TrainerAssessmentsPage } from './features/training/TrainerAssessmentsPage';
import { TrainerSessionsPage } from './features/training/TrainerSessionsPage';
import { ApplyPage } from './features/enrollment/ApplyPage';
import { MyEnrollmentPage } from './features/enrollment/MyEnrollmentPage';
import { ChangePasswordPage } from './features/profile/ChangePasswordPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { RequireAuth, RequireRole, RoleHomeRedirect } from './lib/auth';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';

/** Screens that exist today; every other nav item shows a "coming soon" page until built. */
const BUILT: Record<string, RouteObject['element']> = {
  '/admin/users': <UsersPage />,
  '/admin/courses': <AdminCoursesPage />,
  '/admin/enrollments': <AdminEnrollmentsPage />,
  '/admin/batches': <AdminBatchesPage />,
  '/admin/completions': <CompletionPage />,
  '/admin/certificates': <CertificatesPage />,
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
