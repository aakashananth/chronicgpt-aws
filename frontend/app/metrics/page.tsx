import { fetchLatestMetrics, fetchLatestExplanation, ExplanationResponse } from "@/lib/api";
import { MetricsDashboard } from "./components/MetricsDashboard";

/**
 * Helper to extract patient ID from metadata string
 */
function extractPatientId(metadata: string): string {
  try {
    const parsed = JSON.parse(metadata);
    return parsed.patient_id || "Demo patient";
  } catch {
    return "Demo patient";
  }
}


/**
 * Health Metrics Dashboard Page
 * Server component that fetches initial data and passes to client component
 */
export default async function MetricsPage() {
  let metrics = await fetchLatestMetrics();
  let explanation: ExplanationResponse | null = null;
  let patientId = "Demo patient";

  // Extract patient ID from first row's metadata if available
  if (metrics.length > 0 && metrics[0]._metadata) {
    patientId = extractPatientId(metrics[0]._metadata);
  }

  // Fetch explanation (don't fail the page if explanation is missing)
  try {
    explanation = await fetchLatestExplanation();
  } catch (err) {
    // Silently fail - explanation is optional
    console.log("Explanation not available:", err instanceof Error ? err.message : String(err));
  }

  return (
    <MetricsDashboard
      initialMetrics={metrics}
      initialExplanation={explanation}
      patientId={patientId}
    />
  );
}

