"use client";

import { HealthMetricRow } from "@/lib/api";
import { format, eachDayOfInterval } from "date-fns";

interface HeatmapCalendarProps {
  metrics: HealthMetricRow[];
  selectedDate: string;
  onDateSelect: (date: string) => void;
  darkMode?: boolean;
}

/**
 * Heatmap calendar component showing daily readiness scores
 * Similar to GitHub contributions graph
 * Supports dark/light mode and responsive design
 */
export function HeatmapCalendar({ metrics, selectedDate, onDateSelect, darkMode = true }: HeatmapCalendarProps) {
  // Create a map of dates to readiness scores
  const metricsMap = new Map<string, HealthMetricRow>();
  metrics.forEach(m => {
    metricsMap.set(m.metric_date, m);
  });

  // Get the last 90 days for the heatmap
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 89); // Last 90 days

  const days = eachDayOfInterval({ start: startDate, end: today });

  // Group days by week (7 days per row)
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  // Get color intensity based on readiness score with dark/light mode support
  const getColorIntensity = (score: number | null): string => {
    if (score === null) {
      return darkMode 
        ? "bg-gray-800 border border-gray-700" 
        : "bg-gray-100 border border-gray-200";
    }
    
    if (score >= 70) return darkMode ? "bg-green-600 hover:bg-green-500" : "bg-green-500 hover:bg-green-400";
    if (score >= 50) return darkMode ? "bg-yellow-600 hover:bg-yellow-500" : "bg-yellow-500 hover:bg-yellow-400";
    if (score >= 30) return darkMode ? "bg-orange-600 hover:bg-orange-500" : "bg-orange-500 hover:bg-orange-400";
    return darkMode ? "bg-red-600 hover:bg-red-500" : "bg-red-500 hover:bg-red-400";
  };

  // Get tooltip text
  const getTooltip = (date: Date, metric: HealthMetricRow | undefined): string => {
    const dateStr = format(date, "MMM d, yyyy");
    if (!metric) return `${dateStr}: No data`;
    const score = metric.readiness_score;
    return `${dateStr}: ${score !== null ? score : "N/A"} readiness${metric.is_anomalous ? " (Anomalous)" : ""}`;
  };

  const bgClass = darkMode ? "bg-[#1a1a1a]" : "bg-white";
  const borderClass = darkMode ? "border-[#2a2a2a]" : "border-gray-200";
  const textClass = darkMode ? "text-gray-300" : "text-gray-700";
  const textMutedClass = darkMode ? "text-gray-500" : "text-gray-500";
  const tooltipBgClass = darkMode ? "bg-[#0f0f0f]" : "bg-gray-900";
  const tooltipTextClass = darkMode ? "text-gray-300" : "text-white";
  const tooltipBorderClass = darkMode ? "border-[#2a2a2a]" : "border-gray-700";
  const ringOffsetClass = darkMode ? "ring-offset-[#1a1a1a]" : "ring-offset-white";

  return (
    <div className={`${bgClass} rounded-lg border ${borderClass} p-3 sm:p-4`}>
      <h3 className={`text-xs sm:text-sm font-medium ${textClass} mb-3 sm:mb-4`}>
        Readiness Heatmap (Last 90 Days)
      </h3>
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="flex gap-0.5 sm:gap-1 min-w-max">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-0.5 sm:gap-1">
              {week.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const metric = metricsMap.get(dateStr);
                const score = metric?.readiness_score ?? null;
                const isSelected = selectedDate === dateStr;
                const isAnomalous = metric?.is_anomalous || false;

                return (
                  <div
                    key={dateStr}
                    className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm cursor-pointer transition-all relative group ${
                      getColorIntensity(score)
                    } ${
                      isSelected ? `ring-2 ring-blue-500 ring-offset-1 ${ringOffsetClass}` : ""
                    } ${
                      isAnomalous ? "border border-red-400" : ""
                    }`}
                    onClick={() => onDateSelect(dateStr)}
                    title={getTooltip(day, metric)}
                  >
                    {/* Tooltip on hover */}
                    <div className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 ${tooltipBgClass} text-xs ${tooltipTextClass} rounded border ${tooltipBorderClass} opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap shadow-lg`}>
                      {getTooltip(day, metric)}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className={`flex items-center justify-between mt-3 sm:mt-4 text-xs ${textMutedClass}`}>
        <span>Less</span>
        <div className="flex gap-0.5 sm:gap-1">
          <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm ${darkMode ? "bg-red-600" : "bg-red-500"}`}></div>
          <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm ${darkMode ? "bg-orange-600" : "bg-orange-500"}`}></div>
          <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm ${darkMode ? "bg-yellow-600" : "bg-yellow-500"}`}></div>
          <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm ${darkMode ? "bg-green-600" : "bg-green-500"}`}></div>
        </div>
        <span>More</span>
      </div>
    </div>
  );
}

