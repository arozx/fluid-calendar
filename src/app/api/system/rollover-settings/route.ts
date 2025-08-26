import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { 
  getWeeklyRolloverScheduler, 
  RolloverSchedulerConfig,
  DEFAULT_SCHEDULER_CONFIG
} from "@/lib/services/weekly-rollover-scheduler";

const LOG_SOURCE = "rollover-settings-api";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    // Get current scheduler configuration
    const scheduler = getWeeklyRolloverScheduler();
    const config = scheduler.getConfig();
    const isRunning = scheduler.isRunning();
    const nextRun = scheduler.getNextRunTime();

    return NextResponse.json({
      success: true,
      config,
      status: {
        isRunning,
        nextRun: nextRun?.toISOString() || null,
      },
      defaults: DEFAULT_SCHEDULER_CONFIG,
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      "Failed to get rollover settings",
      { error: errorMsg },
      LOG_SOURCE
    );

    return NextResponse.json(
      {
        success: false,
        error: "Failed to get rollover settings",
        message: errorMsg,
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const body = await request.json();

    // Validate the configuration
    const configUpdate: Partial<RolloverSchedulerConfig> = {};
    
    if (typeof body.enabled === "boolean") {
      configUpdate.enabled = body.enabled;
    }
    
    if (typeof body.cronExpression === "string" && body.cronExpression.trim()) {
      configUpdate.cronExpression = body.cronExpression.trim();
    }
    
    if (typeof body.timezone === "string" && body.timezone.trim()) {
      configUpdate.timezone = body.timezone.trim();
    }
    
    if (typeof body.rolloverRecurringTasks === "boolean") {
      configUpdate.rolloverRecurringTasks = body.rolloverRecurringTasks;
    }
    
    if (typeof body.createAuditLog === "boolean") {
      configUpdate.createAuditLog = body.createAuditLog;
    }
    
    if (typeof body.maxTasksPerRun === "number" && body.maxTasksPerRun > 0) {
      configUpdate.maxTasksPerRun = Math.min(body.maxTasksPerRun, 10000); // Safety limit
    }
    
    if (typeof body.runOnStart === "boolean") {
      configUpdate.runOnStart = body.runOnStart;
    }

    logger.info(
      "Updating rollover scheduler configuration",
      {
        userId,
        enabled: configUpdate.enabled,
        cronExpression: configUpdate.cronExpression,
        timezone: configUpdate.timezone,
        rolloverRecurringTasks: configUpdate.rolloverRecurringTasks,
        createAuditLog: configUpdate.createAuditLog,
        maxTasksPerRun: configUpdate.maxTasksPerRun,
        runOnStart: configUpdate.runOnStart,
      },
      LOG_SOURCE
    );

    // Update the scheduler configuration
    const scheduler = getWeeklyRolloverScheduler();
    scheduler.updateConfig(configUpdate);

    // Get updated config and status
    const updatedConfig = scheduler.getConfig();
    const isRunning = scheduler.isRunning();
    const nextRun = scheduler.getNextRunTime();

    logger.info(
      "Rollover scheduler configuration updated successfully",
      {
        userId,
        enabled: updatedConfig.enabled,
        cronExpression: updatedConfig.cronExpression,
        timezone: updatedConfig.timezone,
        rolloverRecurringTasks: updatedConfig.rolloverRecurringTasks,
        isRunning,
      },
      LOG_SOURCE
    );

    return NextResponse.json({
      success: true,
      config: updatedConfig,
      status: {
        isRunning,
        nextRun: nextRun?.toISOString() || null,
      },
      message: "Rollover settings updated successfully",
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      "Failed to update rollover settings",
      { error: errorMsg },
      LOG_SOURCE
    );

    return NextResponse.json(
      {
        success: false,
        error: "Failed to update rollover settings",
        message: errorMsg,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const body = await request.json();
    const { action } = body;

    logger.info(
      "Rollover scheduler action requested",
      {
        userId,
        action,
      },
      LOG_SOURCE
    );

    const scheduler = getWeeklyRolloverScheduler();

    switch (action) {
      case "start":
        scheduler.start();
        break;
        
      case "stop":
        scheduler.stop();
        break;
        
      case "restart":
        scheduler.stop();
        scheduler.start();
        break;
        
      case "trigger":
        await scheduler.triggerManually();
        break;
        
      default:
        return NextResponse.json(
          {
            success: false,
            error: "Invalid action",
            message: `Action '${action}' is not supported. Valid actions: start, stop, restart, trigger`,
          },
          { status: 400 }
        );
    }

    const isRunning = scheduler.isRunning();
    const nextRun = scheduler.getNextRunTime();

    logger.info(
      `Rollover scheduler action '${action}' completed`,
      {
        userId,
        isRunning,
        nextRun: nextRun?.toISOString() || null,
      },
      LOG_SOURCE
    );

    return NextResponse.json({
      success: true,
      action,
      status: {
        isRunning,
        nextRun: nextRun?.toISOString() || null,
      },
      message: `Rollover scheduler ${action} completed successfully`,
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      "Failed to execute rollover scheduler action",
      { error: errorMsg },
      LOG_SOURCE
    );

    return NextResponse.json(
      {
        success: false,
        error: "Failed to execute rollover scheduler action",
        message: errorMsg,
      },
      { status: 500 }
    );
  }
}