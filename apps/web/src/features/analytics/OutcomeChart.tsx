import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const SERIES = '#2a78d6';
const GRID = '#e2e8f0';
const AXIS = '#475569';
const tick = { fill: AXIS, fontSize: 12 };

/**
 * One metric across courses as horizontal bars (0–100 %). Lazy-loaded with Recharts so only
 * this admin page pays for the chart library (NFR-10). The same numbers are in the table below
 * the chart for screen readers.
 */
export function OutcomeChart({
  rows,
  metricLabel,
  noDataLabel,
}: {
  rows: Array<{ label: string; value: number | null }>;
  metricLabel: string;
  /** Shown instead of "0 %" where there is nothing to measure yet (no finished students). */
  noDataLabel: string;
}) {
  const { i18n } = useTranslation();
  const nf = new Intl.NumberFormat(i18n.resolvedLanguage ?? 'en', { maximumFractionDigits: 1 });
  const data = rows.map((r) => ({
    label: r.label,
    value: r.value ?? 0,
    text: r.value === null ? noDataLabel : `${nf.format(r.value)} %`,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={tick}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v} %`}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={170}
          tick={tick}
          axisLine={{ stroke: GRID }}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: '#f1f5f9' }}
          formatter={(_v: number, _n: string, item: { payload?: { text?: string } }) => [
            item.payload?.text ?? '',
            metricLabel,
          ]}
          contentStyle={{ borderRadius: 6, borderColor: GRID, fontSize: 13 }}
        />
        <Bar
          dataKey="value"
          fill={SERIES}
          barSize={18}
          radius={[0, 4, 4, 0]}
          isAnimationActive={false}
        >
          <LabelList dataKey="text" position="right" fill="#0f172a" fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
