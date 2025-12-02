/**
 * API client utilities for fetching health metrics data.
 */

// Re-export HealthMetricRow type (duplicated from route.ts for easier imports)
export interface HealthMetricRow {
  metric_date: string;
  hrv: number | null;
  resting_hr: number | null;
  sleep_score: number | null;
  steps: number | null;
  recovery_index: number | null;
  movement_index: number | null;
  hrv_baseline: number | null;
  rhr_baseline: number | null;
  recovery_baseline: number | null;
  movement_baseline: number | null;
  steps_baseline: number | null;
  low_hrv_flag: boolean;
  high_rhr_flag: boolean;
  low_sleep_flag: boolean;
  low_recovery_flag: boolean;
  low_movement_flag: boolean;
  low_steps_flag: boolean;
  is_anomalous: boolean;
  anomaly_severity: number;
  readiness_score: number | null;  // Computed server-side
  _metadata: string;       // keep as raw string for now
  processed_at: string;
  rn?: number;
}

/**
 * Response type from /api/metrics/latest endpoint
 */
interface MetricsLatestResponse {
  data: HealthMetricRow[];
}

/**
 * Fetches the latest health metrics from the API.
 * Works in both server components and client components.
 * 
 * @returns Promise resolving to an array of HealthMetricRow objects
 * @throws Error if the API request fails or response is invalid
 */
export async function fetchLatestMetrics(): Promise<HealthMetricRow[]> {
  try {
    // Construct absolute URL for server components
    // In client components, relative URLs work fine
    let url: string;
    
    if (typeof window !== "undefined") {
      // Client component - use relative URL
      url = "/api/metrics/latest";
    } else {
      // Server component - need absolute URL
      let baseUrl: string;
      if (process.env.NEXT_PUBLIC_BASE_URL) {
        baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
      } else if (process.env.VERCEL_URL) {
        baseUrl = `https://${process.env.VERCEL_URL}`;
      } else if (process.env.AWS_AMPLIFY_URL) {
        baseUrl = process.env.AWS_AMPLIFY_URL;
      } else {
        // Fallback: try to construct from request headers or use localhost
        baseUrl = `http://localhost:${process.env.PORT || 3000}`;
      }
      url = `${baseUrl}/api/metrics/latest`;
    }
    
    const response = await fetch(url, {
      cache: "no-store", // Always fetch fresh data
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API request failed with status ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.details || errorMessage;
      } catch {
        // If error response isn't JSON, use the text as-is
        if (errorText) {
          errorMessage = errorText;
        }
      }
      
      throw new Error(errorMessage);
    }

    const json: MetricsLatestResponse = await response.json();

    if (!json || !Array.isArray(json.data)) {
      throw new Error("Invalid API response: missing or invalid data array");
    }

    return json.data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to fetch latest metrics: ${String(error)}`);
  }
}

/**
 * Explanation response type from /api/explanations/latest endpoint
 */
export interface ExplanationResponse {
  date: string;
  explanation: string;
  insights: string[];
  flags: string[];
}

/**
 * Fetches the latest health metrics explanation from the API.
 * Works in both server components and client components.
 * 
 * @returns Promise resolving to an ExplanationResponse object
 * @throws Error if the API request fails or response is invalid
 */
export async function fetchLatestExplanation(): Promise<ExplanationResponse> {
  try {
    // Construct absolute URL for server components
    // In client components, relative URLs work fine
    let url: string;
    
    if (typeof window !== "undefined") {
      // Client component - use relative URL
      url = "/api/explanations/latest";
    } else {
      // Server component - need absolute URL
      let baseUrl: string;
      if (process.env.NEXT_PUBLIC_BASE_URL) {
        baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
      } else if (process.env.VERCEL_URL) {
        baseUrl = `https://${process.env.VERCEL_URL}`;
      } else if (process.env.AWS_AMPLIFY_URL) {
        baseUrl = process.env.AWS_AMPLIFY_URL;
      } else {
        // Fallback: try to construct from request headers or use localhost
        baseUrl = `http://localhost:${process.env.PORT || 3000}`;
      }
      url = `${baseUrl}/api/explanations/latest`;
    }
    
    const response = await fetch(url, {
      cache: "no-store", // Always fetch fresh data
    });

    if (!response.ok) {
      // Handle 404 gracefully (no explanation available)
      if (response.status === 404) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.error || "Explanation not available");
      }
      
      const errorText = await response.text();
      let errorMessage = `API request failed with status ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.details || errorMessage;
      } catch {
        // If error response isn't JSON, use the text as-is
        if (errorText) {
          errorMessage = errorText;
        }
      }
      
      throw new Error(errorMessage);
    }

    const json: ExplanationResponse = await response.json();

    if (!json || typeof json.explanation !== "string") {
      throw new Error("Invalid API response: missing or invalid explanation");
    }

    return json;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to fetch latest explanation: ${String(error)}`);
  }
}

/**
 * Fetches health metrics explanation from the API for a specific date.
 * Works in both server components and client components.
 * 
 * @param date - Date in YYYY-MM-DD format
 * @returns Promise resolving to an ExplanationResponse object, or null if not found
 * @throws Error if the API request fails (except 404 which returns null)
 */
export async function fetchExplanationByDate(date: string): Promise<ExplanationResponse | null> {
  try {
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD`);
    }
    
    // Construct absolute URL for server components
    // In client components, relative URLs work fine
    let url: string;
    
    // Encode date for URL (though YYYY-MM-DD shouldn't need encoding, it's safer)
    const encodedDate = encodeURIComponent(date);
    
    if (typeof window !== "undefined") {
      // Client component - use relative URL
      url = `/api/explanations/${encodedDate}`;
    } else {
      // Server component - need absolute URL
      let baseUrl: string;
      if (process.env.NEXT_PUBLIC_BASE_URL) {
        baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
      } else if (process.env.VERCEL_URL) {
        baseUrl = `https://${process.env.VERCEL_URL}`;
      } else if (process.env.AWS_AMPLIFY_URL) {
        baseUrl = process.env.AWS_AMPLIFY_URL;
      } else {
        // Fallback: try to construct from request headers or use localhost
        baseUrl = `http://localhost:${process.env.PORT || 3000}`;
      }
      url = `${baseUrl}/api/explanations/${encodedDate}`;
    }
    
    const response = await fetch(url, {
      cache: "no-store", // Always fetch fresh data
    });

    if (!response.ok) {
      // Handle 404 gracefully (no explanation available for this date)
      if (response.status === 404) {
        return null;
      }
      
      const errorText = await response.text();
      let errorMessage = `API request failed with status ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.details || errorMessage;
      } catch {
        // If error response isn't JSON, use the text as-is
        if (errorText) {
          errorMessage = errorText;
        }
      }
      
      throw new Error(errorMessage);
    }

    const json: ExplanationResponse = await response.json();

    if (!json || typeof json.explanation !== "string") {
      throw new Error("Invalid API response: missing or invalid explanation");
    }

    return json;
  } catch (error) {
    if (error instanceof Error) {
      // If it's a 404-like error, return null instead of throwing
      if (error.message.includes("not found") || error.message.includes("not available")) {
        return null;
      }
      throw error;
    }
    throw new Error(`Failed to fetch explanation for date ${date}: ${String(error)}`);
  }
}

