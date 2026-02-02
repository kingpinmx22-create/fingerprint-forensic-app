import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Cases table for organizing forensic investigations
 */
export const cases = mysqlTable("cases", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  caseId: varchar("caseId", { length: 255 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["open", "closed", "archived"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Case = typeof cases.$inferSelect;
export type InsertCase = typeof cases.$inferInsert;

/**
 * Samples table for storing fingerprint samples within cases
 */
export const samples = mysqlTable("samples", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull().references(() => cases.id),
  sampleId: varchar("sampleId", { length: 255 }).notNull(),
  fingerPosition: varchar("fingerPosition", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Sample = typeof samples.$inferSelect;
export type InsertSample = typeof samples.$inferInsert;

/**
 * Processing history table for tracking fingerprint texture applications
 */
export const processingHistory = mysqlTable("processingHistory", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id),
  caseId: varchar("caseId", { length: 255 }),
  sampleId: varchar("sampleId", { length: 255 }),
  originalImageUrl: varchar("originalImageUrl", { length: 512 }).notNull(),
  processedImageUrl: varchar("processedImageUrl", { length: 512 }),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  promptVersion: varchar("promptVersion", { length: 64 }),
  promptText: text("promptText"),
  originalWidth: int("originalWidth"),
  originalHeight: int("originalHeight"),
  originalSizeBytes: int("originalSizeBytes"),
  originalFormat: varchar("originalFormat", { length: 32 }),
  originalFilename: varchar("originalFilename", { length: 255 }),
  processingTimeMs: int("processingTimeMs"),
  qualityMetrics: text("qualityMetrics"), // JSON string
  llmAnalysis: text("llmAnalysis"), // JSON string
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type ProcessingHistory = typeof processingHistory.$inferSelect;
export type InsertProcessingHistory = typeof processingHistory.$inferInsert;

/**
 * Notification log table for tracking system notifications
 */
export const notificationLog = mysqlTable("notificationLog", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["processing_complete", "processing_error", "quality_alert", "system_alert"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  relatedProcessingId: int("relatedProcessingId").references(() => processingHistory.id),
  sent: int("sent").default(0).notNull(),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type NotificationLog = typeof notificationLog.$inferSelect;
export type InsertNotificationLog = typeof notificationLog.$inferInsert;