import { fetchLatestMetrics, fetchLatestExplanation, ExplanationResponse } from "@/lib/api";
import { MetricsDashboard } from "./components/MetricsDashboard";
import { headers } from "next/headers";

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
  let metrics: any[] = [];
  let explanation: ExplanationResponse | null = null;
  let patientId = "Demo patient";
  let error: string | null = null;

  // Get base URL from headers for server-side fetch
  const headersList = await headers();
  const host = headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") || "https";
  const baseUrl = host ? `${protocol}://${host}` : null;

  // Set base URL in environment if available
  if (baseUrl && !process.env.NEXT_PUBLIC_BASE_URL) {
    process.env.NEXT_PUBLIC_BASE_URL = baseUrl;
  }

  // Fetch metrics (don't fail the page if metrics fetch fails)
  try {
    metrics = await fetchLatestMetrics();
    
    // Extract patient ID from first row's metadata if available
    if (metrics.length > 0 && metrics[0]._metadata) {
      patientId = extractPatientId(metrics[0]._metadata);
    }
  } catch (err) {
    // Log error but don't crash the page
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Failed to fetch metrics:", errorMessage);
    error = errorMessage;
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
      initialError={error}
    />
  );
}

