"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { HealthMetricRow, ExplanationResponse, fetchExplanationByDate } from "@/lib/api";
import { MetricsChart } from "./MetricsChart";
import { AnomalyCards } from "./AnomalyCards";
import { DateRangeControls } from "./DateRangeControls";
import { MetricView } from "./MetricView";
import { format, isToday, subDays } from "date-fns";

interface MetricsDashboardProps {
  initialMetrics: HealthMetricRow[];
  initialExplanation: ExplanationResponse | null;
  patientId: string;
}

/**
 * Client component for interactive metrics dashboard
 */
export function MetricsDashboard({
  initialMetrics,
  initialExplanation,
  patientId,
}: MetricsDashboardProps) {
  // Store all loaded metrics (up to 30 days)
  const [allMetrics, setAllMetrics] = useState<HealthMetricRow[]>(initialMetrics);
  // Filtered metrics for display (based on selected date range)
  const [metrics, setMetrics] = useState<HealthMetricRow[]>(initialMetrics);
  const [explanation, setExplanation] = useState<ExplanationResponse | null>(initialExplanation);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Initialize selectedDate to the latest available date (or today if no data)
  const getDefaultDate = () => {
    if (initialMetrics.length > 0) {
      return initialMetrics.at(-1)?.metric_date ?? format(new Date(), "yyyy-MM-dd");
    }
    // Default to yesterday (YYYY-MM-DD format)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return format(yesterday, "yyyy-MM-dd");
  };

  const [selectedDate, setSelectedDate] = useState<string>(getDefaultDate());
  const [selectedMetrics, setSelectedMetrics] = useState<HealthMetricRow | null>(
    initialMetrics.length > 0 ? (initialMetrics.at(-1) ?? null) : null
  );
  const [darkMode, setDarkMode] = useState(true);
  const [viewMode, setViewMode] = useState<"overview" | "hrv" | "sleep" | "steps" | "recovery">("overview");
  const [selectedChart, setSelectedChart] = useState<"all" | "hrv" | "resting_hr" | "sleep_score" | "steps">("all");

  // Get latest metrics for summary cards
  const latest = metrics.length > 0 ? metrics[metrics.length - 1] : null;

  // Get title based on selected date
  const getTitle = () => {
    if (!selectedDate) return "Today's Health";
    try {
      const [year, month, day] = selectedDate.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      if (isToday(date)) {
        return "Today's Health";
      }
      return format(date, "MMMM d, yyyy");
    } catch {
      return "Today's Health";
    }
  };

  // Filter metrics client-side
  const filterMetrics = useCallback((startDate: string, endDate: string) => {
    return allMetrics.filter((m) => m.metric_date >= startDate && m.metric_date <= endDate);
  }, [allMetrics]);

  // Check if date range is within loaded data
  const isDateRangeInLoadedData = useCallback((startDate: string, endDate: string): boolean => {
    if (allMetrics.length === 0) return false;
    const firstDate = allMetrics[0].metric_date;
    const lastDate = allMetrics[allMetrics.length - 1].metric_date;
    return startDate >= firstDate && endDate <= lastDate;
  }, [allMetrics]);

  // Handle date range change - filter client-side for preset days, only fetch for custom ranges outside data
  const handleDateRangeChange = useCallback(async (
    startDate: string | null,
    endDate: string | null,
    days: number | null
  ) => {
    if (!startDate || !endDate) return;

    // For preset days (7, 14, 30), ALWAYS take last N days from loaded data - NO API CALL
    if (days && days <= 30 && allMetrics.length > 0) {
      // Simply take the last N days from allMetrics
      const filtered = allMetrics.slice(-days);
      setMetrics(filtered);
      return;
    }

    // For custom date ranges, check if within loaded data
    if (isDateRangeInLoadedData(startDate, endDate)) {
      // Filter client-side - no API call needed
      const filtered = filterMetrics(startDate, endDate);
      setMetrics(filtered);
      return;
    }

    // Only fetch from API if custom range is outside loaded data
    setLoading(true);
    setError(null);
    try {
      const url = `/api/metrics/latest?start_date=${startDate}&end_date=${endDate}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch metrics");
      }
      const data = await response.json();
      const newMetrics = data.data;
      
      // Update allMetrics if we got more data (merge and deduplicate)
      setAllMetrics((prev) => {
        const combined = [...prev, ...newMetrics];
        // Remove duplicates by metric_date
        const unique = combined.reduce((acc: HealthMetricRow[], curr: HealthMetricRow) => {
          if (!acc.find((m: HealthMetricRow) => m.metric_date === curr.metric_date)) {
            acc.push(curr);
          }
          return acc;
        }, [] as HealthMetricRow[]);
        // Sort by date
        return unique.sort((a: HealthMetricRow, b: HealthMetricRow) => a.metric_date.localeCompare(b.metric_date));
      });
      
      setMetrics(newMetrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, [allMetrics, filterMetrics, isDateRangeInLoadedData]);

  // Handle date selection for viewing specific day
  const handleDateSelect = (dateStr: string) => {
    setSelectedDate(dateStr);
    // Search in allMetrics, not just filtered metrics
    const found = allMetrics.find((m: HealthMetricRow) => m.metric_date === dateStr);
    setSelectedMetrics(found || null);
  };

  // Fetch explanation when selected date changes
  useEffect(() => {
    if (!selectedDate) return;

    const fetchExplanation = async () => {
      setExplanationLoading(true);
      setExplanationError(null);
      
      try {
        const explanationData = await fetchExplanationByDate(selectedDate);
        setExplanation(explanationData);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to fetch explanation";
        setExplanationError(errorMessage);
        setExplanation(null);
        console.error("Error fetching explanation:", err);
      } finally {
        setExplanationLoading(false);
      }
    };

    fetchExplanation();
  }, [selectedDate]);

  // Format number helper
  const formatNumber = (value: number | null): string => {
    if (value === null) return "N/A";
    return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  };

  // Format date helper
  const formatDate = (dateStr: string): string => {
    try {
      const [year, month, day] = dateStr.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  // Calculate trend (compare current to previous period)
  // Returns direction (up/down) and whether the change is good (for color coding)
  const calculateTrend = useCallback((
    current: number | null, 
    previous: number | null,
    lowerIsBetter: boolean = false
  ): { direction: "up" | "down" | "neutral"; percent: number; isGood: boolean } | null => {
    if (current === null || previous === null || previous === 0) return null;
    const percent = ((current - previous) / previous) * 100;
    if (Math.abs(percent) < 1) return { direction: "neutral", percent: 0, isGood: false };
    
    const direction = percent > 0 ? "up" : "down";
    // For metrics where lower is better: decrease (down) is good, increase (up) is bad
    // For metrics where higher is better: increase (up) is good, decrease (down) is bad
    const isGood = lowerIsBetter ? direction === "down" : direction === "up";
    
    return {
      direction,
      percent: Math.abs(percent),
      isGood,
    };
  }, []);

  // Calculate averages from all available metrics (not just filtered date range)
  const calculateAverages = useMemo(() => {
    if (allMetrics.length === 0) return null;
    const validMetrics = allMetrics.filter((m: HealthMetricRow) => m.metric_date);
    if (validMetrics.length === 0) return null;

    const sum = (arr: HealthMetricRow[], key: keyof HealthMetricRow) => {
      const values = arr.map((m: HealthMetricRow) => m[key]).filter((v): v is number => typeof v === "number" && v !== null && !Number.isNaN(v));
      return values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : null;
    };

    return {
      hrv: sum(validMetrics, "hrv"),
      resting_hr: sum(validMetrics, "resting_hr"),
      sleep_score: sum(validMetrics, "sleep_score"),
      steps: sum(validMetrics, "steps"),
      readiness_score: sum(validMetrics, "readiness_score"),
    };
  }, [allMetrics]);

  // Find best/worst days from all available metrics
  const findBestWorstDays = useMemo(() => {
    if (allMetrics.length === 0) return null;
    const validMetrics = allMetrics.filter(m => m.readiness_score !== null);
    if (validMetrics.length === 0) return null;

    const sorted = [...validMetrics].sort((a, b) => (b.readiness_score || 0) - (a.readiness_score || 0));
    return {
      best: sorted[0],
      worst: sorted[sorted.length - 1],
    };
  }, [allMetrics]);

  // Calculate streaks
  const calculateStreaks = useMemo(() => {
    if (allMetrics.length === 0) return { good: 0, bad: 0 };
    const sorted = [...allMetrics].sort((a, b) => a.metric_date.localeCompare(b.metric_date));
    
    let goodStreak = 0;
    let badStreak = 0;
    
    // Calculate good streak (non-anomalous days) from the end
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (!sorted[i].is_anomalous && sorted[i].readiness_score !== null) {
        goodStreak++;
      } else {
        break;
      }
    }
    
    // Calculate bad streak (anomalous days) from the end
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].is_anomalous) {
        badStreak++;
      } else {
        break;
      }
    }
    
    return { good: goodStreak, bad: badStreak };
  }, [allMetrics]);

  // Export to CSV
  const exportToCSV = useCallback(() => {
    if (metrics.length === 0) return;
    
    const headers = ["Date", "HRV", "Resting HR", "Sleep Score", "Steps", "Recovery Index", "Movement Index", "Readiness Score", "Is Anomalous", "Anomaly Severity"];
    const rows = metrics.map(m => [
      m.metric_date,
      m.hrv ?? "",
      m.resting_hr ?? "",
      m.sleep_score ?? "",
      m.steps ?? "",
      m.recovery_index ?? "",
      m.movement_index ?? "",
      m.readiness_score ?? "",
      m.is_anomalous ? "Yes" : "No",
      m.anomaly_severity,
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `health-metrics-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [metrics]);

  // Get previous period metrics for comparison
  const getPreviousPeriodMetrics = useCallback((days: number) => {
    if (allMetrics.length === 0) return null;
    const currentEnd = metrics[metrics.length - 1]?.metric_date;
    if (!currentEnd) return null;
    
    const [year, month, day] = currentEnd.split("-").map(Number);
    const endDate = new Date(year, month - 1, day);
    const startDate = subDays(endDate, days - 1);
    
    const startStr = format(startDate, "yyyy-MM-dd");
    const endStr = format(endDate, "yyyy-MM-dd");
    
    return allMetrics.filter(m => m.metric_date >= startStr && m.metric_date <= endStr);
  }, [allMetrics, metrics]);

  // Theme helper function
  const theme = {
    bg: darkMode ? "bg-black" : "bg-gray-50",
    card: darkMode ? "bg-[#1a1a1a]" : "bg-white",
    cardHover: darkMode ? "hover:bg-[#3a3a3a]" : "hover:bg-gray-50",
    border: darkMode ? "border-[#2a2a2a]" : "border-gray-200",
    text: darkMode ? "text-white" : "text-gray-900",
    textSecondary: darkMode ? "text-gray-400" : "text-gray-600",
    textMuted: darkMode ? "text-gray-500" : "text-gray-500",
    input: darkMode ? "bg-[#0f0f0f] border-[#2a2a2a] text-gray-200" : "bg-white border-gray-300 text-gray-900",
  };

  // Metric Card Component with anomaly styling, trends, and tooltips
  const MetricCard = ({ 
    label, 
    value, 
    isAnomalous = false,
    trend,
    baseline,
    tooltip,
  }: { 
    label: string; 
    value: string;
    isAnomalous?: boolean;
    trend?: { direction: "up" | "down" | "neutral"; percent: number; isGood: boolean } | null;
    baseline?: number | null;
    tooltip?: string;
  }) => {
    const currentValue = value !== "N/A" ? parseFloat(value.replace(/,/g, "")) : null;
    const progressPercent = baseline && currentValue ? Math.min(100, (currentValue / baseline) * 100) : null;
    
    return (
      <div 
        className={`rounded-lg border p-4 transition-colors relative group ${
          isAnomalous
            ? darkMode 
              ? "bg-red-950/30 border-red-800/50 hover:border-red-700/50"
              : "bg-red-50 border-red-200 hover:border-red-300"
            : `${theme.card} ${theme.border} ${theme.cardHover}`
        }`}
        title={tooltip}
      >
        <div className="flex items-start justify-between mb-1">
          <div className={`text-sm ${
            isAnomalous 
              ? darkMode ? "text-red-300" : "text-red-700"
              : theme.textSecondary
          }`}>
            {label}
          </div>
          {trend && (
            <div className={`text-xs font-medium ${
              trend.isGood ? "text-green-400" : 
              trend.direction === "neutral" ? theme.textMuted :
              "text-red-400"
            }`}>
              {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"} {trend.percent.toFixed(0)}%
            </div>
          )}
        </div>
        <div className={`text-2xl font-semibold mb-1 ${
          isAnomalous 
            ? darkMode ? "text-red-200" : "text-red-600"
            : theme.text
        }`}>
          {value}
        </div>
        {baseline && currentValue && (
          <div className={`text-xs mb-1 ${theme.textMuted}`}>
            Baseline: {formatNumber(baseline)}
          </div>
        )}
        {progressPercent !== null && baseline && (
          <div className={`w-full rounded-full h-1.5 mt-2 ${darkMode ? "bg-[#0f0f0f]" : "bg-gray-200"}`}>
            <div 
              className={`h-1.5 rounded-full ${
                progressPercent >= 100 ? "bg-green-500" :
                progressPercent >= 70 ? "bg-blue-500" :
                progressPercent >= 50 ? "bg-yellow-500" :
                "bg-red-500"
              }`}
              style={{ width: `${Math.min(100, progressPercent)}%` }}
            />
          </div>
        )}
        {tooltip && (
          <div className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs rounded border opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap ${
            darkMode 
              ? "bg-[#0f0f0f] text-gray-300 border-[#2a2a2a]"
              : "bg-white text-gray-700 border-gray-300 shadow-lg"
          }`}>
            {tooltip}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`min-h-screen py-4 sm:py-6 lg:py-8 transition-colors ${darkMode ? "bg-black" : "bg-gray-50"}`}>
      <div className="w-full px-4 sm:px-6 lg:px-8">
        {/* Header - Sticky on scroll */}
        <div className="sticky top-0 z-50 mb-4 sm:mb-6 lg:mb-8 pt-4 sm:pt-6 lg:pt-8 -mt-4 sm:-mt-6 lg:-mt-8 pb-4 backdrop-blur-sm bg-opacity-95" style={{ backgroundColor: darkMode ? "rgba(0, 0, 0, 0.95)" : "rgba(249, 250, 251, 0.95)" }}>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div>
              <h1 className={`text-2xl sm:text-3xl font-bold ${theme.text}`}>Health Metrics Dashboard</h1>
          </div>
            {/* Patient Info and Controls */}
          <div className="flex items-center gap-3">
              <div className={`text-right hidden sm:block`}>
                <div className={`text-sm font-medium ${theme.text}`}>{patientId}</div>
                <div className={`text-xs ${theme.textSecondary}`}>Patient</div>
            </div>
              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-xs sm:text-sm`}>
              {patientId.charAt(0).toUpperCase()}
            </div>
              {/* Dark/Light Mode Toggle */}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  darkMode
                    ? "bg-[#2a2a2a] hover:bg-[#3a3a3a] text-yellow-400 focus:ring-offset-black"
                    : "bg-gray-200 hover:bg-gray-300 text-gray-700 focus:ring-offset-white"
                }`}
                title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
                aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
                aria-pressed={darkMode}
              >
                {darkMode ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
          </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className={`mb-6 ${darkMode ? "bg-red-950/20" : "bg-red-50"} border ${darkMode ? "border-red-900/50" : "border-red-200"} rounded-lg p-4`}>
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className={`h-5 w-5 ${darkMode ? "text-red-500" : "text-red-600"}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className={`text-sm font-medium ${darkMode ? "text-red-400" : "text-red-600"}`}>Error loading metrics</h3>
                <div className={`mt-2 text-sm ${darkMode ? "text-red-300" : "text-red-700"}`}>{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className={`mb-6 ${theme.card} rounded-lg border ${theme.border} p-4 text-center`}>
            <p className={theme.textSecondary}>Loading metrics...</p>
          </div>
        )}

        {/* Row 1: Two Columns - Readiness/Metrics/Anomaly | Last 30 Days */}
        {!error && viewMode === "overview" && (
          <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 mb-4 sm:mb-6">
            {/* Column 1: Readiness Score + Selected Date Metrics + Anomaly Flags */}
            <div className="flex-1 min-w-0 flex flex-col gap-4 sm:gap-6">
              {/* Overall Health Readiness Score */}
            {!error && (selectedMetrics || latest) && viewMode === "overview" && (() => {
              const currentMetrics = selectedMetrics || latest;
              const readinessScore = currentMetrics?.readiness_score ?? null;
              const isAnomalous = currentMetrics?.is_anomalous || false;
              const readinessColor = readinessScore !== null && readinessScore < 50 
                ? "text-red-400" 
                : readinessScore !== null && readinessScore < 70 
                ? "text-yellow-400" 
                : "text-green-400";
              
              // Get previous day for trend calculation
              const currentDate = currentMetrics?.metric_date;
              const prevDay = currentDate ? allMetrics.find(m => {
                const [year, month, day] = currentDate.split("-").map(Number);
                const date = new Date(year, month - 1, day);
                const prevDate = subDays(date, 1);
                return m.metric_date === format(prevDate, "yyyy-MM-dd");
              }) : null;
              
              return (
                <div className={`rounded-lg border p-4 sm:p-5 transition-colors ${theme.card} ${theme.border}`}>
                  {/* Header with Title and Actions */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className={`text-lg font-semibold ${theme.text} mb-0.5`}>{getTitle()}</h2>
                      <p className={`text-xs ${theme.textSecondary}`}>Overall health readiness score</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => handleDateSelect(e.target.value)}
                        max={allMetrics.length > 0 ? allMetrics[allMetrics.length - 1].metric_date : ""}
                        min={(() => {
                          const oneYearAgo = format(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
                          const earliestMetric = allMetrics[0]?.metric_date;
                          return earliestMetric && earliestMetric < oneYearAgo ? earliestMetric : oneYearAgo;
                        })()}
                        className={`px-3 py-1.5 text-xs rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-600 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100 ${
                          darkMode
                            ? "bg-[#0f0f0f] border border-[#2a2a2a] text-gray-200 [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:contrast-100 focus:ring-offset-black"
                            : "bg-white border border-gray-300 text-gray-900 focus:ring-offset-white"
                        }`}
                      />
                      {metrics.length > 0 && (
                        <button
                          onClick={exportToCSV}
                          className={`text-xs font-medium px-3 py-1.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                            darkMode 
                              ? "bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 focus:ring-offset-black"
                              : "bg-gray-200 hover:bg-gray-300 text-gray-700 focus:ring-offset-white"
                          }`}
                        >
                          Export CSV
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Main Score Display */}
                  <div className={`flex items-center justify-between mb-4 pb-4 border-b ${theme.border}`}>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-4xl sm:text-5xl font-bold ${readinessColor}`}>
                        {readinessScore !== null ? readinessScore : "N/A"}
                      </span>
                      {readinessScore !== null && (
                        <span className={`text-xl sm:text-2xl ${theme.textMuted}`}>/ 100</span>
                      )}
                    </div>
                    {readinessScore !== null && (
                      <div className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                        readinessScore >= 70 
                          ? darkMode
                            ? "bg-green-900/50 text-green-300 border-green-800/50"
                            : "bg-green-100 text-green-800 border-green-300"
                          : readinessScore >= 50
                          ? darkMode
                            ? "bg-yellow-900/50 text-yellow-300 border-yellow-800/50"
                            : "bg-yellow-100 text-yellow-800 border-yellow-300"
                          : darkMode
                          ? "bg-red-900/50 text-red-300 border-red-800/50"
                          : "bg-red-100 text-red-800 border-red-300"
                      }`}>
                        {readinessScore >= 70 ? "Optimal" : readinessScore >= 50 ? "Moderate" : "Low"}
                      </div>
                    )}
                  </div>
                  
                  {/* Quick Stats Section */}
                  {allMetrics.length > 0 && (
                    <div className="space-y-3">
                      <h3 className={`text-xs font-semibold ${theme.text} uppercase tracking-wider`}>Quick Stats</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className={`text-xs ${theme.textMuted} mb-1`}>Avg Readiness</div>
                          <div className={`font-semibold ${theme.text} text-base`}>
                            {calculateAverages?.readiness_score ? formatNumber(calculateAverages.readiness_score) : "N/A"}
                          </div>
                        </div>
                        <div>
                          <div className={`text-xs ${theme.textMuted} mb-1`}>Anomalous Days</div>
                          <div className={`font-semibold ${theme.text} text-base`}>
                            {allMetrics.filter(m => m.is_anomalous).length} / {allMetrics.length}
                          </div>
                        </div>
                        <div>
                          <div className={`text-xs ${theme.textMuted} mb-1`}>Good Streak</div>
                          <div className="text-green-400 font-semibold text-base">{calculateStreaks.good} days</div>
                        </div>
                        <div>
                          <div className={`text-xs ${theme.textMuted} mb-1`}>Bad Streak</div>
                          <div className="text-red-400 font-semibold text-base">{calculateStreaks.bad} days</div>
                        </div>
                      </div>
                      
                      {findBestWorstDays && (
                        <div className={`grid grid-cols-2 gap-4 pt-3 border-t ${theme.border}`}>
                          <div>
                            <div className={`text-xs mb-1 ${theme.textMuted}`}>Best Day</div>
                            <div className="text-green-400 font-semibold text-sm">
                              {formatDate(findBestWorstDays.best.metric_date)} ({formatNumber(findBestWorstDays.best.readiness_score)})
                            </div>
                          </div>
                          <div>
                            <div className={`text-xs mb-1 ${theme.textMuted}`}>Worst Day</div>
                            <div className="text-red-400 font-semibold text-sm">
                              {formatDate(findBestWorstDays.worst.metric_date)} ({formatNumber(findBestWorstDays.worst.readiness_score)})
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Period Comparisons */}
                      {(() => {
                        if (allMetrics.length < 14) return null;
                        const currentWeek = allMetrics.slice(-7);
                        const previousWeek = allMetrics.slice(-14, -7);
                        if (previousWeek.length === 0 || currentWeek.length === 0) return null;
                        
                        const currentWeekValid = currentWeek.filter(m => m.readiness_score !== null);
                        const previousWeekValid = previousWeek.filter(m => m.readiness_score !== null);
                        
                        if (currentWeekValid.length === 0 || previousWeekValid.length === 0) return null;
                        
                        const currentAvg = currentWeekValid.reduce((sum, m) => sum + (m.readiness_score || 0), 0) / currentWeekValid.length;
                        const previousAvg = previousWeekValid.reduce((sum, m) => sum + (m.readiness_score || 0), 0) / previousWeekValid.length;
                        const change = currentAvg - previousAvg;
                        
                        return (
                          <div className={`pt-3 border-t ${theme.border}`}>
                            <div className={`text-xs mb-1.5 ${theme.textMuted}`}>Week-over-Week</div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`font-semibold ${theme.text} text-sm`}>This: {formatNumber(currentAvg)}</span>
                              <span className={theme.textMuted}>vs</span>
                              <span className={`${theme.textSecondary} text-sm`}>Last: {formatNumber(previousAvg)}</span>
                              {change !== 0 && (
                                <span className={`text-sm font-medium ${
                                  change > 0 ? "text-green-400" : "text-red-400"
                                }`}>
                                  ({change > 0 ? "+" : ""}{formatNumber(change)})
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })()}

              {/* Selected Date's Metrics */}
              {!error && (selectedMetrics || latest) && (() => {
                const currentMetrics = selectedMetrics || latest;
                const currentDate = currentMetrics?.metric_date;
                const prevDay = currentDate ? allMetrics.find(m => {
                  const [year, month, day] = currentDate.split("-").map(Number);
                  const date = new Date(year, month - 1, day);
                  const prevDate = subDays(date, 1);
                  return m.metric_date === format(prevDate, "yyyy-MM-dd");
                }) : null;
                
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard
                      label="HRV"
                      value={formatNumber(currentMetrics?.hrv ?? null)}
                      isAnomalous={currentMetrics?.low_hrv_flag || false}
                      trend={calculateTrend(currentMetrics?.hrv ?? null, prevDay?.hrv ?? null)}
                      baseline={currentMetrics?.hrv_baseline ?? null}
                      tooltip="Heart Rate Variability - Higher values indicate better recovery"
                    />
                    <MetricCard
                      label="Resting HR"
                      value={formatNumber(currentMetrics?.resting_hr ?? null)}
                      isAnomalous={currentMetrics?.high_rhr_flag || false}
                      trend={calculateTrend(currentMetrics?.resting_hr ?? null, prevDay?.resting_hr ?? null, true)}
                      baseline={currentMetrics?.rhr_baseline ?? null}
                      tooltip="Resting Heart Rate - Lower values indicate better cardiovascular fitness"
                    />
                    <MetricCard
                      label="Sleep Score"
                      value={formatNumber(currentMetrics?.sleep_score ?? null)}
                      isAnomalous={currentMetrics?.low_sleep_flag || false}
                      trend={calculateTrend(currentMetrics?.sleep_score ?? null, prevDay?.sleep_score ?? null)}
                      tooltip="Sleep Quality Score - Higher values indicate better sleep quality"
                    />
                    <MetricCard
                      label="Steps"
                      value={formatNumber(currentMetrics?.steps ?? null)}
                      isAnomalous={currentMetrics?.low_steps_flag || false}
                      trend={calculateTrend(currentMetrics?.steps ?? null, prevDay?.steps ?? null)}
                      baseline={currentMetrics?.steps_baseline ?? null}
                      tooltip="Daily Step Count - Higher values indicate more physical activity"
                    />
                  </div>
                );
              })()}

              {/* Anomaly Flags */}
              {!error && (selectedMetrics || latest) && (
                <AnomalyCards metrics={(selectedMetrics || latest)!} darkMode={darkMode} />
              )}
            </div>

          {/* Column 2: Last 30 Days Table */}
          {!error && metrics.length > 0 && viewMode === "overview" && (
            <div className="lg:w-96 flex-shrink-0 lg:sticky lg:top-24 lg:self-start">
              <div className={`${theme.card} rounded-lg border ${theme.border} overflow-hidden shadow-lg`}>
                <div className={`px-3 py-2 border-b ${theme.border} ${darkMode ? "bg-[#0f0f0f]" : "bg-gray-50"}`}>
                  <h2 className={`text-sm font-semibold ${theme.text}`}>Last 30 Days</h2>
                </div>
                <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-12rem)]">
                  <table className="min-w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead className={`${darkMode ? "bg-[#0f0f0f]" : "bg-gray-50"} sticky top-0 z-20`} style={{ position: 'sticky' }}>
                      <tr>
                        <th className={`px-2 py-1.5 text-left text-xs font-semibold ${darkMode ? "text-gray-400" : "text-gray-600"} uppercase tracking-wider`}>
                          Date
                        </th>
                        <th className={`px-2 py-1.5 text-left text-xs font-semibold ${darkMode ? "text-gray-400" : "text-gray-600"} uppercase tracking-wider`}>
                          HRV
                        </th>
                        <th className={`px-2 py-1.5 text-left text-xs font-semibold ${darkMode ? "text-gray-400" : "text-gray-600"} uppercase tracking-wider hidden sm:table-cell`}>
                          RHR
                        </th>
                        <th className={`px-2 py-1.5 text-left text-xs font-semibold ${darkMode ? "text-gray-400" : "text-gray-600"} uppercase tracking-wider`}>
                          Sleep
                        </th>
                        <th className={`px-2 py-1.5 text-left text-xs font-semibold ${darkMode ? "text-gray-400" : "text-gray-600"} uppercase tracking-wider hidden md:table-cell`}>
                          Steps
                        </th>
                      </tr>
                    </thead>
                    <tbody className={`${theme.card} divide-y`} style={{ borderColor: darkMode ? "#2a2a2a" : "#e5e7eb" }}>
                      {[...metrics].reverse().map((metric, index) => (
                        <tr
                          key={`${metric.metric_date}-${index}`}
                          className={`transition-colors focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 ${
                            metric.is_anomalous
                              ? darkMode
                                ? "bg-red-950/30 hover:bg-red-950/50 border-l-4 border-l-red-500 focus-within:ring-offset-black"
                                : "bg-red-50 hover:bg-red-100 border-l-4 border-l-red-500 focus-within:ring-offset-white"
                              : selectedDate === metric.metric_date
                              ? darkMode
                                ? "bg-blue-950/30 hover:bg-blue-950/50 border-l-4 border-l-blue-500 focus-within:ring-offset-black"
                                : "bg-blue-50 hover:bg-blue-100 border-l-4 border-l-blue-500 focus-within:ring-offset-white"
                              : darkMode
                              ? "hover:bg-[#1a1a1a] border-l-4 border-l-transparent focus-within:ring-offset-black"
                              : "hover:bg-gray-50 border-l-4 border-l-transparent focus-within:ring-offset-white"
                          }`}
                          onClick={() => handleDateSelect(metric.metric_date)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleDateSelect(metric.metric_date);
                            }
                          }}
                          role="row"
                          tabIndex={0}
                          aria-label={`Select date ${formatDate(metric.metric_date)}`}
                          aria-selected={selectedDate === metric.metric_date}
                          style={{ cursor: "pointer" }}
                        >
                          <td className={`px-2 py-1.5 whitespace-nowrap text-xs font-medium ${theme.text}`}>
                            {formatDate(metric.metric_date)}
                          </td>
                          <td className={`px-2 py-1.5 whitespace-nowrap text-xs ${theme.text}`}>
                            {formatNumber(metric.hrv)}
                          </td>
                          <td className={`px-2 py-1.5 whitespace-nowrap text-xs ${theme.text} hidden sm:table-cell`}>
                            {formatNumber(metric.resting_hr)}
                          </td>
                          <td className={`px-2 py-1.5 whitespace-nowrap text-xs ${theme.text}`}>
                            {formatNumber(metric.sleep_score)}
                          </td>
                          <td className={`px-2 py-1.5 whitespace-nowrap text-xs ${theme.text} hidden md:table-cell`}>
                            {formatNumber(metric.steps)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Row 2: Charts - Full Width */}
        {!error && metrics.length > 0 && viewMode === "overview" && (
          <div className="mb-4 sm:mb-6">
            {/* Combined Filters Card */}
            <div className={`mb-4 ${theme.card} rounded-lg border ${theme.border} p-4`}>
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                {/* Date Range Controls - Left */}
                <div className="flex-1 min-w-0">
              <DateRangeControls 
                onDateRangeChange={handleDateRangeChange} 
                defaultDays={30}
                latestDate={allMetrics.length > 0 ? allMetrics[allMetrics.length - 1].metric_date : undefined}
                darkMode={darkMode}
                    noCard={true}
              />
                </div>

                {/* Chart Filter Controls - Right */}
                <div className="flex flex-wrap items-center gap-2 lg:flex-shrink-0">
                  {(["hrv", "resting_hr", "sleep_score", "steps"] as const).map((chart) => {
                    const isSelected = selectedChart === chart;
                    const buttonLabels: Record<typeof chart, string> = {
                      hrv: "HRV",
                      resting_hr: "Resting HR",
                      sleep_score: "Sleep Score",
                      steps: "Steps",
                    };
                    return (
                      <button
                        key={chart}
                        onClick={() => setSelectedChart(chart)}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                          isSelected
                            ? "bg-blue-600 text-white focus:ring-offset-blue-600"
                            : darkMode
                            ? "bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 focus:ring-offset-black"
                            : "bg-gray-200 hover:bg-gray-300 text-gray-700 focus:ring-offset-white"
                        }`}
                        aria-pressed={isSelected}
                      >
                        {buttonLabels[chart]}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setSelectedChart("all")}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      selectedChart === "all"
                        ? "bg-blue-600 text-white focus:ring-offset-blue-600"
                        : darkMode
                        ? "bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 focus:ring-offset-black"
                        : "bg-gray-200 hover:bg-gray-300 text-gray-700 focus:ring-offset-white"
                    }`}
                    title="Show all charts"
                    aria-label="Reset to show all charts"
                    aria-pressed={selectedChart === "all"}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Individual Metric Charts */}
            <div className={selectedChart === "all" ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "w-full"}>
              {(selectedChart === "all" || selectedChart === "hrv") && (
              <MetricsChart
                data={metrics}
                dataKey="hrv"
                label="HRV Trend"
                color="#3b82f6"
                yAxisLabel="HRV (ms)"
                darkMode={darkMode}
              />
              )}
              {(selectedChart === "all" || selectedChart === "resting_hr") && (
              <MetricsChart
                data={metrics}
                dataKey="resting_hr"
                label="Resting Heart Rate Trend"
                color="#ef4444"
                yAxisLabel="BPM"
                darkMode={darkMode}
              />
              )}
              {(selectedChart === "all" || selectedChart === "sleep_score") && (
              <MetricsChart
                data={metrics}
                dataKey="sleep_score"
                label="Sleep Score Trend"
                color="#10b981"
                yAxisLabel="Score"
                darkMode={darkMode}
              />
              )}
              {(selectedChart === "all" || selectedChart === "steps") && (
              <MetricsChart
                data={metrics}
                dataKey="steps"
                label="Steps Trend"
                color="#f59e0b"
                yAxisLabel="Steps"
                darkMode={darkMode}
              />
              )}
            </div>
          </div>
        )}

        {/* Metric-Specific Views */}
        {!error && metrics.length > 0 && viewMode !== "overview" && (
          <div className="mb-4 sm:mb-6">
            {viewMode === "hrv" && (
              <MetricView
                metrics={metrics}
                metricKey="hrv"
                label="Heart Rate Variability"
                color="#3b82f6"
                yAxisLabel="HRV (ms)"
                darkMode={darkMode}
                formatValue={formatNumber}
                getBaseline={(m) => m.hrv_baseline}
                getAnomalyFlag={(m) => m.low_hrv_flag}
                tooltip="Heart Rate Variability - Higher values indicate better recovery"
              />
            )}
            {viewMode === "sleep" && (
              <MetricView
                metrics={metrics}
                metricKey="sleep_score"
                label="Sleep Score"
                color="#10b981"
                yAxisLabel="Score"
                darkMode={darkMode}
                formatValue={formatNumber}
                getAnomalyFlag={(m) => m.low_sleep_flag}
                tooltip="Sleep Quality Score - Higher values indicate better sleep quality"
              />
            )}
            {viewMode === "steps" && (
              <MetricView
                metrics={metrics}
                metricKey="steps"
                label="Daily Steps"
                color="#f59e0b"
                yAxisLabel="Steps"
                darkMode={darkMode}
                formatValue={formatNumber}
                getBaseline={(m) => m.steps_baseline}
                getAnomalyFlag={(m) => m.low_steps_flag}
                tooltip="Daily Step Count - Higher values indicate more physical activity"
              />
            )}
            {viewMode === "recovery" && (
              <MetricView
                metrics={metrics}
                metricKey="recovery_index"
                label="Recovery Index"
                color="#8b5cf6"
                yAxisLabel="Index"
                darkMode={darkMode}
                formatValue={formatNumber}
                getBaseline={(m) => m.recovery_baseline}
                getAnomalyFlag={(m) => m.low_recovery_flag}
                tooltip="Recovery Index - Higher values indicate better recovery"
              />
            )}
          </div>
        )}

        {/* Row 3: Explanation - Full Width */}
        {viewMode === "overview" && (
          <div className={`${theme.card} rounded-lg border ${theme.border} p-4 sm:p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-semibold ${theme.text}`}>Daily AI Summary</h2>
              {explanation && (
              <span className={`text-sm ${theme.textSecondary}`}>{formatDate(explanation.date)}</span>
              )}
            </div>
            
            {explanationLoading && (
              <div className={`py-8 text-center ${theme.textSecondary}`}>
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
                <span>Loading explanation...</span>
              </div>
            )}
            
            {explanationError && !explanationLoading && (
              <div className={`py-4 ${darkMode ? "text-red-400" : "text-red-600"}`}>
                <p className="text-sm">{explanationError}</p>
              </div>
            )}
            
            {!explanation && !explanationLoading && !explanationError && (
              <div className={`py-4 ${theme.textSecondary}`}>
                <p className="text-sm">No explanation available for {formatDate(selectedDate)}</p>
              </div>
            )}
            
            {explanation && !explanationLoading && (
              <>
            <div className={`prose max-w-none ${darkMode ? "prose-invert" : ""}`}>
              <p className={`${theme.textSecondary} leading-relaxed whitespace-pre-wrap`}>
                {explanation.explanation}
              </p>
            </div>
            {explanation.insights && explanation.insights.length > 0 && (
              <div className={`mt-4 pt-4 border-t ${theme.border}`}>
                <h3 className={`text-sm font-medium ${theme.textSecondary} mb-2`}>Key Insights</h3>
                <ul className={`list-disc list-inside space-y-1 text-sm ${theme.textSecondary}`}>
                  {explanation.insights.map((insight, index) => (
                    <li key={index}>{insight}</li>
                  ))}
                </ul>
              </div>
            )}
            {explanation.flags && explanation.flags.length > 0 && (
              <div className={`mt-4 pt-4 border-t ${theme.border}`}>
                <h3 className={`text-sm font-medium ${theme.textSecondary} mb-2`}>Flags</h3>
                <div className="flex flex-wrap gap-2">
                  {explanation.flags.map((flag, index) => (
                    <span
                      key={index}
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        darkMode
                          ? "bg-yellow-900/50 text-yellow-300 border-yellow-800/50"
                          : "bg-yellow-100 text-yellow-800 border-yellow-300"
                      }`}
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

