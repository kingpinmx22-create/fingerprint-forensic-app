import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, Case, InsertCase, ProcessingHistory, InsertProcessingHistory, processingHistory, cases } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Cases queries
export async function createCase(userId: number, caseData: InsertCase): Promise<Case | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(cases).values({ ...caseData, userId });
    const caseId = result[0]?.insertId;
    if (!caseId) return null;

    const rows = await db.select().from(cases).where(eq(cases.id, caseId as number));
    return rows[0] ?? null;
  } catch (error) {
    console.error("[Database] Failed to create case:", error);
    throw error;
  }
}

export async function getCasesByUser(userId: number): Promise<Case[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db.select().from(cases).where(eq(cases.userId, userId));
  } catch (error) {
    console.error("[Database] Failed to get cases:", error);
    return [];
  }
}

// Processing history queries
export async function createProcessingRecord(data: InsertProcessingHistory): Promise<ProcessingHistory | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(processingHistory).values(data);
    const recordId = result[0]?.insertId;
    if (!recordId) return null;

    const rows = await db.select().from(processingHistory).where(eq(processingHistory.id, recordId as number));
    return rows[0] ?? null;
  } catch (error) {
    console.error("[Database] Failed to create processing record:", error);
    throw error;
  }
}

export async function getProcessingHistory(limit: number = 20, offset: number = 0): Promise<ProcessingHistory[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db.select().from(processingHistory).orderBy(desc(processingHistory.createdAt)).limit(limit).offset(offset);
  } catch (error) {
    console.error("[Database] Failed to get processing history:", error);
    return [];
  }
}


