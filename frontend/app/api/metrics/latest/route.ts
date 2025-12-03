/**
 * API endpoint to fetch health metrics from Amazon Athena.
 * 
 * Queries the configured Athena view (ATHENA_VIEW_NAME) in the configured database (ATHENA_DATABASE_NAME)
 * for the last 30 days (or custom date range).
 * Returns metrics including HRV, resting heart rate, sleep score, steps, recovery index,
 * movement index, and anomaly detection flags.
 * 
 * Required environment variables:
 * - AWS_REGION
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - ATHENA_DATABASE_NAME (defaults to "health_metrics_db")
 * - ATHENA_VIEW_NAME (defaults to "v_metrics_latest_daily")
 * - ATHENA_OUTPUT_LOCATION (defaults to "s3://health-results-athena/")
 * 
 * @route GET /api/metrics/latest
 * @returns JSON array of metric objects with date and health metric values
 */

import { NextResponse } from "next/server";
import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  QueryExecutionState,
} from "@aws-sdk/client-athena";

// Initialize Athena client with credentials from environment variables or IAM role
// Note: In Amplify, the service role is automatically used if credentials are not provided
const getAthenaClient = () => {
  const region = process.env.AMPLIFY_AWS_REGION || process.env.AWS_REGION;
  const accessKeyId = process.env.AMPLIFY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AMPLIFY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  
  if (!region) {
    throw new Error("AWS region not configured. Set AMPLIFY_AWS_REGION or AWS_REGION environment variable.");
  }
  
  // If credentials are provided, use them; otherwise use IAM role (default in Amplify)
  const config: any = {
    region: region,
  };
  
  if (accessKeyId && secretAccessKey) {
    config.credentials = {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    };
  }
  // If no credentials provided, AWS SDK will use the default credential chain (IAM role in Amplify)

  return new AthenaClient(config);
};

// Poll query status until completion
async function waitForQueryCompletion(
  client: AthenaClient,
  queryExecutionId: string,
  maxWaitTime: number = 60000 // 60 seconds default
): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 1000; // Poll every 1 second

  while (Date.now() - startTime < maxWaitTime) {
    const command = new GetQueryExecutionCommand({
      QueryExecutionId: queryExecutionId,
    });

    const response = await client.send(command);
    const state = response.QueryExecution?.Status?.State;

    if (state === QueryExecutionState.SUCCEEDED) {
      return;
    }

    if (state === QueryExecutionState.FAILED || state === QueryExecutionState.CANCELLED) {
      const reason = response.QueryExecution?.Status?.StateChangeReason || "Unknown error";
      throw new Error(`Query ${state}: ${reason}`);
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Query execution timed out after ${maxWaitTime}ms`);
}

// Extract value from Athena cell (handles all data types)
function getCellValue(cell: any): any {
  if (!cell) return null;
  if (cell.VarCharValue !== undefined) return cell.VarCharValue;
  if (cell.DoubleValue !== undefined) return cell.DoubleValue;
  if (cell.BigIntValue !== undefined) return Number(cell.BigIntValue);
  if (cell.IntegerValue !== undefined) return cell.IntegerValue;
  if (cell.BooleanValue !== undefined) return cell.BooleanValue;
  if (cell.TimestampValue !== undefined) return cell.TimestampValue;
  if (cell.DateValue !== undefined) return cell.DateValue;
  return null;
}

// TypeScript interface for normalized health metric rows
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

// Compute readiness score from health metrics
// Combines HRV, sleep, recovery, resting HR, and movement into a 0-100 score
function computeReadinessScore(metric: {
  hrv: number | null;
  resting_hr: number | null;
  sleep_score: number | null;
  recovery_index: number | null;
  movement_index: number | null;
  steps: number | null;
}): number | null {
  const weightedScores: Array<{ score: number; weight: number }> = [];
  
  // HRV component (0-100, normalized assuming range 20-100ms)
  if (metric.hrv !== null) {
    const hrvScore = Math.min(100, Math.max(0, ((metric.hrv - 20) / 80) * 100));
    weightedScores.push({ score: hrvScore, weight: 0.25 }); // 25% weight
  }
  
  // Sleep score component (already 0-100)
  if (metric.sleep_score !== null) {
    weightedScores.push({ score: metric.sleep_score, weight: 0.25 }); // 25% weight
  }
  
  // Recovery index component (already 0-100)
  if (metric.recovery_index !== null) {
    weightedScores.push({ score: metric.recovery_index, weight: 0.20 }); // 20% weight
  }
  
  // Resting HR component (inverse: lower is better, normalized assuming range 40-90 bpm)
  if (metric.resting_hr !== null) {
    const rhrScore = Math.min(100, Math.max(0, ((90 - metric.resting_hr) / 50) * 100));
    weightedScores.push({ score: rhrScore, weight: 0.15 }); // 15% weight
  }
  
  // Movement/Steps component (normalized assuming 0-15000 steps)
  if (metric.movement_index !== null) {
    weightedScores.push({ score: metric.movement_index, weight: 0.10 }); // 10% weight
  } else if (metric.steps !== null) {
    const stepsScore = Math.min(100, (metric.steps / 15000) * 100);
    weightedScores.push({ score: stepsScore, weight: 0.10 }); // 10% weight
  }
  
  // Need at least 2 components to compute a meaningful score
  if (weightedScores.length < 2) {
    return null;
  }
  
  // Calculate weighted sum
  const totalWeight = weightedScores.reduce((sum, item) => sum + item.weight, 0);
  const weightedSum = weightedScores.reduce((sum, item) => sum + (item.score * item.weight), 0);
  
  // Normalize by total weight and round to 0-100
  const score = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return Math.round(Math.min(100, Math.max(0, score)));
}

// Normalize a raw Athena row to properly typed HealthMetricRow
function normalizeMetric(raw: Record<string, any>): HealthMetricRow {
  // Helper to parse numeric values
  const parseNumber = (value: any): number | null => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      if (Number.isNaN(parsed)) return null;
      return parsed;
    }
    return null;
  };

  // Helper to parse boolean values
  const parseBoolean = (value: any): boolean => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      return value.toLowerCase() === "true" || value === "1";
    }
    if (typeof value === "number") return value !== 0;
    return false;
  };

  const normalized: HealthMetricRow = {
    metric_date: String(raw.metric_date ?? ""),
    hrv: parseNumber(raw.hrv),
    resting_hr: parseNumber(raw.resting_hr),
    sleep_score: parseNumber(raw.sleep_score),
    steps: parseNumber(raw.steps),
    recovery_index: parseNumber(raw.recovery_index),
    movement_index: parseNumber(raw.movement_index),
    hrv_baseline: parseNumber(raw.hrv_baseline),
    rhr_baseline: parseNumber(raw.rhr_baseline),
    recovery_baseline: parseNumber(raw.recovery_baseline),
    movement_baseline: parseNumber(raw.movement_baseline),
    steps_baseline: parseNumber(raw.steps_baseline),
    low_hrv_flag: parseBoolean(raw.low_hrv_flag),
    high_rhr_flag: parseBoolean(raw.high_rhr_flag),
    low_sleep_flag: parseBoolean(raw.low_sleep_flag),
    low_recovery_flag: parseBoolean(raw.low_recovery_flag),
    low_movement_flag: parseBoolean(raw.low_movement_flag),
    low_steps_flag: parseBoolean(raw.low_steps_flag),
    is_anomalous: parseBoolean(raw.is_anomalous),
    anomaly_severity: parseNumber(raw.anomaly_severity) ?? 0,
    readiness_score: null, // Will be computed below
    _metadata: String(raw._metadata ?? ""),
    processed_at: String(raw.processed_at ?? ""),
    rn: raw.rn === undefined ? undefined : parseNumber(raw.rn) ?? undefined,
  };
  
  // Compute readiness score
  normalized.readiness_score = computeReadinessScore({
    hrv: normalized.hrv,
    resting_hr: normalized.resting_hr,
    sleep_score: normalized.sleep_score,
    recovery_index: normalized.recovery_index,
    movement_index: normalized.movement_index,
    steps: normalized.steps,
  });
  
  return normalized;
}

export async function GET(request: Request) {
  try {
    // Validate required environment variables before proceeding
    const missingVars: string[] = [];
    const region = process.env.AMPLIFY_AWS_REGION || process.env.AWS_REGION;
    
    if (!region) missingVars.push("AMPLIFY_AWS_REGION (or AWS_REGION)");
    
    // Credentials are optional - if not provided, will use IAM role (default in Amplify)
    
    if (missingVars.length > 0) {
      return NextResponse.json(
        {
          error: "Missing required environment variables",
          details: `The following environment variables are missing: ${missingVars.join(", ")}`,
          missingVariables: missingVars,
        },
        { status: 500 }
      );
    }
    
    const client = getAthenaClient();

    // Parse query parameters for date range
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const days = searchParams.get("days");

    let query: string;
    
    // Get configuration from environment variables
    const databaseName = process.env.ATHENA_DATABASE_NAME || "health_metrics_db";
    const viewName = process.env.ATHENA_VIEW_NAME || "v_metrics_latest_daily";
    const outputLocation = process.env.ATHENA_OUTPUT_LOCATION || "s3://health-results-athena/";
    const workgroup = process.env.ATHENA_WORKGROUP;
    
    if (startDate && endDate) {
      // Custom date range
      query = `
        SELECT *
        FROM ${databaseName}.${viewName}
        WHERE metric_date >= DATE '${startDate}'
          AND metric_date <= DATE '${endDate}'
        ORDER BY metric_date;
      `;
    } else if (days) {
      // Preset days window
      const daysNum = Number.parseInt(days, 10);
      query = `
        SELECT *
        FROM ${databaseName}.${viewName}
        WHERE metric_date >= date_add('day', -${daysNum - 1}, current_date)
          AND metric_date <= current_date
        ORDER BY metric_date;
      `;
    } else {
      // Default: last 30 days
      query = `
        SELECT *
        FROM ${databaseName}.${viewName}
        WHERE metric_date >= date_add('day', -29, current_date)
          AND metric_date <= current_date
        ORDER BY metric_date;
      `;
    }

    // Start query execution
    const startCommand = new StartQueryExecutionCommand({
      QueryString: query,
      QueryExecutionContext: {
        Database: databaseName,
      },
      ResultConfiguration: {
        OutputLocation: outputLocation,
      },
      ...(workgroup && { WorkGroup: workgroup }),
    });

    console.log("[Athena] Starting query execution...");
    const startResponse = await client.send(startCommand);
    const queryExecutionId = startResponse.QueryExecutionId;

    if (!queryExecutionId) {
      throw new Error("Failed to start query execution");
    }

    console.log(`[Athena] Query execution ID: ${queryExecutionId}`);

    // Wait for query to complete
    await waitForQueryCompletion(client, queryExecutionId);

    // Fetch query results
    console.log("[Athena] Fetching query results...");
    const resultsCommand = new GetQueryResultsCommand({
      QueryExecutionId: queryExecutionId,
    });

    const resultsResponse = await client.send(resultsCommand);
    
    // Get column info from ResultSetMetadata
    const columnInfo = resultsResponse.ResultSet?.ResultSetMetadata?.ColumnInfo ?? [];
    const columns = columnInfo.map((c: any) => c.Name ?? "");
    
    // Get all rows - first row is header, rest are data
    const rows = resultsResponse.ResultSet?.Rows ?? [];
    const dataRows = rows.slice(1);

    // Build items array mapping columns to row data
    const items = dataRows.map((row) => {
      const obj: Record<string, any> = {};
      columns.forEach((col, idx) => {
        const cell = row.Data?.[idx];
        obj[col] = getCellValue(cell);
      });
      return obj;
    });

    console.log(`[Athena] Retrieved ${items.length} rows with ${columns.length} columns`);

    // Normalize items to properly typed HealthMetricRow
    const normalized: HealthMetricRow[] = items.map(normalizeMetric);
    
    console.log("API /metrics/latest sample row:", normalized[0]);

    return NextResponse.json({ data: normalized });
  } catch (error: any) {
    console.error("[Athena] Error:", error);
    console.error("[Athena] Error details:", JSON.stringify(error, null, 2));
    console.error("[Athena] Error name:", error?.name);
    console.error("[Athena] Error code:", error?.$metadata?.httpStatusCode);
    console.error("[Athena] Error message:", error?.message);
    
    const errorMessage = error?.message || "Unknown error occurred";
    const statusCode = error?.$metadata?.httpStatusCode || 500;
    
    // Provide more helpful error messages
    let helpfulMessage = errorMessage;
    if (errorMessage.includes("credentials") || error?.name === "CredentialsProviderError") {
      helpfulMessage = "AWS credentials are missing or invalid. The IAM role may not have proper permissions, or explicit credentials are required.";
    } else if (errorMessage.includes("region")) {
      helpfulMessage = "AWS region is not configured. Set AMPLIFY_AWS_REGION environment variable.";
    } else if (errorMessage.includes("AccessDenied") || errorMessage.includes("permission") || error?.name === "AccessDeniedException") {
      helpfulMessage = "AWS credentials don't have permission to query Athena. Check IAM role permissions for Athena access.";
    } else if (errorMessage.includes("Database") || errorMessage.includes("does not exist")) {
      helpfulMessage = `Athena database or view not found. Check ATHENA_DATABASE_NAME and ATHENA_VIEW_NAME environment variables.`;
    }

    return NextResponse.json(
      {
        error: "Failed to fetch metrics from Athena",
        details: helpfulMessage,
        originalError: errorMessage,
        errorName: error?.name,
        statusCode: statusCode,
      },
      { status: statusCode }
    );
  }
}

