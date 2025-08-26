/**
 * @jest-environment node
 */
import { startOfISOWeek, endOfISOWeek, addWeeks, subWeeks } from "date-fns";

import { RolloverService } from "../services/RolloverService";

// Mock dependencies
jest.mock("@/lib/date-utils", () => ({
  newDate: jest.fn(() => new Date("2024-01-15T12:00:00Z")) // Monday
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn()
    }
  }
}));

jest.mock("@/lib/task-sync/task-change-tracker", () => ({
  TaskChangeTracker: jest.fn().mockImplementation(() => ({
    trackChange: jest.fn()
  }))
}));

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { TaskChangeTracker } from "@/lib/task-sync/task-change-tracker";

describe("RolloverService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mock to return Monday
    (newDate as jest.Mock).mockReturnValue(new Date("2024-01-15T12:00:00Z"));
  });

  describe("performWeeklyRollover", () => {
    it("should not perform rollover when disabled", async () => {
      const config = { enabled: false };
      const service = new RolloverService(config);

      const result = await service.performWeeklyRollover();

      expect(result).toEqual({
        processedTasks: 0,
        rolledOverTasks: 0,
        skippedTasks: 0,
        errors: [],
        taskIds: []
      });
      expect(prisma.task.findMany).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith("Rollover is disabled", expect.any(Object));
    });

    it("should find and rollover incomplete tasks from previous week", async () => {
      const config = { enabled: true };
      const service = new RolloverService(config);

      const mockTasks = [
        {
          id: "task-1",
          title: "Test Task 1",
          dueDate: new Date("2024-01-08T10:00:00Z"), // Previous week Monday
          userId: "user-1",
          status: "todo"
        },
        {
          id: "task-2",
          title: "Test Task 2", 
          dueDate: new Date("2024-01-12T15:00:00Z"), // Previous week Friday
          userId: "user-1",
          status: "in_progress"
        }
      ];

      (prisma.task.findMany as jest.Mock).mockResolvedValue(mockTasks);
      (prisma.task.findFirst as jest.Mock).mockResolvedValue(null); // No duplicates
      (prisma.task.update as jest.Mock).mockResolvedValue({});

      const result = await service.performWeeklyRollover("user-1");

      expect(result.processedTasks).toBe(2);
      expect(result.rolledOverTasks).toBe(2);
      expect(result.skippedTasks).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.taskIds).toEqual(["task-1", "task-2"]);

      // Verify database queries
      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: "user-1",
            dueDate: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date)
            }),
            status: { not: "completed" },
            completedAt: null
          })
        })
      );

      // Verify tasks were updated
      expect(prisma.task.update).toHaveBeenCalledTimes(2);
    });

    it("should skip tasks that would create duplicates", async () => {
      const config = { enabled: true };
      const service = new RolloverService(config);

      const mockTasks = [
        {
          id: "task-1",
          title: "Test Task",
          dueDate: new Date("2024-01-08T10:00:00Z"),
          userId: "user-1",
          status: "todo"
        }
      ];

      // Mock finding a duplicate task
      (prisma.task.findMany as jest.Mock).mockResolvedValue(mockTasks);
      (prisma.task.findFirst as jest.Mock).mockResolvedValue({
        id: "task-duplicate",
        title: "Test Task",
        dueDate: new Date("2024-01-15T10:00:00Z") // Next week same day
      });

      const result = await service.performWeeklyRollover("user-1");

      expect(result.processedTasks).toBe(1);
      expect(result.rolledOverTasks).toBe(0);
      expect(result.skippedTasks).toBe(1);
      expect(result.errors).toHaveLength(0);

      // Verify no tasks were updated
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it("should handle dry run mode", async () => {
      const config = { enabled: true, dryRun: true };
      const service = new RolloverService(config);

      const mockTasks = [
        {
          id: "task-1",
          title: "Test Task",
          dueDate: new Date("2024-01-08T10:00:00Z"),
          userId: "user-1",
          status: "todo"
        }
      ];

      (prisma.task.findMany as jest.Mock).mockResolvedValue(mockTasks);
      (prisma.task.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.performWeeklyRollover("user-1");

      expect(result.processedTasks).toBe(1);
      expect(result.rolledOverTasks).toBe(1);
      expect(result.skippedTasks).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify no actual database updates in dry run
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it("should handle tasks without due dates", async () => {
      const config = { enabled: true };
      const service = new RolloverService(config);

      const mockTasks = [
        {
          id: "task-1",
          title: "Task without due date",
          dueDate: null,
          userId: "user-1",
          status: "todo"
        }
      ];

      (prisma.task.findMany as jest.Mock).mockResolvedValue(mockTasks);

      const result = await service.performWeeklyRollover("user-1");

      expect(result.processedTasks).toBe(1);
      expect(result.rolledOverTasks).toBe(0);
      expect(result.skippedTasks).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it("should track changes for auditing", async () => {
      const config = { enabled: true };
      const service = new RolloverService(config);

      const mockTasks = [
        {
          id: "task-1",
          title: "Test Task",
          dueDate: new Date("2024-01-08T10:00:00Z"),
          userId: "user-1",
          status: "todo"
        }
      ];

      (prisma.task.findMany as jest.Mock).mockResolvedValue(mockTasks);
      (prisma.task.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.task.update as jest.Mock).mockResolvedValue({});

      const mockTracker = { trackChange: jest.fn() };
      (TaskChangeTracker as jest.Mock).mockImplementation(() => mockTracker);

      await service.performWeeklyRollover("user-1");

      expect(TaskChangeTracker).toHaveBeenCalled();
      expect(mockTracker.trackChange).toHaveBeenCalledWith(
        "task-1",
        "UPDATE",
        "user-1",
        expect.objectContaining({
          rollover: expect.objectContaining({
            previousDueDate: expect.any(String),
            newDueDate: expect.any(String),
            rolledOverAt: expect.any(String),
            reason: "weekly_rollover"
          })
        })
      );
    });

    it("should handle errors gracefully", async () => {
      const config = { enabled: true };
      const service = new RolloverService(config);

      (prisma.task.findMany as jest.Mock).mockRejectedValue(new Error("Database error"));

      const result = await service.performWeeklyRollover("user-1");

      expect(result.processedTasks).toBe(0);
      expect(result.rolledOverTasks).toBe(0);
      expect(result.skippedTasks).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Database error");
    });
  });

  describe("getConfigFromEnv", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should return enabled=true by default", () => {
      delete process.env.ROLLOVER_ENABLED;
      const config = RolloverService.getConfigFromEnv();
      expect(config.enabled).toBe(true);
    });

    it("should return enabled=false when ROLLOVER_ENABLED=false", () => {
      process.env.ROLLOVER_ENABLED = "false";
      const config = RolloverService.getConfigFromEnv();
      expect(config.enabled).toBe(false);
    });

    it("should return enabled=true when ROLLOVER_ENABLED=true", () => {
      process.env.ROLLOVER_ENABLED = "true";
      const config = RolloverService.getConfigFromEnv();
      expect(config.enabled).toBe(true);
    });
  });

  describe("ISO week calculations", () => {
    it("should calculate correct previous week boundaries", () => {
      // Test with Monday January 15, 2024
      const monday = new Date("2024-01-15T12:00:00Z");
      const currentWeekStart = startOfISOWeek(monday);
      const previousWeekStart = addWeeks(currentWeekStart, -1);
      const previousWeekEnd = endOfISOWeek(previousWeekStart);

      // Previous week should be January 8-14, 2024
      expect(previousWeekStart.toISOString()).toBe("2024-01-08T00:00:00.000Z");
      expect(previousWeekEnd.toISOString()).toBe("2024-01-14T23:59:59.999Z");
    });
  });
});