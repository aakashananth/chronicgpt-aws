"use client";

import { HealthMetricRow } from "@/lib/api";
import { MetricsChart } from "./MetricsChart";
import { format } from "date-fns";

interface MetricViewProps {
  metrics: HealthMetricRow[];
  metricKey: keyof HealthMetricRow;
  label: string;
  color: string;
  yAxisLabel: string;
  darkMode: boolean;
  formatValue: (value: number | null) => string;
  getBaseline?: (metric: HealthMetricRow) => number | null;
  getAnomalyFlag?: (metric: HealthMetricRow) => boolean;
  tooltip?: string;
  lowerIsBetter?: boolean;
}

/**
 * Metric-specific view component showing detailed view of a single metric
 */
export function MetricView({
  metrics,
  metricKey,
  label,
  color,
  yAxisLabel,
  darkMode,
  formatValue,
  getBaseline,
  getAnomalyFlag,
  tooltip,
  lowerIsBetter = false,
}: MetricViewProps) {
  if (metrics.length === 0) {
    return (
      <div className={`${darkMode ? "bg-[#1a1a1a]" : "bg-white"} rounded-lg border ${darkMode ? "border-[#2a2a2a]" : "border-gray-200"} p-6`}>
        <p className={darkMode ? "text-gray-400" : "text-gray-600"}>No data available</p>
      </div>
    );
  }

  const latest = metrics[metrics.length - 1];
  const latestValue = latest[metricKey] as number | null;
  const baseline = getBaseline ? getBaseline(latest) : null;
  const isAnomalous = getAnomalyFlag ? getAnomalyFlag(latest) : false;

  // Calculate statistics
  const validValues = metrics
    .map(m => m[metricKey] as number | null)
    .filter((v): v is number => v !== null);

  const avg = validValues.length > 0 
    ? validValues.reduce((a, b) => a + b, 0) / validValues.length 
    : null;
  
  const min = validValues.length > 0 ? Math.min(...validValues) : null;
  const max = validValues.length > 0 ? Math.max(...validValues) : null;

  // Calculate trend (compare last 7 days to previous 7 days)
  const last7Days = metrics.slice(-7);
  const previous7Days = metrics.slice(-14, -7);
  const last7Avg = last7Days
    .map(m => m[metricKey] as number | null)
    .filter((v): v is number => v !== null)
    .reduce((a, b) => a + b, 0) / last7Days.filter(m => (m[metricKey] as number | null) !== null).length;
  const prev7Avg = previous7Days.length > 0
    ? previous7Days
        .map(m => m[metricKey] as number | null)
        .filter((v): v is number => v !== null)
        .reduce((a, b) => a + b, 0) / previous7Days.filter(m => (m[metricKey] as number | null) !== null).length
    : null;
  
  const trend = prev7Avg !== null && prev7Avg !== 0
    ? ((last7Avg - prev7Avg) / prev7Avg) * 100
    : null;

  const bgClass = darkMode ? "bg-[#1a1a1a]" : "bg-white";
  const borderClass = darkMode ? "border-[#2a2a2a]" : "border-gray-200";
  const textClass = darkMode ? "text-white" : "text-gray-900";
  const textSecondaryClass = darkMode ? "text-gray-400" : "text-gray-600";
  const textMutedClass = darkMode ? "text-gray-500" : "text-gray-500";

  return (
    <div className={`${bgClass} rounded-lg border ${borderClass} p-4 sm:p-6`}>
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className={`text-xl sm:text-2xl font-semibold ${textClass} mb-1`}>{label}</h2>
            {tooltip && (
              <p className={`text-xs sm:text-sm ${textMutedClass}`}>{tooltip}</p>
            )}
          </div>
          {isAnomalous && (
            <span className={`px-2 py-1 text-xs font-medium rounded ${
              darkMode 
                ? "bg-red-950/30 text-red-400 border border-red-800/50" 
                : "bg-red-50 text-red-600 border border-red-200"
            }`}>
              Anomalous
            </span>
          )}
        </div>

        {/* Current Value */}
        <div className="flex items-baseline gap-2 mb-4">
          <div className={`text-3xl sm:text-4xl font-bold ${textClass}`}>
            {formatValue(latestValue)}
          </div>
          {baseline !== null && latestValue !== null && (
            <div className={`text-sm ${textSecondaryClass}`}>
              Baseline: {formatValue(baseline)}
            </div>
          )}
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <div className={`text-xs ${textMutedClass} mb-1`}>Average</div>
            <div className={`text-lg font-semibold ${textClass}`}>
              {formatValue(avg)}
            </div>
          </div>
          <div>
            <div className={`text-xs ${textMutedClass} mb-1`}>Min</div>
            <div className={`text-lg font-semibold ${textClass}`}>
              {formatValue(min)}
            </div>
          </div>
          <div>
            <div className={`text-xs ${textMutedClass} mb-1`}>Max</div>
            <div className={`text-lg font-semibold ${textClass}`}>
              {formatValue(max)}
            </div>
          </div>
        </div>

        {/* Trend */}
        {trend !== null && (
          <div className={`text-sm ${textSecondaryClass}`}>
            7-day trend:{" "}
            <span className={`font-semibold ${
              (lowerIsBetter && trend < 0) || (!lowerIsBetter && trend > 0)
                ? "text-green-500"
                : (lowerIsBetter && trend > 0) || (!lowerIsBetter && trend < 0)
                ? "text-red-500"
                : textMutedClass
            }`}>
              {trend > 0 ? "+" : ""}{trend.toFixed(1)}%
            </span>
            {" "}vs previous week
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="mt-6">
        <MetricsChart
          data={metrics}
          dataKey={metricKey}
          label={`${label} Trend`}
          color={color}
          yAxisLabel={yAxisLabel}
          darkMode={darkMode}
        />
      </div>
    </div>
  );
}

