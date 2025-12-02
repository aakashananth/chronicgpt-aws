"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { HealthMetricRow } from "@/lib/api";

interface MetricsChartProps {
  data: HealthMetricRow[];
  dataKey: keyof HealthMetricRow;
  label: string;
  color: string;
  yAxisLabel?: string;
  darkMode?: boolean;
}

/**
 * Single metric line chart component
 */
export function MetricsChart({
  data,
  dataKey,
  label,
  color,
  yAxisLabel,
  darkMode = true,
}: MetricsChartProps) {
  const theme = {
    card: darkMode ? "bg-[#1a1a1a]" : "bg-white",
    border: darkMode ? "border-[#2a2a2a]" : "border-gray-200",
    text: darkMode ? "text-gray-300" : "text-gray-700",
    gridStroke: darkMode ? "#2a2a2a" : "#e5e7eb",
    axisStroke: darkMode ? "#666" : "#9ca3af",
    tickFill: darkMode ? "#999" : "#6b7280",
    tooltipBg: darkMode ? "#0f0f0f" : "#ffffff",
    tooltipBorder: darkMode ? "#2a2a2a" : "#e5e7eb",
    tooltipText: darkMode ? "#fff" : "#111827",
    tooltipLabel: darkMode ? "#999" : "#6b7280",
    dotStroke: darkMode ? "#fff" : "#000",
  };
  // Format data for chart - use short date format
  // Parse YYYY-MM-DD format directly to avoid timezone issues
  const chartData = data.map((metric) => {
    const [year, month, day] = metric.metric_date.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return {
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      fullDate: metric.metric_date,
      value: metric[dataKey] as number | null,
      isAnomalous: metric.is_anomalous,
    };
  });


  return (
    <div className={`${theme.card} rounded-lg border ${theme.border} p-4`}>
      <h3 className={`text-sm font-medium ${theme.text} mb-4`}>{label}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
          <XAxis
            dataKey="date"
            stroke={theme.axisStroke}
            tick={{ fill: theme.tickFill, fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis
            stroke={theme.axisStroke}
            tick={{ fill: theme.tickFill, fontSize: 12 }}
            label={
              yAxisLabel
                ? {
                    value: yAxisLabel,
                    angle: -90,
                    position: "insideLeft",
                    style: { fill: theme.tickFill, fontSize: 12 },
                  }
                : undefined
            }
          />
          <Tooltip
            contentStyle={{
              backgroundColor: theme.tooltipBg,
              border: `1px solid ${theme.tooltipBorder}`,
              borderRadius: "6px",
              color: theme.tooltipText,
            }}
            labelStyle={{ color: theme.tooltipLabel }}
            formatter={(value: any) => {
              if (value === null || value === undefined) return "N/A";
              return typeof value === "number"
                ? value.toLocaleString("en-US", { maximumFractionDigits: 1 })
                : value;
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={(props) => {
              const { payload, value } = props;
              // Don't show dots for null/undefined values
              if (value === null || value === undefined) {
                return null;
              }
              // Show red dot for anomalous days
              if (payload.isAnomalous) {
                return (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={5}
                    fill="#ef4444"
                    stroke={theme.dotStroke}
                    strokeWidth={2}
                  />
                );
              }
              // Show normal colored dot for regular days
              return <circle cx={props.cx} cy={props.cy} r={3} fill={color} />;
            }}
            activeDot={{ r: 6 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface CombinedMetricsChartProps {
  data: HealthMetricRow[];
  darkMode?: boolean;
}

/**
 * Combined chart showing multiple metrics
 */
export function CombinedMetricsChart({ data, darkMode = true }: CombinedMetricsChartProps) {
  const theme = {
    card: darkMode ? "bg-[#1a1a1a]" : "bg-white",
    border: darkMode ? "border-[#2a2a2a]" : "border-gray-200",
    text: darkMode ? "text-gray-300" : "text-gray-700",
    gridStroke: darkMode ? "#2a2a2a" : "#e5e7eb",
    axisStroke: darkMode ? "#666" : "#9ca3af",
    tickFill: darkMode ? "#999" : "#6b7280",
    tooltipBg: darkMode ? "#0f0f0f" : "#ffffff",
    tooltipBorder: darkMode ? "#2a2a2a" : "#e5e7eb",
    tooltipText: darkMode ? "#fff" : "#111827",
    tooltipLabel: darkMode ? "#999" : "#6b7280",
    dotStroke: darkMode ? "#fff" : "#000",
  };
  // Parse YYYY-MM-DD format directly to avoid timezone issues
  const chartData = data.map((metric) => {
    const [year, month, day] = metric.metric_date.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return {
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      fullDate: metric.metric_date,
      hrv: metric.hrv,
      resting_hr: metric.resting_hr,
      sleep_score: metric.sleep_score,
      steps: metric.steps ? metric.steps / 1000 : null, // Normalize steps to thousands
      isAnomalous: metric.is_anomalous,
    };
  });

  return (
    <div className={`${theme.card} rounded-lg border ${theme.border} p-4`}>
      <h3 className={`text-sm font-medium ${theme.text} mb-4`}>All Metrics Overview</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
          <XAxis
            dataKey="date"
            stroke={theme.axisStroke}
            tick={{ fill: theme.tickFill, fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis
            yAxisId="left"
            stroke={theme.axisStroke}
            tick={{ fill: theme.tickFill, fontSize: 12 }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke={theme.axisStroke}
            tick={{ fill: theme.tickFill, fontSize: 12 }}
            label={{
              value: "Steps (thousands)",
              angle: 90,
              position: "insideRight",
              style: { fill: theme.tickFill, fontSize: 12 },
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: theme.tooltipBg,
              border: `1px solid ${theme.tooltipBorder}`,
              borderRadius: "6px",
              color: theme.tooltipText,
            }}
            labelStyle={{ color: theme.tooltipLabel }}
            formatter={(value: any, name: string) => {
              if (value === null || value === undefined) return "N/A";
              if (name === "steps") {
                return `${(value * 1000).toLocaleString()} steps`;
              }
              return typeof value === "number"
                ? value.toLocaleString("en-US", { maximumFractionDigits: 1 })
                : value;
            }}
          />
          <Legend
            wrapperStyle={{ color: theme.tickFill, fontSize: "12px" }}
            iconType="line"
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="hrv"
            name="HRV"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={(props) => {
              const { payload, value } = props;
              // Don't show dots for null/undefined values
              if (value === null || value === undefined) {
                return null;
              }
              // Show red dot for anomalous days
              if (payload.isAnomalous) {
                return (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={4}
                    fill="#ef4444"
                    stroke={theme.dotStroke}
                    strokeWidth={1.5}
                  />
                );
              }
              return null;
            }}
            activeDot={{ r: 5 }}
            connectNulls={false}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="resting_hr"
            name="Resting HR"
            stroke="#ef4444"
            strokeWidth={2}
            dot={(props) => {
              const { payload, value } = props;
              // Don't show dots for null/undefined values
              if (value === null || value === undefined) {
                return null;
              }
              // Show red dot for anomalous days
              if (payload.isAnomalous) {
                return (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={4}
                    fill="#ef4444"
                    stroke={theme.dotStroke}
                    strokeWidth={1.5}
                  />
                );
              }
              return null;
            }}
            activeDot={{ r: 5 }}
            connectNulls={false}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="sleep_score"
            name="Sleep Score"
            stroke="#10b981"
            strokeWidth={2}
            dot={(props) => {
              const { payload, value } = props;
              // Don't show dots for null/undefined values
              if (value === null || value === undefined) {
                return null;
              }
              // Show red dot for anomalous days
              if (payload.isAnomalous) {
                return (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={4}
                    fill="#ef4444"
                    stroke={theme.dotStroke}
                    strokeWidth={1.5}
                  />
                );
              }
              return null;
            }}
            activeDot={{ r: 5 }}
            connectNulls={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="steps"
            name="Steps (k)"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={(props) => {
              const { payload, value } = props;
              // Don't show dots for null/undefined values
              if (value === null || value === undefined) {
                return null;
              }
              // Show red dot for anomalous days
              if (payload.isAnomalous) {
                return (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={4}
                    fill="#ef4444"
                    stroke={theme.dotStroke}
                    strokeWidth={1.5}
                  />
                );
              }
              return null;
            }}
            activeDot={{ r: 5 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

