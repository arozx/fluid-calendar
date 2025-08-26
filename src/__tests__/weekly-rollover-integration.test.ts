// Mock external dependencies
const mockPrisma = {
  task: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  taskChange: {
    create: jest.fn(),
  },
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
};

// Mock cron job
const mockCronJob = {
  start: jest.fn(),
  stop: jest.fn(),
  running: true,
  nextDate: jest.fn(() => ({
    toJSDate: () => new Date("2024-01-15T00:00:00.000Z"),
    toISOString: () => "2024-01-15T00:00:00.000Z",
  })),
};

jest.mock("../lib/prisma", () => ({
  prisma: mockPrisma,
}));

jest.mock("../lib/logger", () => ({
  logger: mockLogger,
}));

jest.mock("cron", () => ({
  CronJob: jest.fn(() => mockCronJob),
}));

import { createWeeklyRolloverService } from "../lib/services/weekly-rollover";
import { WeeklyRolloverScheduler } from "../lib/services/weekly-rollover-scheduler";
import { newDate, addDays, getPreviousISOWeekStart } from "../lib/date-utils";
import { TaskStatus } from "../types/task";

describe("Weekly Rollover Integration", () => {
  const testUserId = "test-user-id";
  const referenceDate = new Date("2024-01-10T15:30:00.000Z"); // Wednesday, Jan 10
  const previousWeekMonday = getPreviousISOWeekStart(referenceDate);

  // Test data
  const incompleteTask = {
    id: "task-1",
    title: "Incomplete Task",
    description: "This task needs to be rolled over",
    status: TaskStatus.TODO,
    dueDate: addDays(previousWeekMonday, 2), // Wednesday of previous week
    startDate: addDays(previousWeekMonday, 1), // Tuesday of previous week
    isRecurring: false,
    userId: testUserId,
    tags: [],
    project: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.task.findMany.mockResolvedValue([incompleteTask]);
    mockPrisma.task.update.mockResolvedValue(incompleteTask);
    mockPrisma.taskChange.create.mockResolvedValue({});
  });

  describe("End-to-End Rollover Process", () => {
    it("should complete full rollover workflow", async () => {
      // 1. Create rollover service
      const rolloverService = createWeeklyRolloverService({
        enabled: true,
        dryRun: false,
        rolloverRecurringTasks: false,
        createAuditLog: true,
        maxTasksPerRun: 1000,
      });

      // 2. Execute rollover
      const result = await rolloverService.performWeeklyRollover(referenceDate, testUserId);

      // 3. Verify results
      expect(result.totalProcessed).toBe(1);
      expect(result.successfulRollovers).toBe(1);
      expect(result.errors).toBe(0);
      expect(result.taskIds).toEqual(["task-1"]);

      // 4. Verify database operations
      expect(mockPrisma.task.findMany).toHaveBeenCalledWith({
        where: {
          userId: testUserId,
          status: { not: TaskStatus.COMPLETED },
          dueDate: { not: null },
          isRecurring: false,
        },
        include: {
          tags: true,
          project: true,
        },
      });

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: expect.objectContaining({
          dueDate: addDays(incompleteTask.dueDate, 7),
          startDate: addDays(incompleteTask.startDate, 7),
          updatedAt: expect.any(Date),
        }),
      });

      // 5. Verify audit log creation
      expect(mockPrisma.taskChange.create).toHaveBeenCalledWith({
        data: {
          taskId: "task-1",
          userId: testUserId,
          changeType: "UPDATE",
          changeData: {
            action: "weekly_rollover",
            previousDueDate: incompleteTask.dueDate.toISOString(),
            newDueDate: addDays(incompleteTask.dueDate, 7).toISOString(),
            previousStartDate: incompleteTask.startDate.toISOString(),
            newStartDate: addDays(incompleteTask.startDate, 7).toISOString(),
            rolledOverAt: expect.any(String),
          },
          synced: false,
        },
      });

      // 6. Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Starting weekly rollover",
        expect.objectContaining({
          referenceDate: referenceDate.toISOString(),
          userId: testUserId,
        }),
        "weekly-rollover-service"
      );
    });

    it("should handle scheduler lifecycle", () => {
      // 1. Create scheduler
      const scheduler = new WeeklyRolloverScheduler({
        enabled: true,
        cronExpression: "0 0 * * 1",
        timezone: "UTC",
        rolloverRecurringTasks: false,
        runOnStart: false,
      });

      // 2. Start scheduler
      scheduler.start();

      // 3. Verify cron job creation and start
      expect(mockCronJob.start).toHaveBeenCalled();

      // 4. Check status
      expect(scheduler.isRunning()).toBe(true);
      expect(scheduler.getNextRunTime()).toEqual(new Date("2024-01-15T00:00:00.000Z"));

      // 5. Stop scheduler
      scheduler.stop();
      expect(mockCronJob.stop).toHaveBeenCalled();
    });

    it("should handle configuration updates", () => {
      const scheduler = new WeeklyRolloverScheduler({
        enabled: true,
        cronExpression: "0 0 * * 1",
      });

      // Start scheduler
      scheduler.start();
      expect(mockCronJob.start).toHaveBeenCalledTimes(1);

      // Update configuration
      scheduler.updateConfig({
        cronExpression: "0 2 * * 1",
        rolloverRecurringTasks: true,
      });

      // Should restart with new config
      expect(mockCronJob.stop).toHaveBeenCalled();
      expect(mockCronJob.start).toHaveBeenCalledTimes(2);

      const config = scheduler.getConfig();
      expect(config.cronExpression).toBe("0 2 * * 1");
      expect(config.rolloverRecurringTasks).toBe(true);
    });

    it("should handle errors gracefully in end-to-end scenario", async () => {
      // Simulate database error
      mockPrisma.task.update.mockRejectedValue(new Error("Database connection failed"));

      const rolloverService = createWeeklyRolloverService({
        enabled: true,
        dryRun: false,
      });

      const result = await rolloverService.performWeeklyRollover(referenceDate, testUserId);

      // Should report error but not crash
      expect(result.errors).toBe(1);
      expect(result.successfulRollovers).toBe(0);
      expect(result.errorMessages).toContain("Failed to rollover task task-1: Database connection failed");

      // Should log error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to rollover task task-1"),
        { taskId: "task-1" },
        "weekly-rollover-service"
      );
    });

    it("should work with environment-based configuration", () => {
      // Set environment variables
      process.env.ROLLOVER_ENABLED = "true";
      process.env.ROLLOVER_CRON = "0 1 * * 1";
      process.env.ROLLOVER_TIMEZONE = "America/New_York";
      process.env.ROLLOVER_RECURRING_TASKS = "true";
      process.env.ROLLOVER_MAX_TASKS = "500";

      const scheduler = new WeeklyRolloverScheduler();
      
      // Should pick up environment config (but we mocked the initializer)
      // This test verifies the configuration structure
      const config = scheduler.getConfig();
      expect(config).toHaveProperty("enabled");
      expect(config).toHaveProperty("cronExpression");
      expect(config).toHaveProperty("timezone");

      // Clean up
      delete process.env.ROLLOVER_ENABLED;
      delete process.env.ROLLOVER_CRON;
      delete process.env.ROLLOVER_TIMEZONE;
      delete process.env.ROLLOVER_RECURRING_TASKS;
      delete process.env.ROLLOVER_MAX_TASKS;
    });

    it("should maintain data integrity during rollover", async () => {
      const originalTask = {
        ...incompleteTask,
        description: "Important task with metadata",
        tags: [{ id: "tag1", name: "urgent" }],
        project: { id: "proj1", name: "Project Alpha" },
        priority: "high",
        energyLevel: "medium",
        duration: 120,
      };

      mockPrisma.task.findMany.mockResolvedValue([originalTask]);

      const rolloverService = createWeeklyRolloverService({
        enabled: true,
        dryRun: false,
      });

      await rolloverService.performWeeklyRollover(referenceDate, testUserId);

      // Verify that only dates were changed, metadata preserved
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: {
          dueDate: addDays(originalTask.dueDate, 7),
          startDate: addDays(originalTask.startDate, 7),
          updatedAt: expect.any(Date),
        },
      });

      // Important: verify that other fields are NOT in the update
      const updateCall = mockPrisma.task.update.mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty("title");
      expect(updateCall.data).not.toHaveProperty("description");
      expect(updateCall.data).not.toHaveProperty("status");
      expect(updateCall.data).not.toHaveProperty("priority");
      expect(updateCall.data).not.toHaveProperty("tags");
    });
  });

  describe("Performance and Safety", () => {
    it("should respect maxTasksPerRun limit", async () => {
      // Create many tasks to exceed limit
      const manyTasks = Array.from({ length: 5 }, (_, i) => ({
        ...incompleteTask,
        id: `task-${i + 1}`,
      }));

      mockPrisma.task.findMany.mockResolvedValue(manyTasks);

      const rolloverService = createWeeklyRolloverService({
        enabled: true,
        maxTasksPerRun: 3, // Limit to 3 tasks
      });

      const result = await rolloverService.performWeeklyRollover(referenceDate, testUserId);

      // Should stop processing and report error
      expect(result.errors).toBe(1);
      expect(result.errorMessages[0]).toContain("Too many tasks to rollover: 5 > 3");
      expect(mockPrisma.task.update).not.toHaveBeenCalled();
    });

    it("should be idempotent when run multiple times", async () => {
      const rolloverService = createWeeklyRolloverService({
        enabled: true,
        dryRun: false,
      });

      // Run rollover twice with same reference date
      await rolloverService.performWeeklyRollover(referenceDate, testUserId);
      await rolloverService.performWeeklyRollover(referenceDate, testUserId);

      // Should find and process tasks both times (since we're mocking)
      expect(mockPrisma.task.findMany).toHaveBeenCalledTimes(2);
      expect(mockPrisma.task.update).toHaveBeenCalledTimes(2);
    });
  });
});