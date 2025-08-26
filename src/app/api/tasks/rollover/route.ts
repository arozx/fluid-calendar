import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { RolloverService } from "@/services/RolloverService";

const LOG_SOURCE = "rollover-route";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const body = await request.json().catch(() => ({}));
    const { dryRun = false } = body;

    logger.info("Manual rollover triggered", {
      source: LOG_SOURCE,
      userId,
      dryRun
    });

    // Get configuration from environment
    const config = RolloverService.getConfigFromEnv();
    config.dryRun = dryRun;

    // Check if rollover is enabled
    if (!config.enabled) {
      return NextResponse.json(
        { error: "Rollover is disabled" },
        { status: 400 }
      );
    }

    // Create rollover service and perform rollover for current user
    const rolloverService = new RolloverService(config);
    const result = await rolloverService.performWeeklyRollover(userId);

    logger.info("Manual rollover completed", {
      source: LOG_SOURCE,
      userId,
      processedTasks: result.processedTasks,
      rolledOverTasks: result.rolledOverTasks,
      skippedTasks: result.skippedTasks,
      errorsCount: result.errors.length
    });

    return NextResponse.json({
      success: true,
      result,
      dryRun
    });

  } catch (error) {
    logger.error("Manual rollover failed", {
      source: LOG_SOURCE,
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      { error: "Failed to perform rollover" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    // Return rollover configuration and status
    const config = RolloverService.getConfigFromEnv();
    
    return NextResponse.json({
      enabled: config.enabled,
      nextScheduledRun: "Every Monday at 00:00 UTC" // Static info for now
    });

  } catch (error) {
    logger.error("Failed to get rollover status", {
      source: LOG_SOURCE,
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      { error: "Failed to get rollover status" },
      { status: 500 }
    );
  }
}