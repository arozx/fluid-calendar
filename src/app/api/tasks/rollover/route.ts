import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { createWeeklyRolloverService } from "@/lib/services/weekly-rollover";
import { newDate } from "@/lib/date-utils";

const LOG_SOURCE = "rollover-api";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const body = await request.json();
    
    const {
      dryRun = false,
      referenceDate,
      rolloverRecurringTasks = false,
      createAuditLog = true,
      maxTasksPerRun = 1000,
    } = body;

    logger.info(
      "Manual rollover triggered",
      {
        userId,
        dryRun,
        referenceDate,
        rolloverRecurringTasks,
      },
      LOG_SOURCE
    );

    // Create rollover service with configuration
    const rolloverService = createWeeklyRolloverService({
      enabled: true,
      dryRun,
      rolloverRecurringTasks,
      createAuditLog,
      maxTasksPerRun,
    });

    // Parse reference date if provided
    const refDate = referenceDate ? newDate(referenceDate) : newDate();

    // Perform rollover for this specific user
    const result = await rolloverService.performWeeklyRollover(refDate, userId);

    logger.info(
      "Manual rollover completed",
      {
        userId,
        result,
      },
      LOG_SOURCE
    );

    return NextResponse.json({
      success: true,
      result,
      message: dryRun 
        ? "Rollover simulation completed successfully" 
        : "Rollover completed successfully",
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      "Failed to perform manual rollover",
      {
        error: errorMsg,
      },
      LOG_SOURCE
    );

    return NextResponse.json(
      {
        success: false,
        error: "Failed to perform rollover",
        message: errorMsg,
      },
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

    const userId = auth.userId;
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get("dryRun") === "true";
    const referenceDate = searchParams.get("referenceDate");

    // Create rollover service for dry run to see what would be done
    const rolloverService = createWeeklyRolloverService({
      enabled: true,
      dryRun: true, // Always dry run for GET requests
      rolloverRecurringTasks: false,
      createAuditLog: false,
    });

    const refDate = referenceDate ? newDate(referenceDate) : newDate();
    const result = await rolloverService.performWeeklyRollover(refDate, userId);

    return NextResponse.json({
      success: true,
      result,
      message: "Preview of tasks that would be rolled over",
      preview: true,
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      "Failed to preview rollover",
      {
        error: errorMsg,
      },
      LOG_SOURCE
    );

    return NextResponse.json(
      {
        success: false,
        error: "Failed to preview rollover",
        message: errorMsg,
      },
      { status: 500 }
    );
  }
}