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

// Initialize S3 client with credentials from environment variables
// Note: Amplify doesn't allow AWS_ prefixed variables, so we use AMPLIFY_AWS_ prefix
const getS3Client = () => {
  const region = process.env.AMPLIFY_AWS_REGION || process.env.AWS_REGION;
  const accessKeyId = process.env.AMPLIFY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AMPLIFY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  
  if (!region) {
    throw new Error("AWS region not configured. Set AMPLIFY_AWS_REGION or AWS_REGION environment variable.");
  }
  
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS credentials not configured. Set AMPLIFY_AWS_ACCESS_KEY_ID and AMPLIFY_AWS_SECRET_ACCESS_KEY environment variables.");
  }

  return new S3Client({
    region: region,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    },
  });
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
    // Validate required environment variables before proceeding
    const missingVars: string[] = [];
    const region = process.env.AMPLIFY_AWS_REGION || process.env.AWS_REGION;
    const accessKeyId = process.env.AMPLIFY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AMPLIFY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
    
    if (!region) missingVars.push("AMPLIFY_AWS_REGION (or AWS_REGION)");
    if (!accessKeyId) missingVars.push("AMPLIFY_AWS_ACCESS_KEY_ID (or AWS_ACCESS_KEY_ID)");
    if (!secretAccessKey) missingVars.push("AMPLIFY_AWS_SECRET_ACCESS_KEY (or AWS_SECRET_ACCESS_KEY)");
    if (!process.env.EXPLANATIONS_BUCKET_NAME && !process.env.HEALTH_RESULTS_PROCESSED_BUCKET) {
      missingVars.push("EXPLANATIONS_BUCKET_NAME or HEALTH_RESULTS_PROCESSED_BUCKET");
    }
    if (!process.env.ULTRAHUMAN_PATIENT_ID && !process.env.ULTRAHUMAN_EMAIL) {
      missingVars.push("ULTRAHUMAN_PATIENT_ID or ULTRAHUMAN_EMAIL");
    }
    
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
    
    const s3Client = getS3Client();
    
    // Get yesterday's date
    const date = getYesterdayDate();
    
    // Get patient ID from environment variable (required)
    if (!process.env.ULTRAHUMAN_PATIENT_ID && !process.env.ULTRAHUMAN_EMAIL) {
      throw new Error("ULTRAHUMAN_PATIENT_ID or ULTRAHUMAN_EMAIL environment variable is required");
    }
    const patientId = process.env.ULTRAHUMAN_PATIENT_ID || process.env.ULTRAHUMAN_EMAIL!;
    
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

