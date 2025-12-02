"use client";

import { useState, useEffect } from "react";
import { format, subDays, parseISO } from "date-fns";

interface DateRangeControlsProps {
  onDateRangeChange: (startDate: string | null, endDate: string | null, days: number | null) => void;
  defaultDays?: number;
  latestDate?: string; // Latest date available in the data
  darkMode?: boolean;
  noCard?: boolean; // If true, don't render the card wrapper
}

/**
 * Date range controls with presets and custom date picker
 */
export function DateRangeControls({ onDateRangeChange, defaultDays = 30, latestDate, darkMode = true, noCard = false }: DateRangeControlsProps) {
  const theme = {
    card: darkMode ? "bg-[#1a1a1a]" : "bg-white",
    border: darkMode ? "border-[#2a2a2a]" : "border-gray-200",
    text: darkMode ? "text-white" : "text-gray-900",
    textSecondary: darkMode ? "text-gray-400" : "text-gray-600",
    button: darkMode ? "bg-[#2a2a2a] text-gray-300 hover:bg-[#3a3a3a]" : "bg-gray-200 text-gray-700 hover:bg-gray-300",
    input: darkMode ? "bg-[#0f0f0f] border-[#2a2a2a] text-gray-200" : "bg-white border-gray-300 text-gray-900",
  };
  const [selectedPreset, setSelectedPreset] = useState<number | "custom">(defaultDays);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showCustom, setShowCustom] = useState(false);

  // Use latestDate from data if available, otherwise use today
  const getEndDate = () => {
    if (latestDate) {
      return parseISO(latestDate);
    }
    return new Date();
  };

  // Initialize date values (but don't trigger API call - parent already has initial data)
  useEffect(() => {
    if (selectedPreset !== "custom") {
      const end = getEndDate();
      const start = subDays(end, selectedPreset - 1);
      setStartDate(format(start, "yyyy-MM-dd"));
      setEndDate(format(end, "yyyy-MM-dd"));
    }
  }, [selectedPreset, latestDate]);

  const handlePresetChange = (days: number | "custom") => {
    setSelectedPreset(days);
    if (days === "custom") {
      setShowCustom(true);
    } else {
      setShowCustom(false);
      const end = getEndDate();
      const start = subDays(end, days - 1);
      const startStr = format(start, "yyyy-MM-dd");
      const endStr = format(end, "yyyy-MM-dd");
      setStartDate(startStr);
      setEndDate(endStr);
      onDateRangeChange(startStr, endStr, days);
    }
  };

  const handleApplyCustomRange = () => {
    if (startDate && endDate) {
      onDateRangeChange(startDate, endDate, null);
    }
  };

  const presets = [
    { label: "7 Days", value: 7 },
    { label: "14 Days", value: 14 },
    { label: "30 Days", value: 30 },
    { label: "Custom", value: "custom" as const },
  ];

  const content = (
    <div className={`flex ${noCard ? 'flex-col sm:flex-row sm:items-center' : 'flex-col sm:flex-row sm:items-center sm:justify-between'} gap-4`}>
      <div className="flex items-center gap-2">
        <span className={`text-sm ${theme.textSecondary}`}>Time Range:</span>
        <div className="flex gap-2">
          {presets.map((preset) => (
            <button
              key={preset.value}
              onClick={() => handlePresetChange(preset.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                selectedPreset === preset.value
                  ? darkMode
                    ? "bg-blue-600 text-white focus:ring-offset-blue-600"
                    : "bg-blue-500 text-white focus:ring-offset-blue-500"
                  : theme.button + (darkMode ? " focus:ring-offset-black" : " focus:ring-offset-white")
              }`}
              aria-pressed={selectedPreset === preset.value}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {showCustom && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={`px-3 py-1.5 text-sm rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-600 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100 ${
              darkMode
                ? `${theme.input} [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:contrast-100 focus:ring-offset-black`
                : `${theme.input} focus:ring-offset-white`
            }`}
          />
          <span className={theme.textSecondary}>to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={`px-3 py-1.5 text-sm rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-600 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100 ${
              darkMode
                ? `${theme.input} [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:contrast-100 focus:ring-offset-black`
                : `${theme.input} focus:ring-offset-white`
            }`}
          />
          <button
            onClick={handleApplyCustomRange}
            disabled={!startDate || !endDate}
            className={`px-4 py-1.5 text-sm font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              darkMode
                ? "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 focus:ring-offset-black"
                : "bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300 disabled:text-gray-500 focus:ring-offset-white"
            } disabled:cursor-not-allowed`}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );

  if (noCard) {
    return content;
  }

  return (
    <div className={`mb-6 ${theme.card} rounded-lg border ${theme.border} p-4`}>
      {content}
    </div>
  );
}

