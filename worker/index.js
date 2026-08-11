const SESSION_COOKIE = "xw_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const PASSWORD_ITERATIONS = 100_000;
const USERNAME_PATTERN = /^[\p{Script=Han}A-Za-z0-9_-]{3,24}$/u;
const PASSWORD_MIN_LENGTH = 4;
const PASSWORD_MAX_LENGTH = 64;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function parseCookies(request) {
  const result = new Map();
  const source = request.headers.get("Cookie") ?? "";
  source.split(";").forEach((part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return;
    result.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  });
  return result;
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomToken() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function derivePasswordHash(password, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: new TextEncoder().encode(salt),
    iterations: PASSWORD_ITERATIONS,
  }, material, 256);
  return new Uint8Array(bits);
}

function validateUsername(value) {
  if (typeof value !== "string") throw new HttpError(400, "请输入用户名。");
  const username = value.trim();
  if (!USERNAME_PATTERN.test(username)) {
    throw new HttpError(400, "用户名需为 3–24 个中文、字母、数字、下划线或连字符。");
  }
  return username;
}

function validatePassword(value) {
  if (typeof value !== "string") throw new HttpError(400, "请输入密码。");
  const length = [...value].length;
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    throw new HttpError(400, "密码需为 4–64 个字符，不要求特殊组合。");
  }
  return value;
}

async function readJson(request) {
  if (!request.headers.get("Content-Type")?.toLocaleLowerCase("en-US").startsWith("application/json")) {
    throw new HttpError(415, "请求必须使用 JSON。");
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "请求内容不是有效 JSON。");
  }
}

function requireSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new HttpError(403, "请求来源校验失败。");
  }
}

async function applyAuthRateLimit(request, env) {
  const clientAddress = request.headers.get("CF-Connecting-IP");
  if (!clientAddress) throw new Error("Cloudflare 请求缺少 CF-Connecting-IP。");
  const result = await env.LOGIN_RATE_LIMITER.limit({ key: clientAddress });
  if (!result.success) throw new HttpError(429, "尝试次数过多，请稍后再试。");
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

async function createSession(env, userId) {
  const token = randomToken();
  const tokenHash = bytesToBase64(await sha256(token));
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  await env.DB.prepare(`
    INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
    VALUES (?1, ?2, ?3, ?4)
  `).bind(tokenHash, userId, createdAt.toISOString(), expiresAt.toISOString()).run();
  return token;
}

async function getAuthenticatedUser(request, env) {
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token) throw new HttpError(401, "请先登录后再同步学习记录。");
  const tokenHash = bytesToBase64(await sha256(token));
  const now = new Date().toISOString();
  const user = await env.DB.prepare(`
    SELECT users.id, users.username
    FROM sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?1 AND sessions.expires_at > ?2
  `).bind(tokenHash, now).first();
  if (!user) throw new HttpError(401, "登录已失效，请重新登录。");
  return user;
}

async function register(request, env) {
  requireSameOrigin(request);
  await applyAuthRateLimit(request, env);
  const body = await readJson(request);
  const username = validateUsername(body.username);
  const password = validatePassword(body.password);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?1").bind(username).first();
  if (existing) throw new HttpError(409, "这个用户名已被使用。");

  const userId = crypto.randomUUID();
  const salt = crypto.randomUUID();
  const passwordHash = bytesToBase64(await derivePasswordHash(password, salt));
  const createdAt = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO users (id, username, password_hash, password_salt, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5)
  `).bind(userId, username, passwordHash, salt, createdAt).run();
  const token = await createSession(env, userId);
  return json({ user: { id: userId, username } }, 201, { "Set-Cookie": sessionCookie(token) });
}

async function login(request, env) {
  requireSameOrigin(request);
  await applyAuthRateLimit(request, env);
  const body = await readJson(request);
  const username = validateUsername(body.username);
  const password = validatePassword(body.password);
  const user = await env.DB.prepare(`
    SELECT id, username, password_hash, password_salt
    FROM users
    WHERE username = ?1
  `).bind(username).first();

  const salt = user?.password_salt ?? crypto.randomUUID();
  const actualHash = await derivePasswordHash(password, salt);
  const expectedHash = user ? base64ToBytes(user.password_hash) : crypto.getRandomValues(new Uint8Array(32));
  if (!user || !crypto.subtle.timingSafeEqual(actualHash, expectedHash)) {
    throw new HttpError(401, "用户名或密码不正确。");
  }

  const token = await createSession(env, user.id);
  return json({ user: { id: user.id, username: user.username } }, 200, {
    "Set-Cookie": sessionCookie(token),
  });
}

async function logout(request, env) {
  requireSameOrigin(request);
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (token) {
    const tokenHash = bytesToBase64(await sha256(token));
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(tokenHash).run();
  }
  return json({ ok: true }, 200, { "Set-Cookie": expiredSessionCookie() });
}

function validateProgressRecord(value) {
  if (!value || typeof value !== "object") throw new HttpError(400, "学习记录格式无效。");
  if (typeof value.articleId !== "string" || !value.articleId.trim()) {
    throw new HttpError(400, "学习记录缺少文章 ID。");
  }
  if (!Number.isInteger(value.maxProgress) || value.maxProgress < 0 || value.maxProgress > 100) {
    throw new HttpError(400, "阅读进度必须是 0–100 的整数。");
  }
  if (!["in_progress", "completed"].includes(value.status)) {
    throw new HttpError(400, "学习状态无效。");
  }
  if (value.lastHeading !== null && typeof value.lastHeading !== "string") {
    throw new HttpError(400, "阅读章节格式无效。");
  }
  return {
    articleId: value.articleId.trim(),
    status: value.status,
    maxProgress: value.maxProgress,
    lastHeading: value.lastHeading,
  };
}

function progressUpsert(env, userId, record, now) {
  const completedAt = record.status === "completed" ? now : null;
  return env.DB.prepare(`
    INSERT INTO learning_progress (
      user_id, article_id, status, max_progress, last_heading, updated_at, completed_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    ON CONFLICT (user_id, article_id) DO UPDATE SET
      status = CASE
        WHEN learning_progress.status = 'completed' OR excluded.status = 'completed' THEN 'completed'
        ELSE 'in_progress'
      END,
      max_progress = MAX(learning_progress.max_progress, excluded.max_progress),
      last_heading = CASE
        WHEN excluded.max_progress >= learning_progress.max_progress THEN excluded.last_heading
        ELSE learning_progress.last_heading
      END,
      updated_at = excluded.updated_at,
      completed_at = CASE
        WHEN learning_progress.completed_at IS NOT NULL THEN learning_progress.completed_at
        ELSE excluded.completed_at
      END
  `).bind(
    userId,
    record.articleId,
    record.status,
    record.maxProgress,
    record.lastHeading,
    now,
    completedAt,
  );
}

async function listProgress(request, env) {
  const user = await getAuthenticatedUser(request, env);
  const result = await env.DB.prepare(`
    SELECT article_id AS articleId, status, max_progress AS maxProgress,
      last_heading AS lastHeading, updated_at AS updatedAt, completed_at AS completedAt
    FROM learning_progress
    WHERE user_id = ?1
    ORDER BY updated_at DESC
  `).bind(user.id).all();
  return json({ user, records: result.results });
}

async function saveProgress(request, env) {
  requireSameOrigin(request);
  const user = await getAuthenticatedUser(request, env);
  const record = validateProgressRecord(await readJson(request));
  await progressUpsert(env, user.id, record, new Date().toISOString()).run();
  return json({ ok: true });
}

async function mergeProgress(request, env) {
  requireSameOrigin(request);
  const user = await getAuthenticatedUser(request, env);
  const body = await readJson(request);
  if (!Array.isArray(body.records)) throw new HttpError(400, "待合并的学习记录格式无效。");
  const records = body.records.map(validateProgressRecord);
  const now = new Date().toISOString();
  if (records.length) {
    await env.DB.batch(records.map((record) => progressUpsert(env, user.id, record, now)));
  }
  return listProgress(request, env);
}

async function handleApi(request, env) {
  const { pathname } = new URL(request.url);
  if (request.method === "POST" && pathname === "/api/auth/register") return register(request, env);
  if (request.method === "POST" && pathname === "/api/auth/login") return login(request, env);
  if (request.method === "POST" && pathname === "/api/auth/logout") return logout(request, env);
  if (request.method === "GET" && pathname === "/api/auth/me") {
    return json({ user: await getAuthenticatedUser(request, env) });
  }
  if (request.method === "GET" && pathname === "/api/progress") return listProgress(request, env);
  if (request.method === "PUT" && pathname === "/api/progress") return saveProgress(request, env);
  if (request.method === "POST" && pathname === "/api/progress/merge") return mergeProgress(request, env);
  throw new HttpError(404, "接口不存在。");
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: "服务器处理失败，请稍后再试。" }, 500);
    }
  },
};
