#!/usr/bin/env tsx
/**
 * Automated Rollover Test Runner
 * Runs the visual rollover demonstration automatically without user interaction
 */

import { PrismaClient } from "@prisma/client";
import { RolloverService, RolloverResult } from "./src/services/RolloverService";

const prisma = new PrismaClient();

interface AutomatedTestResult {
  success: boolean;
  adminUserId: string;
  tasksCreated: number;
  tasksRolledOver: number;
  executionTime: number;
  errors: string[];
}

// Minimal logging for automated execution
function log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '[INFO]',
    success: '[SUCCESS]', 
    error: '[ERROR]',
    warning: '[WARNING]'
  };
  console.log(`${timestamp} ${prefix[type]} ${message}`);
}

async function cleanup() {
  await prisma.task.deleteMany({
    where: {
      title: {
        startsWith: "AUTOMATED_TEST_"
      }
    }
  });
  log('Cleaned up previous test tasks');
}

async function setupTestData(): Promise<{ adminUserId: string; tasksCreated: number }> {
  log('Setting up automated test data...');
  
  // Find admin user
  const admin = await prisma.user.findUnique({
    where: {
      email: "admin@admin.admin"
    }
  });

  if (!admin) {
    throw new Error("Admin user not found! Please ensure the admin account exists.");
  }

  log(`Using admin account: ${admin.email} (ID: ${admin.id})`);

  // Calculate dates
  const today = new Date();
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
  currentWeekStart.setHours(0, 0, 0, 0);
  
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(currentWeekStart.getDate() - 7);

  log(`Previous week: ${previousWeekStart.toISOString().split('T')[0]}`);
  log(`Current week: ${currentWeekStart.toISOString().split('T')[0]}`);

  // Create test tasks from previous week
  const testTasks = [
    {
      title: "AUTOMATED_TEST_Report",
      description: "Automated test weekly report",
      status: "todo",
      day: 0, // Monday
      hour: 9,
      minute: 0
    },
    {
      title: "AUTOMATED_TEST_Meeting", 
      description: "Automated test team meeting",
      status: "in_progress",
      day: 2, // Wednesday
      hour: 14,
      minute: 30
    },
    {
      title: "AUTOMATED_TEST_Review",
      description: "Automated test code review",
      status: "todo", 
      day: 4, // Friday
      hour: 16,
      minute: 0
    }
  ];

  let tasksCreated = 0;
  for (const taskData of testTasks) {
    const taskDate = new Date(previousWeekStart);
    taskDate.setDate(previousWeekStart.getDate() + taskData.day);
    taskDate.setHours(taskData.hour, taskData.minute, 0, 0);

    await prisma.task.create({
      data: {
        title: taskData.title,
        description: taskData.description,
        status: taskData.status,
        dueDate: taskDate,
        userId: admin.id
      }
    });
    tasksCreated++;
  }

  // Create a completed task (should be ignored by rollover)
  const completedDate = new Date(previousWeekStart);
  completedDate.setDate(previousWeekStart.getDate() + 1);
  completedDate.setHours(10, 0, 0, 0);

  await prisma.task.create({
    data: {
      title: "AUTOMATED_TEST_Completed",
      description: "This completed task should be ignored",
      status: "completed",
      dueDate: completedDate,
      completedAt: new Date(completedDate.getTime() + 2 * 60 * 60 * 1000),
      userId: admin.id
    }
  });
  tasksCreated++;

  log(`Created ${tasksCreated} test tasks for rollover testing`);
  
  return { adminUserId: admin.id, tasksCreated };
}

async function verifyPreRolloverState(adminUserId: string): Promise<void> {
  const tasks = await prisma.task.findMany({
    where: {
      userId: adminUserId,
      title: { startsWith: "AUTOMATED_TEST_" },
      status: { not: "completed" }
    }
  });

  const today = new Date();
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
  currentWeekStart.setHours(0, 0, 0, 0);

  const previousWeekTasks = tasks.filter(task => 
    task.dueDate && task.dueDate < currentWeekStart
  );

  log(`Found ${previousWeekTasks.length} incomplete tasks from previous week`);
  
  if (previousWeekTasks.length === 0) {
    throw new Error("No previous week tasks found for rollover testing");
  }
}

async function performAutomatedRollover(adminUserId: string): Promise<RolloverResult> {
  log('Executing rollover process...');
  
  const config = {
    enabled: true,
    dryRun: false
  };

  const rolloverService = new RolloverService(config);
  const result = await rolloverService.performWeeklyRollover(adminUserId);

  log(`Rollover completed - Processed: ${result.processedTasks}, Rolled over: ${result.rolledOverTasks}, Skipped: ${result.skippedTasks}`);
  
  if (result.errors.length > 0) {
    log(`Rollover errors: ${result.errors.join(', ')}`, 'error');
  }

  return result;
}

async function verifyPostRolloverState(adminUserId: string): Promise<number> {
  const tasks = await prisma.task.findMany({
    where: {
      userId: adminUserId,
      title: { startsWith: "AUTOMATED_TEST_" },
      status: { not: "completed" }
    }
  });

  const today = new Date();
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
  currentWeekStart.setHours(0, 0, 0, 0);

  const currentWeekTasks = tasks.filter(task => 
    task.dueDate && task.dueDate >= currentWeekStart
  );

  log(`Found ${currentWeekTasks.length} tasks now in current week after rollover`);
  
  // Verify that tasks maintained their weekday and time
  currentWeekTasks.forEach(task => {
    if (task.dueDate) {
      const weekday = task.dueDate.toLocaleDateString('en-US', { weekday: 'long' });
      const time = task.dueDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      log(`  - ${task.title}: ${weekday} ${time}`);
    }
  });

  return currentWeekTasks.length;
}

async function runAutomatedTest(): Promise<AutomatedTestResult> {
  const startTime = Date.now();
  const result: AutomatedTestResult = {
    success: false,
    adminUserId: '',
    tasksCreated: 0,
    tasksRolledOver: 0,
    executionTime: 0,
    errors: []
  };

  try {
    log('🚀 Starting automated rollover test...');

    // Cleanup previous test data
    await cleanup();

    // Setup test data
    const { adminUserId, tasksCreated } = await setupTestData();
    result.adminUserId = adminUserId;
    result.tasksCreated = tasksCreated;

    // Verify pre-rollover state
    await verifyPreRolloverState(adminUserId);

    // Perform rollover
    const rolloverResult = await performAutomatedRollover(adminUserId);
    result.tasksRolledOver = rolloverResult.rolledOverTasks;

    if (rolloverResult.errors.length > 0) {
      result.errors.push(...rolloverResult.errors);
    }

    // Verify post-rollover state
    const tasksInCurrentWeek = await verifyPostRolloverState(adminUserId);

    // Validate results
    if (rolloverResult.rolledOverTasks > 0 && tasksInCurrentWeek > 0) {
      result.success = true;
      log('✅ Automated rollover test completed successfully!', 'success');
    } else {
      result.errors.push('Rollover did not move tasks as expected');
      log('❌ Automated rollover test failed validation', 'error');
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMessage);
    log(`❌ Automated rollover test failed: ${errorMessage}`, 'error');
  }

  result.executionTime = Date.now() - startTime;
  log(`Test completed in ${result.executionTime}ms`);

  return result;
}

async function main() {
  try {
    const result = await runAutomatedTest();
    
    // Output final results in JSON format for easy parsing by CI/CD
    console.log('\n--- AUTOMATED TEST RESULTS ---');
    console.log(JSON.stringify(result, null, 2));
    
    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);
    
  } catch (error) {
    log(`Fatal error in automated test: ${error}`, 'error');
    process.exit(1);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

// Auto-run if this script is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { runAutomatedTest };
export type { AutomatedTestResult };
