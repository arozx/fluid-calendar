const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function showTasks() {
  const adminId = "cmestfol40001of01rwr8xfhl";
  
  const tasks = await prisma.task.findMany({
    where: {
      userId: adminId,
      title: { startsWith: "VISUAL_TEST_" }
    },
    orderBy: { dueDate: "asc" }
  });
  
  console.log("");
  console.log("📝 Admin has", tasks.length, "test tasks:");
  console.log("");
  
  tasks.forEach((task, i) => {
    const status = task.status === "completed" ? "✅" : 
                  task.status === "in_progress" ? "🔄" : "📝";
    const date = new Date(task.dueDate).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    console.log("  " + (i+1) + ". " + status + " " + task.title);
    console.log("     📅 Due: " + date);
    console.log("     📄 " + task.description);
    console.log("");
  });
}

showTasks().finally(() => prisma.$disconnect());
