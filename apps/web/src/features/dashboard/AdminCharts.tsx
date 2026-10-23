import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AdminDashboard } from '@vtmp/shared';
import { Card, Table } from '../../components/ui';
import { formatDay } from '../../lib/format';

/**
 * Chart tokens (dataviz reference palette, light only: the app has no dark theme). Every chart
 * here has one series, so one hue and no legend; the title names what is plotted.
 */
const SERIES = '#2a78d6';
const GRID = '#e2e8f0';
const AXIS = '#475569';
const REFERENCE = '#64748b';
const SURFACE = '#ffffff';
const tick = { fill: AXIS, fontSize: 12 };
const tooltipStyle = {
  contentStyle: { borderRadius: 6, borderColor: GRID, fontSize: 13 },
  labelStyle: { color: '#0f172a', fontWeight: 600 },
  itemStyle: { color: '#0f172a' },
};

/** Chart card: title, one-line description, the chart, and the same data as a table. */
function ChartCard({
  title,
  description,
  children,
  table,
  testId,
}: {
  title: string;
  description: string;
  children: ReactNode;
  table: ReactNode;
  testId: string;
}) {
  const { t } = useTranslation('dashboard');
  return (
    <Card title={title} headingLevel={2} data-testid={testId}>
      <p className="-mt-2 mb-3 text-sm text-slate-600">{description}</p>
      {/* The chart is a picture of the table below; screen readers get the table. */}
      <div aria-hidden="true" className="h-64">
        {children}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
          {t('charts.showTable')}
        </summary>
        <div className="mt-2">{table}</div>
      </details>
    </Card>
  );
}

export function AdminCharts({ data }: { data: AdminDashboard }) {
  const { t, i18n } = useTranslation(['dashboard', 'enrollment']);
  const lng = i18n.resolvedLanguage ?? 'en';
  const nf = new Intl.NumberFormat(lng);

  const funnel = data.enrollmentFunnel
    .filter((f) => f.count > 0 || f.status === 'PENDING' || f.status === 'APPROVED')
    .map((f) => ({ ...f, label: t(`enrollment:status.${f.status}`) }));
  const grades = data.grades.map((g) => ({
    ...g,
    label: t('charts.gradeLabel', { grade: g.grade }),
  }));
  const trend = data.attendanceTrend.map((w) => ({ ...w, label: formatDay(w.weekStart, lng) }));
  const pct = (n: number | null) => (n === null ? t('tiles.none') : `${n.toFixed(2)} %`);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ChartCard
        testId="chart-funnel"
        title={t('charts.funnel')}
        description={t('charts.funnelDesc')}
        table={
          <Table
            caption={t('charts.funnel')}
            columns={[
              { key: 's', header: t('charts.status'), render: (r) => r.label },
              {
                key: 'c',
                header: t('charts.count'),
                align: 'right',
                render: (r) => nf.format(r.count),
              },
            ]}
            rows={funnel}
            rowKey={(r) => r.status}
          />
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={funnel}
            layout="vertical"
            margin={{ top: 4, right: 40, bottom: 4, left: 8 }}
          >
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={tick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={140}
              tick={tick}
              axisLine={{ stroke: GRID }}
              tickLine={false}
            />
            <Tooltip
              {...tooltipStyle}
              cursor={{ fill: '#f1f5f9' }}
              formatter={(v: number) => [nf.format(v), t('charts.count')]}
            />
            <Bar
              dataKey="count"
              fill={SERIES}
              barSize={18}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            >
              <LabelList dataKey="count" position="right" fill="#0f172a" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        testId="chart-grades"
        title={t('charts.grades')}
        description={t('charts.gradesDesc')}
        table={
          <Table
            caption={t('charts.grades')}
            columns={[
              { key: 'g', header: t('charts.grade'), render: (r) => r.grade },
              {
                key: 'c',
                header: t('charts.count'),
                align: 'right',
                render: (r) => nf.format(r.count),
              },
            ]}
            rows={grades}
            rowKey={(r) => r.grade}
          />
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={grades} margin={{ top: 20, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={tick} axisLine={{ stroke: GRID }} tickLine={false} />
            <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} width={36} />
            <Tooltip
              {...tooltipStyle}
              cursor={{ fill: '#f1f5f9' }}
              formatter={(v: number) => [nf.format(v), t('charts.count')]}
            />
            <Bar
              dataKey="count"
              fill={SERIES}
              barSize={24}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            >
              <LabelList dataKey="count" position="top" fill="#0f172a" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="lg:col-span-2">
        <ChartCard
          testId="chart-trend"
          title={t('charts.trend')}
          description={t('charts.trendDesc')}
          table={
            <Table
              caption={t('charts.trend')}
              columns={[
                { key: 'w', header: t('charts.week'), render: (r) => r.label },
                {
                  key: 'p',
                  header: t('charts.percent'),
                  align: 'right',
                  render: (r) => pct(r.percent),
                },
                {
                  key: 'm',
                  header: t('charts.marks'),
                  align: 'right',
                  render: (r) => nf.format(r.marks),
                },
              ]}
              rows={trend}
              rowKey={(r) => r.weekStart}
            />
          }
        >
          {trend.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-slate-600">
              {t('charts.noData')}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 12, right: 96, bottom: 4, left: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={tick} axisLine={{ stroke: GRID }} tickLine={false} />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tick={tick}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  unit="%"
                />
                <ReferenceLine
                  y={data.minAttendancePercent}
                  stroke={REFERENCE}
                  strokeDasharray="4 4"
                  label={{
                    value: t('charts.minimumLine', { min: data.minAttendancePercent }),
                    position: 'right',
                    fill: AXIS,
                    fontSize: 12,
                  }}
                />
                <Tooltip
                  {...tooltipStyle}
                  cursor={{ stroke: GRID }}
                  formatter={(v: number) => [pct(v), t('charts.percent')]}
                />
                <Line
                  type="linear"
                  dataKey="percent"
                  stroke={SERIES}
                  strokeWidth={2}
                  dot={{ r: 4, fill: SERIES, stroke: SURFACE, strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: SERIES, stroke: SURFACE, strokeWidth: 2 }}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
