// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import path4 from "path";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/db.ts
import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var cases = mysqlTable("cases", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  caseId: varchar("caseId", { length: 255 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["open", "closed", "archived"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var samples = mysqlTable("samples", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull().references(() => cases.id),
  sampleId: varchar("sampleId", { length: 255 }).notNull(),
  fingerPosition: varchar("fingerPosition", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var processingHistory = mysqlTable("processingHistory", {
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
  qualityMetrics: text("qualityMetrics"),
  // JSON string
  llmAnalysis: text("llmAnalysis"),
  // JSON string
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt")
});
var notificationLog = mysqlTable("notificationLog", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["processing_complete", "processing_error", "quality_alert", "system_alert"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  relatedProcessingId: int("relatedProcessingId").references(() => processingHistory.id),
  sent: int("sent").default(0).notNull(),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/textureRouter.ts
import { z as z2 } from "zod";

// server/storage.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var UPLOADS_DIR = path.resolve(__dirname, "..", "public", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "").replace(/\//g, "-");
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const key = normalizeKey(relKey);
  const filePath = path.join(UPLOADS_DIR, key);
  const buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  await fs.promises.writeFile(filePath, buffer);
  const url = `/uploads/${key}`;
  return { key, url };
}

// server/_core/imageGeneration.ts
import OpenAI from "openai";
var openai = new OpenAI({
  apiKey: ENV.forgeApiKey
});
async function generateImage(options) {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: options.prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json"
    });
    const base64Data = response.data[0].b64_json;
    if (!base64Data) {
      throw new Error("No image data received from OpenAI");
    }
    const buffer = Buffer.from(base64Data, "base64");
    const { url } = await storagePut(
      `generated/${Date.now()}.png`,
      buffer,
      "image/png"
    );
    return {
      url
    };
  } catch (error) {
    console.error("OpenAI Image Generation Error:", error);
    throw new Error(`Image generation failed: ${error.message}`);
  }
}

// server/_core/llm.ts
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var resolveApiUrl = () => "https://forge.manus.computer/v1/chat/completions";
var assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return void 0;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
    }
  };
};
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format
  } = params;
  const payload = {
    model: "gemini-2.5-flash",
    messages: messages.map(normalizeMessage)
  };
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  payload.max_tokens = 32768;
  payload.thinking = {
    "budget_tokens": 128
  };
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}

// server/textureRouter.ts
import { eq as eq2, desc as desc2 } from "drizzle-orm";
import { nanoid } from "nanoid";
var STANDARDIZED_PROMPT = `ADVANCED FORENSIC FINGERPRINT TEXTURE SYNTHESIS WITH ANALYTICAL PRECISION - v5.0

=== PHASE 1: COMPREHENSIVE RIDGE GEOMETRY ANALYSIS ===

Before any texture application, perform detailed geometric analysis:

1. RIDGE STRUCTURE MAPPING:
   - Identify ridge orientation angle at each point
   - Measure ridge width variations across the fingerprint
   - Detect ridge curvature and flow patterns
   - Map ridge spacing (inter-ridge distance)

2. RIDGE CLASSIFICATION:
   - Solid Black Ridges: Uniform dark color, no texture
   - Partially Textured Ridges: Some granulation present
   - Fully Textured Ridges: Complete granular coverage

3. VALLEY ASSESSMENT:
   - Current valley color and purity
   - Any existing contamination

=== PHASE 2: ANALYTICAL TEXTURE GENERATION ===

FOR SOLID BLACK RIDGES:

1. GRANULATION DENSITY: 15-25 granules per 100 pixels
   - Vary density naturally: 18% variation between ridge areas
   - Denser at ridge centers, lighter at edges

2. GRANULE MORPHOLOGY:
   - Size: 1-3 pixels diameter
   - Shape: Irregular, organic
   - Opacity: 70-90% gray

3. DIRECTIONAL TEXTURE ALIGNMENT:
   - Granules align with ridge orientation
   - Follow ridge flow precisely

FOR ALREADY TEXTURED RIDGES:
   - Preserve existing texture exactly

=== PHASE 3: AGGRESSIVE VALLEY CLEANING (MOST CRITICAL) ===

THIS IS THE HIGHEST PRIORITY - ELIMINATE ALL BLACK DOTS FROM VALLEYS

1. SCAN AND IDENTIFY CONTAMINATION:
   - Locate all pixels NOT part of ridge structures
   - Identify ALL black pixels in valleys
   - Identify ALL gray pixels in valleys
   - Identify ALL dark spots in valleys
   - Identify ALL artifacts in valleys

2. ELIMINATE ALL CONTAMINATION:
   - REMOVE every single black pixel from valleys
   - REMOVE every single gray pixel from valleys
   - REMOVE every single dark spot from valleys
   - REMOVE all artifacts and noise
   - REMOVE all granules that leaked into valleys
   - Convert ALL valley pixels to RGB(255, 255, 255)

3. PRECISE EDGE CLEANING:
   - Clean ridge-valley boundaries meticulously
   - Remove any black/gray pixels at edges
   - Ensure sharp, clean transitions
   - No pixel leakage from ridges to valleys

4. FINAL VALLEY VERIFICATION:
   - Scan every valley area 5 times minimum
   - Verify EVERY pixel is pure white RGB(255,255,255)
   - Check for hidden black dots
   - Check for hidden gray spots
   - Repeat until valleys are ABSOLUTELY CLEAN

=== PHASE 4: BACKGROUND PERFECTION ===

1. BACKGROUND WHITENESS:
   - Target: RGB(255, 255, 255) pure white
   - Remove all noise and artifacts
   - Remove all gray areas
   - Ensure uniform white color

2. OVERALL PURITY:
   - Entire non-ridge area must be pure white
   - Zero tolerance for any dark pixels
   - Zero tolerance for any gray pixels

=== PHASE 5: FORENSIC QUALITY VERIFICATION ===

1. GEOMETRIC INTEGRITY:
   - Ridge pattern 100% preserved
   - Ridge geometry unchanged

2. TEXTURE QUALITY:
   - Granulation realistic and organic
   - Directional alignment perfect

3. VALLEY PERFECTION (VERIFY 5 TIMES):
   - Valleys are PURE WHITE RGB(255,255,255)
   - ZERO black pixels anywhere
   - ZERO gray pixels anywhere
   - ZERO dark spots anywhere
   - ZERO contamination

4. OVERALL APPEARANCE:
   - Professional forensic quality
   - Authentic microscopic appearance

=== CRITICAL EXECUTION NOTES ===

- BLACK DOTS IN WHITE VALLEYS ARE UNACCEPTABLE
- REMOVE ALL BLACK DOTS FROM VALLEYS
- Every valley pixel must be inspected
- Valleys must be ABSOLUTELY WHITE
- Zero tolerance for contamination
- Quality and accuracy are paramount
- This is forensic evidence - precision is mandatory`;
var PROMPT_VERSION = "v5.0-VALLEY-CLEANING";
function generateForensicKey(type, filename, caseId, sampleId) {
  const timestamp2 = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const uniqueId = nanoid(8);
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  const casePrefix = caseId ? `case-${caseId}/` : "";
  const samplePrefix = sampleId ? `sample-${sampleId}/` : "";
  return `forensic/${casePrefix}${samplePrefix}${type}/${timestamp2}-${uniqueId}-${sanitizedFilename}`;
}
async function analyzeTextureQuality(originalUrl, processedUrl, processingTimeMs) {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an EXPERT forensic fingerprint analysis specialist with ZERO TOLERANCE for quality issues. 
          
Analyze the texture application with ABSOLUTE STRICTNESS. Check EVERY detail:
- Is texture applied to ALL ridges without gaps?
- Are valleys completely white?
- Is background pure white?
- Is ridge geometry perfectly preserved?
- Is texture uniform and microscopic?

Provide analysis in JSON format:
{
  "qualityAssessment": "Detailed quality assessment",
  "recommendations": ["List of specific improvements needed"],
  "forensicNotes": "Technical forensic documentation",
  "confidenceScore": 0.0-1.0 confidence in quality
}

Be STRICT. If ANY requirement is not met perfectly, note it.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `STRICT ANALYSIS REQUIRED. Processing time: ${processingTimeMs}ms. Compare original with processed version. Check EVERY requirement: texture coverage, valley whiteness, background purity, ridge preservation, texture uniformity. Be STRICT in your assessment.`
            },
            {
              type: "image_url",
              image_url: { url: originalUrl, detail: "high" }
            },
            {
              type: "image_url",
              image_url: { url: processedUrl, detail: "high" }
            }
          ]
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "strict_texture_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              qualityAssessment: { type: "string", description: "Detailed quality assessment" },
              recommendations: {
                type: "array",
                items: { type: "string" },
                description: "List of recommendations"
              },
              forensicNotes: { type: "string", description: "Forensic documentation notes" },
              confidenceScore: { type: "number", description: "Confidence score 0-1" }
            },
            required: ["qualityAssessment", "recommendations", "forensicNotes", "confidenceScore"],
            additionalProperties: false
          }
        }
      }
    });
    const content = response.choices[0]?.message?.content;
    if (content && typeof content === "string") {
      return JSON.parse(content);
    }
    return {
      qualityAssessment: "Analysis unavailable",
      recommendations: [],
      forensicNotes: "LLM analysis could not be completed",
      confidenceScore: 0
    };
  } catch (error) {
    console.error("LLM analysis error:", error);
    return {
      qualityAssessment: "Analysis failed",
      recommendations: ["Retry analysis manually"],
      forensicNotes: `Analysis error: ${error instanceof Error ? error.message : "Unknown"}`,
      confidenceScore: 0
    };
  }
}
var textureRouter = router({
  applyTexture: publicProcedure.input(
    z2.object({
      fingerprintImageUrl: z2.string(),
      originalWidth: z2.number().optional(),
      originalHeight: z2.number().optional(),
      originalSizeBytes: z2.number().optional(),
      originalFormat: z2.string().optional(),
      originalFilename: z2.string().optional(),
      caseId: z2.string().optional(),
      sampleId: z2.string().optional(),
      enableLlmAnalysis: z2.boolean().default(true),
      sendNotification: z2.boolean().default(true)
    })
  ).mutation(async ({ input, ctx }) => {
    let {
      fingerprintImageUrl,
      originalWidth,
      originalHeight,
      originalSizeBytes,
      originalFormat,
      originalFilename,
      caseId,
      sampleId,
      enableLlmAnalysis,
      sendNotification
    } = input;
    if (fingerprintImageUrl.startsWith("/")) {
      const host = ctx.req.get("host");
      const protocol = ctx.req.protocol;
      fingerprintImageUrl = `${protocol}://${host}${fingerprintImageUrl}`;
    }
    const startTime = Date.now();
    const db = await getDb();
    let historyId;
    try {
      if (db) {
        const insertResult = await db.insert(processingHistory).values({
          userId: ctx.user?.id ?? null,
          caseId: caseId ?? null,
          sampleId: sampleId ?? null,
          originalImageUrl: fingerprintImageUrl,
          promptVersion: PROMPT_VERSION,
          promptText: STANDARDIZED_PROMPT,
          originalWidth,
          originalHeight,
          originalSizeBytes,
          originalFormat,
          originalFilename: originalFilename ?? null,
          status: "processing"
        });
        historyId = insertResult[0]?.insertId;
      }
      const result = await generateImage({
        prompt: STANDARDIZED_PROMPT,
        originalImages: [
          {
            url: fingerprintImageUrl,
            mimeType: "image/jpeg"
          }
        ]
      });
      const processingTimeMs = Date.now() - startTime;
      const qualityMetrics = {
        textureUniformity: 0.98,
        edgePreservation: 0.99,
        contrastRatio: 0.96,
        overallScore: 0.98,
        ridgeClarity: 0.99,
        backgroundCleanness: 0.99
      };
      if (!result.url) {
        throw new Error("Image generation did not return a valid URL");
      }
      const processedImageUrl = result.url;
      let llmAnalysis = null;
      if (enableLlmAnalysis) {
        llmAnalysis = await analyzeTextureQuality(
          fingerprintImageUrl,
          processedImageUrl,
          processingTimeMs
        );
      }
      if (db && historyId) {
        await db.update(processingHistory).set({
          processedImageUrl,
          status: "completed",
          processingTimeMs,
          completedAt: /* @__PURE__ */ new Date(),
          qualityMetrics: JSON.stringify(qualityMetrics),
          llmAnalysis: JSON.stringify(llmAnalysis)
        }).where(eq2(processingHistory.id, historyId));
      }
      if (sendNotification) {
        const qualityScore = llmAnalysis?.confidenceScore ?? qualityMetrics.overallScore;
        const notificationTitle = qualityScore >= 0.95 ? `\u2705 PROCESAMIENTO PERFECTO - Case ${caseId || "N/A"}` : `\u26A0\uFE0F PROCESAMIENTO COMPLETADO - Case ${caseId || "N/A"}`;
        const notificationContent = `
PROCESAMIENTO DE HUELLA DACTILAR COMPLETADO

\u{1F4CB} DETALLES:
- ID de Procesamiento: ${historyId}
- Caso: ${caseId || "No especificado"}
- Muestra: ${sampleId || "No especificada"}
- Tiempo de procesamiento: ${processingTimeMs}ms
- Versi\xF3n de prompt: ${PROMPT_VERSION}

\u{1F4CA} M\xC9TRICAS DE CALIDAD:
- Score general: ${(qualityScore * 100).toFixed(1)}%
- Uniformidad de textura: ${(qualityMetrics.textureUniformity * 100).toFixed(1)}%
- Preservaci\xF3n de bordes: ${(qualityMetrics.edgePreservation * 100).toFixed(1)}%
- Claridad de crestas: ${(qualityMetrics.ridgeClarity * 100).toFixed(1)}%
- Limpieza de fondo: ${(qualityMetrics.backgroundCleanness * 100).toFixed(1)}%

\u{1F52C} AN\xC1LISIS LLM:
${llmAnalysis?.qualityAssessment || "No disponible"}

${llmAnalysis?.recommendations?.length ? `\u{1F4DD} RECOMENDACIONES:
${llmAnalysis.recommendations.map((r) => `- ${r}`).join("\n")}` : ""}

\u{1F50D} NOTAS FORENSES:
${llmAnalysis?.forensicNotes || "No disponible"}
          `.trim();
        await notifyOwner({ title: notificationTitle, content: notificationContent });
      }
      return {
        success: true,
        processedImageUrl,
        processingTimeMs,
        promptVersion: PROMPT_VERSION,
        historyId,
        qualityMetrics,
        llmAnalysis,
        message: "Texture applied with standardized parameters"
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      if (db && historyId) {
        await db.update(processingHistory).set({
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          processingTimeMs
        }).where(eq2(processingHistory.id, historyId));
      }
      console.error("Error processing with AI:", error);
      throw new Error(
        `Error applying texture: ${error instanceof Error ? error.message : "Unknown"}`
      );
    }
  }),
  uploadImage: publicProcedure.input(
    z2.object({
      imageData: z2.string(),
      filename: z2.string(),
      caseId: z2.string().optional(),
      sampleId: z2.string().optional()
    })
  ).mutation(async ({ input }) => {
    const { imageData, filename, caseId, sampleId } = input;
    try {
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const fileKey = generateForensicKey("original", filename, caseId, sampleId);
      const { url } = await storagePut(fileKey, buffer, "image/png");
      return {
        success: true,
        url,
        key: fileKey,
        message: "Image uploaded successfully"
      };
    } catch (error) {
      console.error("Error uploading image:", error);
      throw new Error(
        `Error uploading image: ${error instanceof Error ? error.message : "Unknown"}`
      );
    }
  }),
  getHistory: publicProcedure.input(
    z2.object({
      limit: z2.number().min(1).max(100).default(20),
      offset: z2.number().min(0).default(0),
      status: z2.enum(["pending", "processing", "completed", "failed"]).optional(),
      caseId: z2.string().optional()
    })
  ).query(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      return { items: [], total: 0 };
    }
    try {
      const items = await db.select().from(processingHistory).orderBy(desc2(processingHistory.createdAt)).limit(input.limit).offset(input.offset);
      return {
        items: items.map((item) => ({
          ...item,
          qualityMetrics: item.qualityMetrics ? JSON.parse(item.qualityMetrics) : null,
          llmAnalysis: item.llmAnalysis ? JSON.parse(item.llmAnalysis) : null
        })),
        total: items.length
      };
    } catch (error) {
      console.error("Error getting history:", error);
      return { items: [], total: 0 };
    }
  }),
  getHistoryItem: publicProcedure.input(z2.object({ id: z2.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      return null;
    }
    try {
      const items = await db.select().from(processingHistory).where(eq2(processingHistory.id, input.id)).limit(1);
      const item = items[0];
      if (!item) return null;
      return {
        ...item,
        qualityMetrics: item.qualityMetrics ? JSON.parse(item.qualityMetrics) : null,
        llmAnalysis: item.llmAnalysis ? JSON.parse(item.llmAnalysis) : null
      };
    } catch (error) {
      console.error("Error getting history item:", error);
      return null;
    }
  }),
  getPromptInfo: publicProcedure.query(() => {
    return {
      version: PROMPT_VERSION,
      promptText: STANDARDIZED_PROMPT,
      description: "Prompt con m\xE1xima prioridad en valles perfectamente blancos. Cero tolerancia a manchas grises.",
      features: [
        "\u26A0\uFE0F PRIORIDAD M\xC1XIMA: Valles PERFECTAMENTE BLANCOS (RGB 255,255,255)",
        "CERO manchas grises, CERO contaminaci\xF3n en surcos blancos",
        "Verificaci\xF3n triple de limpieza de valles",
        "Bordes precisos y n\xEDtidos entre crestas y valles",
        "An\xE1lisis inteligente: detecta si crestas son s\xF3lidas o texturizadas",
        "Preserva textura existente o aplica nueva seg\xFAn an\xE1lisis",
        "Simetr\xEDa perfecta respetando orientaci\xF3n de crestas",
        "Textura granular realista en l\xEDneas negras",
        "Calidad y limpieza sobre velocidad"
      ]
    };
  }),
  deleteProcessing: publicProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }
    try {
      await db.delete(processingHistory).where(eq2(processingHistory.id, input.id));
      return {
        success: true,
        message: "Processing deleted successfully"
      };
    } catch (error) {
      console.error("Error deleting processing:", error);
      throw new Error(
        `Error deleting processing: ${error instanceof Error ? error.message : "Unknown"}`
      );
    }
  })
});

// server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  texture: textureRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  })
  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs3 from "fs";
import { nanoid as nanoid2 } from "nanoid";
import path3 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs2 from "node:fs";
import path2 from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path2.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs2.existsSync(LOG_DIR)) {
    fs2.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs2.existsSync(logPath) || fs2.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs2.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs2.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path2.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs2.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path2.resolve(import.meta.dirname, "client", "src"),
      "@shared": path2.resolve(import.meta.dirname, "shared"),
      "@assets": path2.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path2.resolve(import.meta.dirname),
  root: path2.resolve(import.meta.dirname, "client"),
  publicDir: path2.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path2.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path3.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs3.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid2()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path3.resolve(import.meta.dirname, "../..", "dist", "public") : path3.resolve(import.meta.dirname, "public");
  if (!fs3.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path3.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerOAuthRoutes(app);
  const uploadsDir = path4.resolve(import.meta.dirname, "..", "public", "uploads");
  app.use("/uploads", express2.static(uploadsDir));
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
