import { HealthMetricRow } from "@/lib/api";

interface AnomalyCardsProps {
  metrics: HealthMetricRow;
  darkMode?: boolean;
}

/**
 * Anomaly Cards Component
 * Displays colored cards for each anomaly flag from the latest metrics
 */
export function AnomalyCards({ metrics, darkMode = true }: AnomalyCardsProps) {
  const theme = {
    card: darkMode ? "bg-[#1a1a1a]" : "bg-white",
    border: darkMode ? "border-[#2a2a2a]" : "border-gray-200",
    borderHover: darkMode ? "hover:border-[#3a3a3a]" : "hover:border-gray-300",
    text: darkMode ? "text-white" : "text-gray-900",
    textSecondary: darkMode ? "text-gray-300" : "text-gray-700",
    textMuted: darkMode ? "text-gray-500" : "text-gray-500",
    badge: darkMode ? "bg-[#2a2a2a]" : "bg-gray-100",
  };
  const anomalyFlags = [
    {
      key: "low_hrv_flag",
      label: "HRV",
      description: "HRV below baseline threshold",
      value: metrics.low_hrv_flag,
      statusLabel: "Low",
    },
    {
      key: "high_rhr_flag",
      label: "Resting HR",
      description: "Resting heart rate above baseline",
      value: metrics.high_rhr_flag,
      statusLabel: "High",
    },
    {
      key: "low_sleep_flag",
      label: "Sleep Score",
      description: "Sleep score below 60",
      value: metrics.low_sleep_flag,
      statusLabel: "Low",
    },
    {
      key: "low_recovery_flag",
      label: "Recovery",
      description: "Recovery index below 50",
      value: metrics.low_recovery_flag,
      statusLabel: "Low",
    },
    {
      key: "low_movement_flag",
      label: "Movement",
      description: "Movement index below 40",
      value: metrics.low_movement_flag,
      statusLabel: "Low",
    },
    {
      key: "low_steps_flag",
      label: "Steps",
      description: "Steps below baseline threshold",
      value: metrics.low_steps_flag,
      statusLabel: "Low",
    },
  ];

  return (
    <div className="mb-8">
      <h2 className={`text-lg font-semibold ${theme.text} mb-4`}>Anomaly Flags</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {anomalyFlags.map((flag) => (
          <div
            key={flag.key}
            className={`rounded-lg border p-4 transition-colors ${
              flag.value
                ? darkMode
                  ? "bg-red-950/30 border-red-800/50 hover:border-red-700/50"
                  : "bg-red-50 border-red-200 hover:border-red-300"
                : `${theme.card} ${theme.border} ${theme.borderHover}`
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {flag.value && (
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  )}
                  <h3
                    className={`text-sm font-medium ${
                      flag.value 
                        ? darkMode ? "text-red-300" : "text-red-700"
                        : theme.textSecondary
                    }`}
                  >
                    {flag.label}
                  </h3>
                </div>
                <p className={`text-xs ${theme.textMuted} mt-1`}>{flag.description}</p>
              </div>
              <div
                className={`text-xs font-medium px-2 py-1 rounded ${
                  flag.value
                    ? darkMode
                      ? "bg-red-900/50 text-red-300"
                      : "bg-red-100 text-red-700"
                    : `${theme.badge} ${theme.textMuted}`
                }`}
              >
                {flag.value ? flag.statusLabel : "Normal"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

