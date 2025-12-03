/**
 * API endpoint to fetch the latest health metrics explanation from S3.
 * 
 * Fetches the explanation file for yesterday's date from the S3 bucket.
 * Returns the explanation text, insights, and flags.
 * 
 * Required environment variables:
 * - AWS_REGION
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - EXPLANATIONS_BUCKET_NAME or HEALTH_RESULTS_PROCESSED_BUCKET
 * - ULTRAHUMAN_PATIENT_ID or ULTRAHUMAN_EMAIL
 * 
 * @route GET /api/explanations/latest
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
  
  // If explicit credentials are provided, use them; otherwise let SDK use default credential chain (IAM role)
  const config: any = {
    region: region,
  };
  
  if (accessKeyId && secretAccessKey) {
    // Use explicit credentials
    config.credentials = {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    };
    console.log("[S3] Using explicit credentials from environment variables");
  } else {
    // Don't set credentials - SDK will use default credential provider chain
    // In Amplify Lambda, this will use the execution role's credentials
    console.log("[S3] Using default credential provider chain (IAM role)");
  }

  return new S3Client(config);
}

/**
 * Get yesterday's date in YYYY-MM-DD format
 */
function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

export async function GET() {
  try {
    // Debug: Log available environment variables (without sensitive values)
    console.log("[API] Checking environment variables...");
    console.log("[API] ULTRAHUMAN_PATIENT_ID exists:", !!process.env.ULTRAHUMAN_PATIENT_ID);
    console.log("[API] ULTRAHUMAN_EMAIL exists:", !!process.env.ULTRAHUMAN_EMAIL);
    console.log("[API] EXPLANATIONS_BUCKET_NAME:", process.env.EXPLANATIONS_BUCKET_NAME);
    console.log("[API] HEALTH_RESULTS_PROCESSED_BUCKET:", process.env.HEALTH_RESULTS_PROCESSED_BUCKET);
    
    // Validate required environment variables before proceeding
    const missingVars: string[] = [];
    const region = process.env.AMPLIFY_AWS_REGION || process.env.AWS_REGION;
    
    if (!region) missingVars.push("AMPLIFY_AWS_REGION (or AWS_REGION)");
    // Credentials are optional - if not provided, will use IAM role (default in Amplify)
    if (!process.env.EXPLANATIONS_BUCKET_NAME && !process.env.HEALTH_RESULTS_PROCESSED_BUCKET) {
      missingVars.push("EXPLANATIONS_BUCKET_NAME or HEALTH_RESULTS_PROCESSED_BUCKET");
    }
    
    const patientId = process.env.ULTRAHUMAN_PATIENT_ID || process.env.ULTRAHUMAN_EMAIL;
    if (!patientId) {
      missingVars.push("ULTRAHUMAN_PATIENT_ID or ULTRAHUMAN_EMAIL");
    }
    
    if (missingVars.length > 0) {
      console.error("[API] Missing env vars:", missingVars);
      console.error("[API] Available env vars:", Object.keys(process.env).filter(k => k.includes("ULTRAHUMAN") || k.includes("PATIENT") || k.includes("BUCKET")));
      return NextResponse.json(
        {
          error: "Missing required environment variables",
          details: `The following environment variables are missing: ${missingVars.join(", ")}`,
          missingVariables: missingVars,
        },
        { status: 500 }
      );
    }
    
    const s3Client = getS3Client();
    
    // Get yesterday's date
    const date = getYesterdayDate();
    
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
    
    // Handle 404 (file not found) gracefully
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return NextResponse.json(
        {
          error: "Explanation not found for yesterday's date",
          date: getYesterdayDate(),
        },
        { status: 404 }
      );
    }
    
    const errorMessage = error?.message || "Unknown error occurred";
    const statusCode = error?.$metadata?.httpStatusCode || 500;
    
    // Provide more helpful error messages
    let helpfulMessage = errorMessage;
    if (errorMessage.includes("credentials")) {
      helpfulMessage = "AWS credentials are missing or invalid. Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.";
    } else if (errorMessage.includes("region")) {
      helpfulMessage = "AWS region is not configured. Set AWS_REGION environment variable.";
    } else if (errorMessage.includes("AccessDenied") || errorMessage.includes("permission")) {
      helpfulMessage = "AWS credentials don't have permission to access S3. Check IAM permissions.";
    }
    
    return NextResponse.json(
      {
        error: "Failed to fetch explanation from S3",
        details: helpfulMessage,
        originalError: errorMessage,
      },
      { status: 500 }
    );
  }
}

