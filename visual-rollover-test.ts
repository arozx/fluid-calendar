#!/usr/bin/env tsx
/**
 * Visual Rollover Test - Interactive demonstration
 * 
 * This script provides a comprehensive visual demonstration of the weekly task rollover process.
 * It creates realistic test data using the admin account and shows the complete rollover workflow
 * with color-coded output and interactive controls.
 * 
 * FEATURES:
 * - Uses admin account (admin@admin.admin) for stable testing
 * - Creates test tasks from previous week with realistic dates/times
 * - Shows before/after states with visual formatting
 * - Interactive prompts to control demonstration flow
 * - Automatic cleanup of test data
 * - Detailed explanations of each rollover step
 * 
 * USAGE:
 * ```bash
 * # Interactive demonstration
 * npm run test:visual
 * 
 * # Or run directly
 * npx tsx visual-rollover-test.ts
 * 
 * # In Docker environment
 * docker cp visual-rollover-test.ts fluid-calendar-app-1:/app/
 * docker-compose exec app npx tsx visual-rollover-test.ts
 * ```
 * 
 * REQUIREMENTS:
 * - Running database (Docker Compose recommended)
 * - Admin account must exist in database
 * - RolloverService and dependencies available
 * 
 * @author FluidCalendar Team
 * @version 1.0.0
 */

import { PrismaClient } from "@prisma/client";
import { RolloverService, RolloverResult } from "./src/services/RolloverService";

const prisma = new PrismaClient();

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: Date | null;
}

// Color codes for better visual output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

function printHeader(title: string) {
  const border = '='.repeat(title.length + 4);
  console.log(colorize(border, 'cyan'));
  console.log(colorize(`  ${title}  `, 'cyan'));
  console.log(colorize(border, 'cyan'));
}

function printSection(title: string) {
  console.log(`\n${colorize('📋 ' + title, 'yellow')}`);
  console.log(colorize('-'.repeat(title.length + 3), 'gray'));
}

function formatDate(date: Date | null): string {
  if (!date) return colorize('No date', 'gray');
  return colorize(date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }), 'blue');
}

function getStatusColor(status: string): keyof typeof colors {
  switch (status) {
    case 'completed': return 'green';
    case 'in_progress': return 'yellow';
    case 'todo': return 'magenta';
    default: return 'gray';
  }
}

function printTask(task: Task, prefix: string = '') {
  const statusIcon = task.status === 'completed' ? '✅' : 
                    task.status === 'in_progress' ? '🔄' : '📝';
  const status = colorize(`[${task.status.toUpperCase()}]`, getStatusColor(task.status));
  
  console.log(`${prefix}${statusIcon} ${colorize(task.title, 'bright')}`);
  console.log(`${prefix}   ${status} Due: ${formatDate(task.dueDate)}`);
  if (task.description) {
    console.log(`${prefix}   ${colorize(task.description, 'gray')}`);
  }
}

async function cleanup() {
  await prisma.task.deleteMany({
    where: {
      title: {
        startsWith: "VISUAL_TEST_"
      }
    }
  });
  // Note: We keep the admin user intact
  console.log(`${colorize('🧹 Cleaned up test tasks (preserved admin account)', 'gray')}`);
}

async function createVisualTestData() {
  printSection("Creating Test Scenario");
  
  // Find admin user instead of creating a test user
  const user = await prisma.user.findUnique({
    where: {
      email: "admin@admin.admin"
    }
  });

  if (!user) {
    throw new Error("Admin user not found! Please ensure the admin account exists.");
  }

  console.log(`${colorize('👤 Using Admin Account:', 'bright')}`);
  console.log(`   📧 Email: ${colorize(user.email || 'N/A', 'blue')}`);
  console.log(`   📝 Name: ${colorize(user.name || 'N/A', 'blue')}`);
  console.log(`   🆔 User ID: ${colorize(user.id, 'gray')}`);

  // Calculate dates
  const today = new Date();
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
  currentWeekStart.setHours(0, 0, 0, 0);
  
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(currentWeekStart.getDate() - 7);

  console.log(`\n${colorize('🗓️  Week Analysis:', 'bright')}`);
  console.log(`   Previous week: ${formatDate(previousWeekStart)} to ${formatDate(new Date(previousWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000))}`);
  console.log(`   Current week:  ${formatDate(currentWeekStart)} to ${formatDate(new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000))}`);

  // Create realistic tasks
  const tasks = [
    {
      title: "VISUAL_TEST_Weekly_Report",
      description: "Prepare weekly status report for team meeting",
      status: "todo",
      day: 0, // Monday
      hour: 9,
      minute: 0
    },
    {
      title: "VISUAL_TEST_Client_Presentation",
      description: "Present Q3 results to client stakeholders",
      status: "in_progress",
      day: 2, // Wednesday  
      hour: 14,
      minute: 30
    },
    {
      title: "VISUAL_TEST_Code_Review",
      description: "Review pull requests from development team",
      status: "todo",
      day: 4, // Friday
      hour: 16,
      minute: 0
    },
    {
      title: "VISUAL_TEST_Budget_Planning",
      description: "Finalize budget allocation for next quarter",
      status: "todo",
      day: 3, // Thursday
      hour: 11,
      minute: 15
    }
  ];

  const incompleteTasks = [];
  for (const taskData of tasks) {
    const taskDate = new Date(previousWeekStart);
    taskDate.setDate(previousWeekStart.getDate() + taskData.day);
    taskDate.setHours(taskData.hour, taskData.minute, 0, 0);

    const task = await prisma.task.create({
      data: {
        title: taskData.title,
        description: taskData.description,
        status: taskData.status,
        dueDate: taskDate,
        userId: user.id
      }
    });
    incompleteTasks.push(task);
  }

  // Create a completed task (should be ignored)
  const completedDate = new Date(previousWeekStart);
  completedDate.setDate(previousWeekStart.getDate() + 1);
  completedDate.setHours(10, 0, 0, 0);

  const completedTask = await prisma.task.create({
    data: {
      title: "VISUAL_TEST_Completed_Task",
      description: "This task was completed last week",
      status: "completed",
      dueDate: completedDate,
      completedAt: new Date(completedDate.getTime() + 2 * 60 * 60 * 1000),
      userId: user.id
    }
  });

  // Create a current week task (should be ignored)
  const currentDate = new Date(currentWeekStart);
  currentDate.setDate(currentWeekStart.getDate() + 1);
  currentDate.setHours(13, 30, 0, 0);

  const currentTask = await prisma.task.create({
    data: {
      title: "VISUAL_TEST_Current_Week_Task",
      description: "This task is already in the current week",
      status: "todo",
      dueDate: currentDate,
      userId: user.id
    }
  });

  return { user, incompleteTasks, completedTask, currentTask };
}

async function showBeforeState(userId: string) {
  printSection("BEFORE Rollover - Current Task Status");
  
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      title: {
        startsWith: "VISUAL_TEST_"
      }
    },
    orderBy: {
      dueDate: "asc"
    }
  });

  console.log(`${colorize('📊 Found ' + tasks.length + ' tasks:', 'bright')}\n`);

  tasks.forEach(task => {
    printTask(task, '  ');
    console.log(); // Add spacing
  });
}

async function performVisualRollover(userId: string) {
  printSection("Performing Rollover Operation");
  
  console.log(`${colorize('🔄 Starting weekly rollover process...', 'bright')}`);
  
  const config = {
    enabled: true,
    dryRun: false
  };

  const rolloverService = new RolloverService(config);
  const result = await rolloverService.performWeeklyRollover(userId);

  console.log(`\n${colorize('📈 Rollover Results:', 'bright')}`);
  console.log(`   ${colorize('✨ Processed:', 'green')} ${result.processedTasks} tasks`);
  console.log(`   ${colorize('🔄 Rolled over:', 'green')} ${result.rolledOverTasks} tasks`);
  console.log(`   ${colorize('⏭️  Skipped:', 'yellow')} ${result.skippedTasks} tasks`);
  console.log(`   ${colorize('❌ Errors:', result.errors.length > 0 ? 'red' : 'green')} ${result.errors.length} errors`);

  if (result.errors.length > 0) {
    console.log(`\n${colorize('Error Details:', 'red')}`);
    result.errors.forEach(error => console.log(`   - ${error}`));
  }

  return result;
}

async function showAfterState(userId: string) {
  printSection("AFTER Rollover - Updated Task Status");
  
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      title: {
        startsWith: "VISUAL_TEST_"
      }
    },
    orderBy: {
      dueDate: "asc"
    }
  });

  console.log(`${colorize('📊 Updated tasks:', 'bright')}\n`);

  const now = new Date();
  const currentWeekStart = new Date(now);
  currentWeekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
  currentWeekStart.setHours(0, 0, 0, 0);

  tasks.forEach(task => {
    const isCurrentWeek = task.dueDate && task.dueDate >= currentWeekStart;
    const weekLabel = isCurrentWeek ? 
      colorize(' (Current Week)', 'green') : 
      colorize(' (Previous Week)', 'gray');
    
    printTask(task, '  ');
    console.log(`     ${weekLabel}`);
    console.log(); // Add spacing
  });
}

async function showSummary(result: RolloverResult) {
  printSection("Visual Summary");
  
  console.log(colorize('🎯 What just happened?', 'bright'));
  console.log('   1. Found incomplete tasks from PREVIOUS week');
  console.log('   2. Moved them to the SAME weekday in CURRENT week');
  console.log('   3. Preserved the exact time (hour:minute)');
  console.log('   4. Left completed tasks unchanged');
  console.log('   5. Left current week tasks unchanged');

  console.log(`\n${colorize('📊 Results Summary:', 'bright')}`);
  
  if (result.rolledOverTasks > 0) {
    console.log(`   ${colorize('✅ SUCCESS!', 'green')} ${result.rolledOverTasks} tasks were moved forward`);
    console.log(`   ${colorize('🎉 These tasks are now due this week', 'green')}`);
  } else {
    console.log(`   ${colorize('ℹ️  No tasks needed rolling over', 'blue')}`);
  }

  console.log(`\n${colorize('🔮 What happens next?', 'bright')}`);
  console.log('   • In production, this runs every Monday at 00:00 UTC');
  console.log('   • You can also trigger it manually via API or CLI');
  console.log('   • All changes are logged for audit purposes');
}

async function main() {
  try {
    printHeader('🎭 VISUAL ROLLOVER DEMONSTRATION');
    
    console.log(colorize('\nThis demo shows how the weekly task rollover works:', 'gray'));
    console.log(colorize('• Creates realistic test tasks from last week', 'gray'));
    console.log(colorize('• Uses the admin account for demonstration', 'gray'));
    console.log(colorize('• Shows before/after states visually', 'gray'));
    console.log(colorize('• Explains what happens at each step\n', 'gray'));

    // Setup
    await cleanup();
    const { user } = await createVisualTestData();

    // Show initial state
    await showBeforeState(user.id);

    // Wait for user to see the before state
    console.log(colorize('\n⏳ Press Enter to perform rollover...', 'yellow'));
    await new Promise(resolve => process.stdin.once('data', resolve));

    // Perform rollover
    const result = await performVisualRollover(user.id);

    // Show final state
    await showAfterState(user.id);

    // Show summary
    await showSummary(result);

    printHeader('🎉 DEMONSTRATION COMPLETE');
    
  } catch (error) {
    console.error(colorize('❌ Demo failed:', 'red'), error);
    process.exit(1);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

// Run the visual demo
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
