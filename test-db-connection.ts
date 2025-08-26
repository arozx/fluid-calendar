#!/usr/bin/env tsx
/**
 * Simple database connectivity test
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testConnection() {
  try {
    console.log("🔗 Testing database connection...");
    
    // Simple query to test connection
    const userCount = await prisma.user.count();
    console.log(`✅ Database connected! Found ${userCount} users.`);
    
    // Try to find admin user
    const admin = await prisma.user.findUnique({
      where: { email: "admin@admin.admin" }
    });
    
    if (admin) {
      console.log(`👤 Admin user found: ${admin.name} (${admin.email})`);
    } else {
      console.log("❌ Admin user not found");
    }
    
  } catch (error) {
    console.error("❌ Database connection failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
