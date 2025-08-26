const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function showDetailedTasks() {
  const adminId = "cmestfol40001of01rwr8xfhl";
  
  const tasks = await prisma.task.findMany({
    where: {
      userId: adminId,
      title: { startsWith: "VISUAL_TEST_" }
    },
    orderBy: { dueDate: "asc" }
  });
  
  console.log("");
  console.log("📝 Admin test tasks with full timestamp details:");
  console.log("");
  
  const today = new Date();
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - today.getDay() + 1); // Monday
  currentWeekStart.setHours(0, 0, 0, 0);
  
  console.log("Current week starts:", currentWeekStart.toISOString());
  console.log("");
  
  tasks.forEach((task, i) => {
    const status = task.status === "completed" ? "✅" : 
                  task.status === "in_progress" ? "🔄" : "📝";
    const dueDate = new Date(task.dueDate);
    const isCurrentWeek = dueDate >= currentWeekStart;
    const weekLabel = isCurrentWeek ? "(CURRENT WEEK)" : "(PREVIOUS WEEK)";
    
    console.log("  " + (i+1) + ". " + status + " " + task.title);
    console.log("     📅 Due: " + dueDate.toISOString());
    console.log("     📄 " + task.description);
    console.log("     🗓️  " + weekLabel);
    console.log("");
  });
  
  // Check for updatedAt timestamps to see if rollover occurred
  console.log("Task modification timestamps:");
  tasks.forEach(task => {
    console.log("- " + task.title + " updated at: " + task.updatedAt.toISOString());
  });
}

showDetailedTasks().finally(() => prisma.$disconnect());
