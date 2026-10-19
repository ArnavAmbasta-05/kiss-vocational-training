import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, EmptyState, Spinner } from '../../components/ui';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { formatDate } from '../../lib/format';
import { useCatalogueCourse } from './api';
import { WindowBadge } from './WindowBadge';

export function CourseDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation('courses');
  const errorMessage = useErrorMessage();
  const { data, isPending, isError, error } = useCatalogueCourse(id);
  const lng = i18n.resolvedLanguage ?? 'en';

  const back = (
    <Link
      to="/student/courses"
      className="text-sm font-medium text-brand-700 underline hover:text-brand-900"
    >
      {t('catalogue.back')}
    </Link>
  );

  if (isPending) return <Spinner size="lg" />;
  if (isError) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <EmptyState title={errorMessage(error)} />
      </div>
    );
  }
  const { course } = data;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {back}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-600">{course.code}</p>
        <h1 className="text-2xl font-bold text-slate-900">{course.title}</h1>
        <p className="mt-1 text-sm text-slate-700">{data.cycle.name}</p>
      </div>
      <Card>
        <p className="whitespace-pre-line text-slate-800">{course.description}</p>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-600">{t('fields.duration')}</dt>
            <dd className="font-medium text-slate-900">
              {t('fields.durationValue', { count: course.durationWeeks })}
            </dd>
          </div>
          <div>
            <dt className="text-slate-600">{t('fields.prerequisites')}</dt>
            <dd className="font-medium text-slate-900">
              {course.prerequisites || t('fields.none')}
            </dd>
          </div>
          <div>
            <dt className="text-slate-600">{t('fields.seatCapacity')}</dt>
            <dd className="font-medium text-slate-900">{course.seatCapacity}</dd>
          </div>
          <div>
            <dt className="text-slate-600">{t('fields.seatsRemaining')}</dt>
            <dd className="font-medium text-slate-900">{course.seatsRemaining}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-600">{t('fields.window')}</dt>
            <dd className="mt-1 flex flex-col gap-1">
              <WindowBadge offering={course.offering} />
              {course.offering && (
                <span className="text-slate-800">
                  {t('window.range', {
                    from: formatDate(course.offering.enrollmentOpensAt, lng, true),
                    to: formatDate(course.offering.enrollmentClosesAt, lng, true),
                  })}
                </span>
              )}
            </dd>
          </div>
        </dl>
        {course.offering?.windowState === 'OPEN' && (
          <Link
            to={`/student/enrollment/apply?courseId=${course.id}`}
            className="mt-6 inline-flex h-10 items-center rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          >
            {t('catalogue.applyNow')}
          </Link>
        )}
      </Card>
    </div>
  );
}
