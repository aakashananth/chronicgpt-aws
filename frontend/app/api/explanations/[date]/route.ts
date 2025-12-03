/**
 * API endpoint to fetch health metrics explanation from S3 for a specific date.
 * 
 * Fetches the explanation file for the specified date from the S3 bucket.
 * Returns the explanation text, insights, and flags.
 * 
 * Required environment variables:
 * - AWS_REGION
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - EXPLANATIONS_BUCKET_NAME or HEALTH_RESULTS_PROCESSED_BUCKET
 * - ULTRAHUMAN_PATIENT_ID or ULTRAHUMAN_EMAIL
 * 
 * @route GET /api/explanations/[date]
 * @param date - Date in YYYY-MM-DD format
 * @returns JSON object with date, explanation, insights, and flags
 */

import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

// Initialize S3 client with credentials from environment variables or IAM role
// Note: In Amplify, the service role is automatically used if credentials are not provided
const getS3Client = () => {
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

  return new S3Client(config);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ date: string }> | { date: string } }
) {
  try {
    // Debug: Log available environment variables (without sensitive values)
    console.log("[API] Checking environment variables...");
    console.log("[API] ULTRAHUMAN_PATIENT_ID exists:", !!process.env.ULTRAHUMAN_PATIENT_ID);
    console.log("[API] ULTRAHUMAN_EMAIL exists:", !!process.env.ULTRAHUMAN_EMAIL);
    console.log("[API] EXPLANATIONS_BUCKET_NAME:", process.env.EXPLANATIONS_BUCKET_NAME);
    console.log("[API] HEALTH_RESULTS_PROCESSED_BUCKET:", process.env.HEALTH_RESULTS_PROCESSED_BUCKET);
    
    const s3Client = getS3Client();
    
    // Get date from route parameter (handle both sync and async params)
    const resolvedParams = await Promise.resolve(params);
    let date = resolvedParams.date;
    
    // Decode URL encoding if present
    date = decodeURIComponent(date);
    
    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      console.error(`[API] Invalid date format received: "${date}" (length: ${date.length})`);
      return NextResponse.json(
        {
          error: "Invalid date format. Expected YYYY-MM-DD",
          date,
          received: resolvedParams.date,
        },
        { status: 400 }
      );
    }
    
    // Get patient ID from environment variable (required)
    const patientId = process.env.ULTRAHUMAN_PATIENT_ID || process.env.ULTRAHUMAN_EMAIL;
    if (!patientId) {
      console.error("[API] Missing patient ID. Available env vars:", Object.keys(process.env).filter(k => k.includes("ULTRAHUMAN") || k.includes("PATIENT")));
      throw new Error("ULTRAHUMAN_PATIENT_ID or ULTRAHUMAN_EMAIL environment variable is required");
    }
    
    // S3 bucket name (required)
    if (!process.env.EXPLANATIONS_BUCKET_NAME && !process.env.HEALTH_RESULTS_PROCESSED_BUCKET) {
      throw new Error("EXPLANATIONS_BUCKET_NAME or HEALTH_RESULTS_PROCESSED_BUCKET environment variable is required");
    }
    const bucketName = process.env.EXPLANATIONS_BUCKET_NAME || process.env.HEALTH_RESULTS_PROCESSED_BUCKET!;
    const key = `${patientId}/${date}.json`;
    
    console.log(`[S3] Fetching explanation from s3://${bucketName}/${key}`);
    
    // Fetch object from S3
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    
    const response = await s3Client.send(command);
    
    if (!response.Body) {
      return NextResponse.json(
        {
          error: "Explanation file not found",
          date,
          bucket: bucketName,
          key,
        },
        { status: 404 }
      );
    }
    
    // Read and parse the JSON body
    const bodyString = await response.Body.transformToString();
    const explanationData = JSON.parse(bodyString);
    
    // Extract relevant fields
    const result = {
      date,
      explanation: explanationData.explanation || explanationData.text || explanationData.content || "",
      insights: explanationData.insights || explanationData.summary || [],
      flags: explanationData.flags || explanationData.anomaly_flags || [],
    };
    
    console.log(`[S3] Successfully fetched explanation for ${date}`);
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[S3] Error fetching explanation:", error);
    console.error("[S3] Error details:", JSON.stringify(error, null, 2));
    console.error("[S3] Error name:", error?.name);
    console.error("[S3] Error code:", error?.$metadata?.httpStatusCode);
    console.error("[S3] Error message:", error?.message);
    
    // Handle 404 (file not found) gracefully
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      const resolvedParams = await Promise.resolve(params);
      return NextResponse.json(
        {
          error: "Explanation not found for the specified date",
          date: resolvedParams.date,
        },
        { status: 404 }
      );
    }
    
    const errorMessage = error?.message || "Unknown error occurred";
    const statusCode = error?.$metadata?.httpStatusCode || 500;
    
    // Provide more helpful error messages
    let helpfulMessage = errorMessage;
    if (errorMessage.includes("credentials") || error?.name === "CredentialsProviderError") {
      helpfulMessage = "AWS credentials are missing or invalid. The IAM role may not have proper permissions, or explicit credentials are required.";
    } else if (errorMessage.includes("region")) {
      helpfulMessage = "AWS region is not configured. Set AMPLIFY_AWS_REGION environment variable.";
    } else if (errorMessage.includes("AccessDenied") || errorMessage.includes("permission") || error?.name === "AccessDenied") {
      helpfulMessage = "AWS credentials don't have permission to access S3. Check IAM role permissions for S3 read access.";
    } else if (errorMessage.includes("NoSuchBucket") || errorMessage.includes("bucket")) {
      helpfulMessage = `S3 bucket not found or not accessible. Check EXPLANATIONS_BUCKET_NAME environment variable.`;
    }
    
    return NextResponse.json(
      {
        error: "Failed to fetch explanation from S3",
        details: helpfulMessage,
        originalError: errorMessage,
        errorName: error?.name,
        statusCode: statusCode,
      },
      { status: 500 }
    );
  }
}

