// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { createRequire } = require("module");
const { ensureJsonFile, ensureJsonlFile } = require("./services/data-store");
const { createChatRoutes } = require("./routes/chat-routes");
const { createAgentRoutes } = require("./routes/agent-routes");
const { loadEnvFromFile } = require("./services/llm/config");
const {
  createFileEventStore,
  createCompositeEventStore,
  createKafkaEventStore,
} = require("./services/stores/event-store");
const { createFileExperimentStore } = require("./services/stores/experiment-store");
const { createFileSiteRegistryStore } = require("./services/stores/site-registry-store");
const { createMetricsReadModel } = require("./services/read-models/metrics-read-model");
const { getInfraConfig } = require("./services/runtime/infra-config");
const { createKafkaRuntime } = require("./services/runtime/kafka");
const { createRedisRuntime } = require("./services/runtime/redis");
const { createRedisSessionStore } = require("./services/stores/redis-session-store");
const { createRedisMetricsStore } = require("./services/stores/redis-metrics-store");
const { listPersonas, getPersona } = require("./personas");
const {
  generateOverlay,
  upsertOverlayRecord,
  listOverlayRecords,
} = require("./personas/overlay-generator");

const {
  computeLabeledSessionSummaries,
  computeLabelsSummary,
  buildInsightsInput
} = require("./analytics/pipeline");
const { generateInsights } = require("./insights/generator");
const {
  VALID_EXPERIMENT_STATUSES,
  normalizeExperimentStatus,
  canTransitionExperimentStatus,
} = require("./services/analytics/experiment-status");

loadEnvFromFile();
const infraConfig = getInfraConfig();

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_PUBLIC_DIR = path.join(__dirname, "..", "dashboard-fe", "public");
const DASHBOARD_SESSION_COOKIE = "ux_dashboard_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const USE_SECURE_COOKIES = String(process.env.NODE_ENV || "").trim() === "production";
const sessionStore = new Map();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  return next();
});

app.use((req, res, next) => {
  const noStorePaths = [
    "/login",
    "/editor",
    "/dashboard",
    "/persona-lab",
    "/login.js",
    "/editor.js",
    "/dashboard.js",
    "/persona-lab.js",
    "/persona-lab.css",
    "/analytics-chat.js",
    "/api/sites",
  ];
  if (noStorePaths.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`)) || req.path.startsWith("/preview/")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  return next();
});

app.use(express.json({ limit: "5mb" }));
const dashboardRequire = createRequire(path.join(__dirname, "package.json"));
const SDK_PACKAGE_FILE = dashboardRequire.resolve("@enejwl/ux-sdk");
app.get("/sdk.js", (req, res) => res.sendFile(SDK_PACKAGE_FILE));
app.use(express.static(FRONTEND_PUBLIC_DIR));

// pages
app.get("/", (req, res) => {
  const user = getCurrentUser(req);
  return res.redirect(user ? "/dashboard" : "/login");
});
app.get("/login", (req, res) => res.sendFile(path.join(FRONTEND_PUBLIC_DIR, "login.html")));
app.get("/editor", requireAuth, (req, res) => res.sendFile(path.join(FRONTEND_PUBLIC_DIR, "editor.html")));
app.get("/dashboard", requireAuth, (req, res) => res.sendFile(path.join(FRONTEND_PUBLIC_DIR, "dashboard.html")));
app.get("/persona-lab", requireAuth, (req, res) => res.sendFile(path.join(FRONTEND_PUBLIC_DIR, "persona-lab.html")));

// data dir
const DATA_DIR = path.join(__dirname, "data");
const EVENTS_FILE = path.join(DATA_DIR, "events.jsonl");
const EXP_FILE = path.join(DATA_DIR, "experiments.json");
const SITES_FILE = path.join(DATA_DIR, "sites.json");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const FAQ_FILE = path.join(DATA_DIR, "faq.json");
const POLICIES_FILE = path.join(DATA_DIR, "policies.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const SUPPORT_TICKETS_FILE = path.join(DATA_DIR, "support_tickets.json");
const CHAT_SESSIONS_FILE = path.join(DATA_DIR, "chat_sessions.json");
const CHAT_EVENTS_FILE = path.join(DATA_DIR, "chat_events.jsonl");
const CHAT_FEEDBACK_FILE = path.join(DATA_DIR, "chat_feedback.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const USER_SITE_ACCESS_FILE = path.join(DATA_DIR, "user_site_access.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
ensureJsonFile(EXP_FILE, { experiments: [] });
ensureJsonFile(SITES_FILE, {
  sites: [
    {
      site_id: "legend-ecommerce",
      name: "Legend Ecommerce",
      preview_base_url: "http://127.0.0.1:8080",
      api_base_url: "http://127.0.0.1:3000",
      preview_targets: [
        { id: "home", label: "홈", path: "/", url_prefix: "/", default: true, experiment_key: "exp_home_cta_v1" },
        { id: "collection", label: "컬렉션", path: "/collection", url_prefix: "/collection", experiment_key: "exp_collection_cta_v1" },
        { id: "checkout", label: "체크아웃", path: "/checkout", url_prefix: "/checkout", experiment_key: "exp_checkout_cta_v1" }
      ]
    }
  ]
});
ensureJsonFile(PRODUCTS_FILE, {
  products: [
    {
      id: "neo-coffee",
      name: "네오 커피",
      price: 12900,
      description: "원두 500g, 산미가 낮고 고소한 블렌드",
      specs: ["원두 500g", "로스팅: 미디엄", "산미: 낮음"],
      options: ["원두", "분쇄"],
      stock: 42,
      category: "beverage",
      tags: ["coffee", "beans", "daily"],
    },
    {
      id: "luna-tea",
      name: "루나 티",
      price: 9900,
      description: "티백 20개 구성, 깔끔한 허브 향",
      specs: ["티백 20개", "카페인: 낮음", "향: 허브"],
      options: ["기본"],
      stock: 31,
      category: "beverage",
      tags: ["tea", "herbal", "calm"],
    },
    {
      id: "aurora-mug",
      name: "오로라 머그",
      price: 15900,
      description: "세라믹 소재 350ml 머그컵",
      specs: ["용량: 350ml", "소재: 세라믹", "식기세척기 사용 가능"],
      options: ["white", "mint"],
      stock: 80,
      category: "goods",
      tags: ["mug", "kitchen", "daily"],
    },
    {
      id: "pixel-snack",
      name: "픽셀 스낵",
      price: 5900,
      description: "바삭한 식감의 스낵 8봉 세트",
      specs: ["8봉", "맛: 솔티", "보관: 실온"],
      options: ["기본"],
      stock: 120,
      category: "snack",
      tags: ["snack", "bundle", "kids"],
    },
  ],
});
ensureJsonFile(FAQ_FILE, {
  faq: [
    { id: "faq-1", topic: "shipping", question: "배송은 얼마나 걸리나요?", answer: "평균 1-3영업일 소요됩니다." },
    { id: "faq-2", topic: "refund", question: "환불은 언제 가능하나요?", answer: "수령 후 7일 이내 신청 가능합니다." },
    { id: "faq-3", topic: "exchange", question: "교환이 가능한가요?", answer: "재고가 있으면 1회 교환 가능합니다." },
    { id: "faq-4", topic: "payment", question: "어떤 결제 수단을 지원하나요?", answer: "카드, 계좌이체, 간편결제를 지원합니다." },
  ],
});
ensureJsonFile(POLICIES_FILE, {
  policies: [
    { id: "pol-1", topic: "refund", title: "환불 정책", answer: "사용 흔적이 없는 상품은 수령 후 7일 이내 환불 가능합니다." },
    { id: "pol-2", topic: "exchange", title: "교환 정책", answer: "옵션 교환은 재고 유무 확인 후 진행되며 왕복 배송비가 발생할 수 있습니다." },
    { id: "pol-3", topic: "shipping", title: "배송 정책", answer: "도서산간 지역은 추가 배송비가 적용될 수 있습니다." },
    { id: "pol-4", topic: "coupon", title: "쿠폰 정책", answer: "쿠폰은 일부 상품/기간에 따라 중복 적용이 제한될 수 있습니다." },
  ],
});
ensureJsonFile(ORDERS_FILE, {
  orders: [
    {
      id: "ORD-1001",
      userId: "guest-123",
      items: [{ productId: "neo-coffee", qty: 1 }],
      status: "delivered",
      totalAmount: 12900,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
      shippedAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
      deliveredAt: Date.now() - 1000 * 60 * 60 * 24,
      requestState: "none",
    },
    {
      id: "ORD-1002",
      userId: "guest-123",
      items: [{ productId: "luna-tea", qty: 1 }],
      status: "processing",
      totalAmount: 9900,
      createdAt: Date.now() - 1000 * 60 * 60 * 6,
      requestState: "none",
    },
    {
      id: "ORD-1003",
      userId: "guest-999",
      items: [{ productId: "aurora-mug", qty: 2 }],
      status: "shipped",
      totalAmount: 31800,
      createdAt: Date.now() - 1000 * 60 * 60 * 12,
      shippedAt: Date.now() - 1000 * 60 * 60 * 4,
      requestState: "none",
    },
  ],
});
ensureJsonFile(SUPPORT_TICKETS_FILE, { tickets: [] });
ensureJsonFile(CHAT_SESSIONS_FILE, { sessions: [] });
ensureJsonFile(CHAT_FEEDBACK_FILE, { feedback: [] });
ensureJsonFile(USERS_FILE, { users: [] });
ensureJsonFile(USER_SITE_ACCESS_FILE, { access: [] });
ensureJsonlFile(CHAT_EVENTS_FILE);

// ---------- utils ----------
function now() { return Date.now(); }
function rid() { return crypto.randomBytes(8).toString("hex"); }
function hashPassword(password, salt) {
  const finalSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password || ""), finalSalt, 64).toString("hex");
  return { salt: finalSalt, hash };
}
function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const { hash } = hashPassword(password, salt);
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expectedHash, "hex"));
  } catch {
    return false;
  }
}
function readUsersDb() {
  return fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE, "utf8")) : { users: [] };
}
function writeUsersDb(db) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(db, null, 2), "utf8");
}
function readUserAccessDb() {
  return fs.existsSync(USER_SITE_ACCESS_FILE) ? JSON.parse(fs.readFileSync(USER_SITE_ACCESS_FILE, "utf8")) : { access: [] };
}
function writeUserAccessDb(db) {
  fs.writeFileSync(USER_SITE_ACCESS_FILE, JSON.stringify(db, null, 2), "utf8");
}
function ensureDefaultAdminUser() {
  const db = readUsersDb();
  if (Array.isArray(db.users) && db.users.length > 0) return;

  const username = String(process.env.DASHBOARD_ADMIN_USERNAME || "").trim();
  const password = String(process.env.DASHBOARD_ADMIN_PASSWORD || "").trim();
  const displayName = String(process.env.DASHBOARD_ADMIN_DISPLAY_NAME || "Dashboard Admin").trim() || "Dashboard Admin";
  if (!username || !password) {
    console.warn("[auth] users.json is empty and no bootstrap admin credentials were provided. Dashboard login will remain unavailable until a user is provisioned.");
    return;
  }
  const siteIds = listSites().map((site) => site.site_id);
  const credential = hashPassword(password);
  const userId = rid();

  writeUsersDb({
    users: [{
      id: userId,
      username,
      display_name: displayName,
      password_hash: credential.hash,
      password_salt: credential.salt,
      is_admin: true,
      active: true,
      created_at: now(),
      updated_at: now(),
    }]
  });

  writeUserAccessDb({
    access: siteIds.map((siteId) => ({ user_id: userId, site_id: siteId, role: "owner", created_at: now() }))
  });

  console.warn(`[auth] seeded default dashboard admin username=${username}. Change credentials before production use.`);
}
function parseCookies(req) {
  const raw = String(req.headers.cookie || "");
  return raw.split(";").reduce((acc, part) => {
    const idx = part.indexOf("=");
    if (idx < 0) return acc;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}
function setSessionCookie(res, sessionId) {
  const secure = USE_SECURE_COOKIES ? "; Secure" : "";
  const cookie = `${DASHBOARD_SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
  res.setHeader("Set-Cookie", cookie);
}
function clearSessionCookie(res) {
  const secure = USE_SECURE_COOKIES ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${DASHBOARD_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`);
}
function createSession(user) {
  const sessionId = rid();
  sessionStore.set(sessionId, { userId: user.id, createdAt: now(), expiresAt: now() + SESSION_TTL_MS });
  return sessionId;
}
function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies[DASHBOARD_SESSION_COOKIE];
  if (!sessionId) return null;
  const session = sessionStore.get(sessionId);
  if (!session) return null;
  if (session.expiresAt < now()) {
    sessionStore.delete(sessionId);
    return null;
  }
  session.expiresAt = now() + SESSION_TTL_MS;
  const db = readUsersDb();
  return (db.users || []).find((user) => user.id === session.userId && user.active !== false) || null;
}
function getAllowedSiteIdsForUser(userId) {
  const db = readUserAccessDb();
  return (db.access || []).filter((row) => row.user_id === userId).map((row) => row.site_id);
}
function getAccessRowsForUser(userId) {
  const db = readUserAccessDb();
  return (db.access || []).filter((row) => row.user_id === userId);
}
function buildAuthMeResponse(user) {
  if (!user) return null;
  const allowedSiteIds = getAllowedSiteIdsForUser(user.id);
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    is_admin: user.is_admin === true,
    allowed_site_ids: allowedSiteIds,
    default_site_id: allowedSiteIds[0] || null,
  };
}
function buildUserResponse(user) {
  const auth = buildAuthMeResponse(user) || {};
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    is_admin: user.is_admin === true,
    active: user.active !== false,
    updated_at: user.updated_at || user.created_at || null,
    site_access: (auth.allowed_site_ids || []).map((site_id) => ({ site_id, role: "owner" })),
    allowed_site_ids: auth.allowed_site_ids || [],
    default_site_id: auth.default_site_id || null,
  };
}
function requireAdmin(req, res, next) {
  const user = req.authUser || getCurrentUser(req);
  if (!user) return res.status(401).json({ ok: false, reason: "unauthorized" });
  if (user.is_admin !== true) return res.status(403).json({ ok: false, reason: "forbidden" });
  req.authUser = user;
  req.authContext = buildAuthMeResponse(user);
  return next();
}
function requireAuth(req, res, next) {
  const user = getCurrentUser(req);
  if (!user) {
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ ok: false, reason: "unauthorized" });
    }
    const nextUrl = encodeURIComponent(req.originalUrl || req.url || "/dashboard");
    return res.redirect(`/login?next=${nextUrl}`);
  }
  req.authUser = user;
  req.authContext = buildAuthMeResponse(user);
  return next();
}
function resolveRequestedSiteId(req) {
  return String(req.params.siteId || req.query.site_id || req.body?.site_id || "").trim();
}
function requireSiteAccess(req, res, next) {
  const user = req.authUser || getCurrentUser(req);
  if (!user) return res.status(401).json({ ok: false, reason: "unauthorized" });
  const siteId = resolveRequestedSiteId(req);
  if (!siteId) return res.status(400).json({ ok: false, reason: "missing site_id" });
  const allowed = getAllowedSiteIdsForUser(user.id);
  if (!allowed.includes(siteId)) {
    return res.status(403).json({ ok: false, reason: "forbidden" });
  }
  req.authUser = user;
  req.authContext = buildAuthMeResponse(user);
  req.authorizedSiteId = siteId;
  return next();
}
function safeAbsoluteUrl(baseUrl, value) {
  try {
    return new URL(value || "/", baseUrl).toString();
  } catch {
    return new URL("/", baseUrl).toString();
  }
}
const fileEventStore = createFileEventStore({ eventsFile: EVENTS_FILE });
const experimentStore = createFileExperimentStore({ experimentsFile: EXP_FILE });
const siteRegistryStore = createFileSiteRegistryStore({ sitesFile: SITES_FILE });
const metricsReadModel = createMetricsReadModel({ eventStore: fileEventStore, experimentStore });

ensureDefaultAdminUser();

const kafkaRuntime = infraConfig.kafka.enabled
  ? createKafkaRuntime({ brokers: infraConfig.kafka.brokers, clientId: infraConfig.kafka.clientId })
  : null;
const redisRuntime = infraConfig.redis.enabled
  ? createRedisRuntime({ url: infraConfig.redis.url, keyPrefix: infraConfig.redis.keyPrefix })
  : null;
const redisSessionStore = redisRuntime
  ? createRedisSessionStore({
      redisRuntime,
      sessionTtlSec: infraConfig.redis.sessionTtlSec,
      assignmentTtlSec: infraConfig.redis.assignmentTtlSec,
    })
  : null;
const redisMetricsStore = redisRuntime ? createRedisMetricsStore({ redisRuntime }) : null;
const eventStore = kafkaRuntime
  ? createCompositeEventStore({
      primaryStore: fileEventStore,
      secondaryStores: [createKafkaEventStore({ kafkaRuntime, topic: infraConfig.kafka.topicEvents })],
      logger: (...args) => console.warn("[infra]", ...args),
    })
  : fileEventStore;
function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "page";
}
function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
function buildExperimentKeyForPath(pathname) {
  const clean = String(pathname || "/").split("?")[0] || "/";
  if (clean === "/") return "exp_home_cta_v1";
  const parts = clean.split("/").filter(Boolean).map(slugify).filter(Boolean);
  return `exp_${parts.join("_") || "page"}_cta_v1`;
}
function inferTargetType(pathname) {
  const path = String(pathname || "/").toLowerCase();
  if (path === "/") return "home";
  if (path.includes("checkout")) return "checkout";
  if (path.includes("cart")) return "cart";
  if (path.includes("product")) return "product";
  if (path.includes("shop")) return "shop";
  if (path.includes("collection")) return "collection";
  if (path.includes("order-complete")) return "order-complete";
  if (path.includes("login")) return "login";
  if (path.includes("join") || path.includes("signup")) return "join";
  return slugify(path.split("/").filter(Boolean)[0] || "page");
}
function scoreCandidatePath(pathname) {
  const type = inferTargetType(pathname);
  const table = {
    home: 100,
    checkout: 95,
    cart: 92,
    product: 90,
    shop: 88,
    collection: 82,
    "order-complete": 55,
    login: 25,
    join: 25,
  };
  return table[type] || 40;
}
function labelForCandidate(pathname, hint) {
  const type = inferTargetType(pathname);
  const table = {
    home: "홈",
    checkout: "체크아웃",
    cart: "장바구니",
    product: "상품상세",
    shop: "샵",
    collection: "컬렉션",
    "order-complete": "주문완료",
    login: "로그인",
    join: "회원가입",
  };
  if (table[type]) return table[type];
  const hinted = String(hint || "").trim();
  if (hinted && hinted.length <= 40) return hinted;
  return String(pathname || "/");
}
function targetIdForPath(pathname) {
  const type = inferTargetType(pathname);
  if (type === "home") return "home";
  const path = String(pathname || "/").split("?")[0];
  const tail = path.split("/").filter(Boolean).slice(1).join("-");
  return tail ? `${type}-${slugify(tail)}` : type;
}
function matchesPattern(pathname, pattern) {
  if (!pattern) return false;
  const value = String(pathname || "");
  const source = String(pattern || "").trim();
  if (!source) return false;
  if (source.startsWith("/") && source.endsWith("/")) {
    try { return new RegExp(source.slice(1, -1)).test(value); } catch { return false; }
  }
  return value.includes(source);
}
function normalizeDiscoverablePath(baseUrl, href) {
  const raw = String(href || "").trim();
  if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) return null;
  try {
    const base = new URL(baseUrl);
    const url = new URL(raw, base);
    if (url.origin !== base.origin) return null;
    if (!/^https?:$/.test(url.protocol)) return null;
    const pathname = url.pathname || "/";
    if (/\.(css|js|mjs|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map)$/i.test(pathname)) return null;
    return `${pathname}${url.search}` || "/";
  } catch {
    return null;
  }
}
function extractHtmlTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(stripHtml(match[1])) : "";
}
function extractAnchorCandidates(html, baseUrl) {
  const source = String(html || "");
  const candidates = [];
  const regex = /<a\b[^>]*href=(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(source))) {
    const path = normalizeDiscoverablePath(baseUrl, match[2]);
    if (!path) continue;
    candidates.push({
      path,
      text: decodeHtml(stripHtml(match[3]))
    });
  }
  return candidates;
}
async function fetchHtmlDocument(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "ux-sdk-target-inference",
    },
  });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !/text\/html/i.test(contentType)) {
    return null;
  }
  return response.text();
}
async function inferPreviewTargets(site) {
  const generation = site?.target_generation || {};
  const baseUrl = String(site?.preview_base_url || "").trim();
  if (!baseUrl) return [];

  const includePatterns = Array.isArray(generation.include_patterns) ? generation.include_patterns : [];
  const excludePatterns = Array.isArray(generation.exclude_patterns) ? generation.exclude_patterns : [];
  const maxTargets = Math.max(1, Math.min(Number(generation.max_targets) || 6, 12));
  const maxPagesToScan = Math.max(1, Math.min(Number(generation.max_pages_to_scan) || 6, 12));
  const seedPaths = Array.from(new Set(["/", ...((Array.isArray(generation.seed_paths) ? generation.seed_paths : []))]
    .map((path) => normalizeDiscoverablePath(baseUrl, path))
    .filter(Boolean)));

  const queue = [...seedPaths];
  const visitedPages = new Set();
  const candidates = new Map();

  while (queue.length && visitedPages.size < maxPagesToScan) {
    const currentPath = queue.shift();
    if (!currentPath || visitedPages.has(currentPath)) continue;
    visitedPages.add(currentPath);

    try {
      const html = await fetchHtmlDocument(safeAbsoluteUrl(baseUrl, currentPath));
      if (!html) continue;

      const title = extractHtmlTitle(html);
      const currentKey = currentPath.split("?")[0] || "/";
      if (!excludePatterns.some((pattern) => matchesPattern(currentKey, pattern))) {
        candidates.set(currentPath, {
          path: currentPath,
          labelHint: title,
        });
      }

      const anchors = extractAnchorCandidates(html, baseUrl);
      for (const anchor of anchors) {
        const key = anchor.path.split("?")[0] || "/";
        if (excludePatterns.some((pattern) => matchesPattern(key, pattern))) continue;
        if (includePatterns.length > 0 && !includePatterns.some((pattern) => matchesPattern(key, pattern))) continue;
        if (!candidates.has(anchor.path)) {
          candidates.set(anchor.path, {
            path: anchor.path,
            labelHint: anchor.text || title,
          });
        }
        if (!visitedPages.has(anchor.path) && queue.length < maxPagesToScan * 3) {
          queue.push(anchor.path);
        }
      }
    } catch {
      continue;
    }
  }

  const discoveredAt = Date.now();
  const normalized = Array.from(candidates.values())
    .map((candidate) => {
      const pathname = candidate.path.split("?")[0] || "/";
      return {
        id: targetIdForPath(pathname),
        label: labelForCandidate(pathname, candidate.labelHint),
        path: candidate.path,
        url_prefix: pathname,
        default: pathname === "/",
        experiment_key: buildExperimentKeyForPath(pathname),
        origin: "inferred",
        confidence: scoreCandidatePath(pathname),
        last_discovered_at: discoveredAt,
      };
    })
    .sort((a, b) => (b.confidence - a.confidence) || a.path.localeCompare(b.path));

  const byId = new Map();
  for (const target of normalized) {
    if (!byId.has(target.id)) byId.set(target.id, target);
  }

  const result = Array.from(byId.values()).slice(0, maxTargets);
  if (!result.some((target) => target.default)) {
    const home = result.find((target) => target.url_prefix === "/");
    if (home) home.default = true;
    else if (result[0]) result[0].default = true;
  }
  return result;
}
function mergePreviewTargets(manualTargets, inferredTargets) {
  const merged = [];
  const seen = new Set();
  const append = (target) => {
    if (!target) return;
    const key = `${String(target.id || "").trim()}::${String(target.path || "").trim()}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(target);
  };

  inferredTargets.forEach(append);
  manualTargets.forEach(append);
  return merged;
}
function normalizeSite(site) {
  if (!site || typeof site !== "object") return null;

  const site_id = String(site.site_id || "").trim();
  const preview_base_url = String(site.preview_base_url || "").trim();
  if (!site_id || !preview_base_url) return null;

  const api_base_url = String(site.api_base_url || preview_base_url).trim();
  const target_generation = site.target_generation || { mode: "manual" };
  const manualTargets = Array.isArray(site.preview_targets) ? site.preview_targets : [];
  const inferredTargets = Array.isArray(site.inferred_preview_targets) ? site.inferred_preview_targets : [];
  const rawTargets = target_generation.mode === "inferred"
    ? (inferredTargets.length ? inferredTargets : manualTargets)
    : target_generation.mode === "hybrid"
      ? mergePreviewTargets(manualTargets, inferredTargets)
      : manualTargets;
  const hasExplicitDefault = rawTargets.some((target) => Boolean(target?.default));
  const preview_targets = rawTargets.map((target, index) => {
    const id = String(target?.id || `target-${index + 1}`).trim() || `target-${index + 1}`;
    const pathValue = String(target?.path || "/").trim() || "/";
    const label = String(target?.label || pathValue).trim() || pathValue;
    const liveUrl = safeAbsoluteUrl(preview_base_url, pathValue);
    const parsed = new URL(liveUrl);
    const url_prefix = String(target?.url_prefix || parsed.pathname || "/").trim() || "/";
    return {
      id,
      label,
      path: pathValue,
      url_prefix,
      default: hasExplicitDefault ? Boolean(target?.default) : index === 0,
      experiment_key: String(target?.experiment_key || "").trim() || null,
      origin: String(target?.origin || (Array.isArray(site.inferred_preview_targets) && site.inferred_preview_targets.includes(target) ? "inferred" : "manual")).trim() || "manual",
      confidence: Number.isFinite(Number(target?.confidence)) ? Number(target.confidence) : null,
      last_discovered_at: Number.isFinite(Number(target?.last_discovered_at)) ? Number(target.last_discovered_at) : null,
      live_url: liveUrl,
      preview_url: `/preview/${encodeURIComponent(site_id)}${parsed.pathname}${parsed.search}`,
    };
  });

  return {
    site_id,
    name: String(site.name || site_id).trim() || site_id,
    preview_base_url,
    api_base_url,
    target_generation,
    inferred_targets_updated_at: Number.isFinite(Number(site.inferred_targets_updated_at)) ? Number(site.inferred_targets_updated_at) : null,
    preview_targets,
    journey_path_mappings: (site.journey_path_mappings && typeof site.journey_path_mappings === "object") ? site.journey_path_mappings : null,
  };
}
function listSites() {
  return siteRegistryStore.listRaw().map(normalizeSite).filter(Boolean);
}
function getSiteById(siteId) {
  return listSites().find((site) => site.site_id === siteId) || null;
}
function shouldRefreshInferredTargets(site) {
  const generation = site?.target_generation || {};
  if (!generation || generation.mode === "manual") return false;
  const ttlSec = Math.max(0, Number(generation.refresh_ttl_sec) || 0);
  const updatedAt = Number(site?.inferred_targets_updated_at) || 0;
  const inferredTargets = Array.isArray(site?.inferred_preview_targets) ? site.inferred_preview_targets : [];
  if (inferredTargets.length === 0) return true;
  if (ttlSec <= 0) return false;
  return (Date.now() - updatedAt) > ttlSec * 1000;
}
async function ensureSiteInference(siteId, options) {
  const force = Boolean(options?.force);
  const rawSite = siteRegistryStore.getRawById(siteId);
  if (!rawSite) return null;
  if (!rawSite?.target_generation || rawSite.target_generation.mode === "manual") {
    return normalizeSite(rawSite);
  }

  if (!force && !shouldRefreshInferredTargets(rawSite)) {
    return normalizeSite(rawSite);
  }

  const inferredTargets = await inferPreviewTargets(rawSite);
  const next = siteRegistryStore.patchRawById(siteId, (current) => ({
    ...current,
    inferred_preview_targets: inferredTargets,
    inferred_targets_updated_at: Date.now(),
  }));
  return normalizeSite(next);
}
async function listSitesForApi() {
  const sites = [];
  for (const site of siteRegistryStore.listRaw()) {
    const siteId = String(site?.site_id || "").trim();
    if (!siteId) continue;
    const normalized = await ensureSiteInference(siteId, { force: false });
    if (normalized) sites.push(normalized);
  }
  return sites;
}
function buildPreviewBootstrap(site, previewPath) {
  const proxyApiBaseUrl = JSON.stringify(`/preview-api/${encodeURIComponent(site.site_id)}`);
  const initialPath = JSON.stringify(previewPath || "/");
  return `<script>\n(function(){\n  var API_BASE_URL = ${proxyApiBaseUrl};\n  var INITIAL_PATH = ${initialPath};\n  try { history.replaceState({}, '', INITIAL_PATH); } catch (e) {}\n  var originalFetch = window.fetch ? window.fetch.bind(window) : null;\n  function mapUrl(input){\n    try {\n      if (typeof input === 'string' && input.indexOf('/api/') === 0) return API_BASE_URL + input;\n      if (input instanceof Request) {\n        var reqUrl = new URL(input.url, location.href);\n        if (reqUrl.origin === location.origin && reqUrl.pathname.indexOf('/api/') === 0) return API_BASE_URL + reqUrl.pathname + reqUrl.search;\n      }\n    } catch (e) {}\n    return input;\n  }\n  if (originalFetch) {\n    window.fetch = function(input, init){\n      var mapped = mapUrl(input);\n      if (input instanceof Request && typeof mapped === 'string') {\n        return originalFetch(new Request(mapped, input), init);\n      }\n      return originalFetch(mapped, init);\n    };\n  }\n  var originalOpen = XMLHttpRequest.prototype.open;\n  XMLHttpRequest.prototype.open = function(method, url){\n    if (typeof url === 'string' && url.indexOf('/api/') === 0) {\n      url = API_BASE_URL + url;\n    }\n    return originalOpen.apply(this, [method, url].concat(Array.prototype.slice.call(arguments, 2)));\n  };\n})();\n</script>`;
}
function rewritePreviewText(site, text, contentType, previewPath) {
  const siteId = encodeURIComponent(site.site_id);
  const assetPrefix = `/preview/${siteId}`;
  let out = text;

  if (/text\/html/i.test(contentType)) {
    out = out
      .replace(/(href|src|action)=(["'])\/(?!\/)/g, `$1=$2${assetPrefix}/`)
      .replace(/(["'`])\/@fs\//g, `$1${assetPrefix}/@fs/`)
      .replace(/(["'`])\/@react-refresh(["'`])/g, `$1${assetPrefix}/@react-refresh$2`)
      .replace(/(["'`])\/(\@react-refresh|\@vite|assets|src|node_modules)\//g, `$1${assetPrefix}/$2/`)
      .replace(/<head([^>]*)>/i, `<head$1>${buildPreviewBootstrap(site, previewPath)}`);
  }

  if (/javascript|ecmascript|css/i.test(contentType)) {
    out = out
      .replace(/(["'`])\/@fs\//g, `$1${assetPrefix}/@fs/`)
      .replace(/(["'`])\/@react-refresh(["'`])/g, `$1${assetPrefix}/@react-refresh$2`)
      .replace(/(["'`])\/(assets|src|@react-refresh|@vite|node_modules)\//g, `$1${assetPrefix}/$2/`);
  }

  if (/css/i.test(contentType)) {
    out = out
      .replace(/url\((["']?)\/@fs\//g, `url($1${assetPrefix}/@fs/`)
      .replace(/url\((["']?)\/(assets|src|node_modules)\//g, `url($1${assetPrefix}/$2/`);
  }

  return out;
}
function safeParseJsonLine(line) {
  try { return JSON.parse(line); } catch { return null; }
}

app.post("/api/auth/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (!username || !password) {
    return res.status(400).json({ ok: false, reason: "missing username/password" });
  }

  const usersDb = readUsersDb();
  const user = (usersDb.users || []).find((item) => item.username === username && item.active !== false);
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    return res.status(401).json({ ok: false, reason: "invalid credentials" });
  }

  const sessionId = createSession(user);
  setSessionCookie(res, sessionId);
  return res.json({ ok: true, user: buildAuthMeResponse(user) });
});

app.post("/api/auth/logout", (req, res) => {
  const cookies = parseCookies(req);
  const sessionId = cookies[DASHBOARD_SESSION_COOKIE];
  if (sessionId) sessionStore.delete(sessionId);
  clearSessionCookie(res);
  return res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ ok: false, reason: "unauthorized" });
  return res.json({ ok: true, user: buildAuthMeResponse(user) });
});

app.get("/api/users", requireAuth, requireAdmin, (req, res) => {
  const usersDb = readUsersDb();
  return res.json({ ok: true, users: (usersDb.users || []).map(buildUserResponse) });
});

app.post("/api/users", requireAuth, requireAdmin, (req, res) => {
  const username = String(req.body?.username || "").trim();
  const displayName = String(req.body?.display_name || req.body?.displayName || "").trim();
  const password = String(req.body?.password || "");
  const active = req.body?.active !== false;
  const requestedSiteIds = Array.from(new Set(
    [
      ...(Array.isArray(req.body?.site_ids) ? req.body.site_ids : []),
      ...(Array.isArray(req.body?.allowed_site_ids) ? req.body.allowed_site_ids : []),
      ...(Array.isArray(req.body?.sites) ? req.body.sites : []),
      ...(Array.isArray(req.body?.site_access) ? req.body.site_access.map((entry) => entry?.site_id) : []),
    ]
      .map((siteId) => String(siteId || "").trim())
      .filter(Boolean)
  ));

  if (!username || !displayName || !password) {
    return res.status(400).json({ ok: false, reason: "missing username/display_name/password" });
  }
  if (requestedSiteIds.length === 0) {
    return res.status(400).json({ ok: false, reason: "missing site_ids" });
  }

  const allowedSiteIds = new Set(req.authContext?.allowed_site_ids || []);
  if (requestedSiteIds.some((siteId) => !allowedSiteIds.has(siteId))) {
    return res.status(403).json({ ok: false, reason: "cannot assign unauthorized site_id" });
  }

  const usersDb = readUsersDb();
  if ((usersDb.users || []).some((user) => String(user.username || "").trim() === username)) {
    return res.status(409).json({ ok: false, reason: "username already exists" });
  }

  const sites = listSites();
  const knownSiteIds = new Set(sites.map((site) => site.site_id));
  if (requestedSiteIds.some((siteId) => !knownSiteIds.has(siteId))) {
    return res.status(400).json({ ok: false, reason: "unknown site_id" });
  }

  const credential = hashPassword(password);
  const userId = rid();
  const timestamp = now();
  const nextUser = {
    id: userId,
    username,
    display_name: displayName,
    password_hash: credential.hash,
    password_salt: credential.salt,
    is_admin: false,
    active,
    created_at: timestamp,
    updated_at: timestamp,
  };

  usersDb.users = [...(usersDb.users || []), nextUser];
  writeUsersDb(usersDb);

  const accessDb = readUserAccessDb();
  accessDb.access = [
    ...(accessDb.access || []),
    ...requestedSiteIds.map((site_id) => ({ user_id: userId, site_id, role: "owner", created_at: timestamp })),
  ];
  writeUserAccessDb(accessDb);

  return res.status(201).json({ ok: true, user: buildUserResponse(nextUser) });
});

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function toInt(x) {
  const n = Math.trunc(Number(x));
  return Number.isFinite(n) ? n : null;
}

// ---------- collect endpoint ----------
app.post("/collect", async (req, res) => {
  const payload = req.body;
  const events = Array.isArray(payload?.events) ? payload.events : [];
  if (events.length === 0) return res.status(400).json({ ok: false, reason: "no events" });

  try {
    await eventStore.appendBatch(events, { received_at: Date.now(), request_id: rid() });
    console.log("✅ collect:", events[events.length - 1]?.event_name, "count=", events.length);
    return res.json({ ok: true, received: events.length });
  } catch (error) {
    return res.status(500).json({ ok: false, reason: `collect failed: ${String(error)}` });
  }
});

app.get("/api/sites", requireAuth, async (req, res) => {
  const sites = await listSitesForApi();
  const allowed = new Set(req.authContext?.allowed_site_ids || []);
  return res.json({ ok: true, sites: sites.filter((site) => allowed.has(site.site_id)) });
});

app.get("/api/sites/:siteId", requireAuth, requireSiteAccess, async (req, res) => {
  const site = await ensureSiteInference(String(req.params.siteId || "").trim(), { force: false });
  if (!site) return res.status(404).json({ ok: false, reason: "site not found" });
  return res.json({ ok: true, site });
});

app.get("/api/sites/:siteId/preview-targets", requireAuth, requireSiteAccess, async (req, res) => {
  const site = await ensureSiteInference(String(req.params.siteId || "").trim(), { force: false });
  if (!site) return res.status(404).json({ ok: false, reason: "site not found" });
  return res.json({ ok: true, site_id: site.site_id, preview_targets: site.preview_targets });
});

app.post("/api/sites/:siteId/preview-targets/refresh", requireAuth, requireSiteAccess, async (req, res) => {
  const site = await ensureSiteInference(String(req.params.siteId || "").trim(), { force: true });
  if (!site) return res.status(404).json({ ok: false, reason: "site not found" });
  return res.json({ ok: true, site_id: site.site_id, preview_targets: site.preview_targets, refreshed_at: Date.now() });
});

app.patch("/api/sites/:siteId/journey-path-mappings", requireAuth, requireSiteAccess, (req, res) => {
  const mappings = req.body?.journey_path_mappings;
  if (!mappings || typeof mappings !== "object" || Array.isArray(mappings)) {
    return res.status(400).json({ ok: false, reason: "journey_path_mappings must be an object" });
  }

  const ALLOWED_KEYS = ["home", "browse", "product", "cart", "checkout", "purchase"];
  const sanitized = {};
  for (const key of ALLOWED_KEYS) {
    if (Array.isArray(mappings[key])) {
      sanitized[key] = mappings[key].map((p) => String(p || "").trim()).filter(Boolean);
    }
  }

  const next = siteRegistryStore.patchRawById(req.authorizedSiteId, (current) => ({
    ...current,
    journey_path_mappings: sanitized,
  }));

  if (!next) return res.status(404).json({ ok: false, reason: "site not found" });
  return res.json({ ok: true, journey_path_mappings: next.journey_path_mappings });
});

app.put("/api/sites/:siteId/preview-targets", requireAuth, requireSiteAccess, (req, res) => {
  const targets = req.body?.preview_targets;
  if (!Array.isArray(targets)) {
    return res.status(400).json({ ok: false, reason: "preview_targets must be an array" });
  }

  const normalized = targets.map((t, i) => {
    const path = String(t?.path || "/").trim() || "/";
    const id = String(t?.id || slugify(path.split("/").filter(Boolean)[0] || "page") || `target-${i + 1}`).trim();
    const label = String(t?.label || path).trim() || path;
    const url_prefix = String(t?.url_prefix || path.split("?")[0]).trim() || "/";
    const experiment_key = String(t?.experiment_key || buildExperimentKeyForPath(path)).trim();
    return { id, label, path, url_prefix, default: Boolean(t?.default), experiment_key };
  });

  if (normalized.length > 0 && !normalized.some((t) => t.default)) {
    normalized[0].default = true;
  }

  const next = siteRegistryStore.patchRawById(req.authorizedSiteId, (current) => ({
    ...current,
    preview_targets: normalized,
    target_generation: { ...(current.target_generation || {}), mode: "manual" },
  }));

  if (!next) return res.status(404).json({ ok: false, reason: "site not found" });
  return res.json({ ok: true, site: normalizeSite(next) });
});

function personaForApi(persona) {
  const normalized = persona?.normalized_persona || {};
  return {
    id: persona?.id || "",
    group_id: persona?.group_id || null,
    group_label: persona?.group_label || persona?.description || persona?.id || "페르소나",
    description: persona?.description || "",
    weight: Number(persona?.weight) || 0,
    runner_type: persona?.runner_type || "timeline",
    age_group: persona?.age_group || normalized.age_group || null,
    style_key: persona?.style_key || normalized.style_key || null,
    style_label: persona?.style_label || normalized.style_label || normalized.style_key || null,
    normalized_persona: normalized,
    state_model: persona?.state_model || null,
  };
}

app.get("/api/personas", requireAuth, requireSiteAccess, (req, res) => {
  return res.json({ ok: true, site_id: req.authorizedSiteId, personas: listPersonas().map(personaForApi) });
});

app.get("/api/persona-overlays", requireAuth, requireSiteAccess, (req, res) => {
  return res.json({ ok: true, site_id: req.authorizedSiteId, overlays: listOverlayRecords() });
});

app.post("/api/persona-overlays/generate", requireAuth, requireSiteAccess, async (req, res) => {
  const siteId = req.authorizedSiteId;
  const experimentKey = String(req.body?.experiment_key || req.body?.key || "").trim();
  const personaId = String(req.body?.persona_id || "").trim();
  if (!experimentKey || !personaId) {
    return res.status(400).json({ ok: false, reason: "missing experiment_key/persona_id" });
  }

  const experiment = experimentStore.getByKey(siteId, experimentKey);
  if (!experiment) return res.status(404).json({ ok: false, reason: "experiment not found" });

  const persona = getPersona(personaId);
  if (!persona) return res.status(404).json({ ok: false, reason: "persona not found" });

  try {
    const generated = await generateOverlay({ experiment, persona });
    const overlay = upsertOverlayRecord({ experiment, persona, generated });
    return res.json({ ok: true, site_id: siteId, overlay, generated: { provider: generated.provider, reason: generated.reason } });
  } catch (error) {
    return res.status(500).json({ ok: false, reason: `persona overlay generation failed: ${String(error)}` });
  }
});

async function proxyPreviewRequest(req, res) {
  const siteId = String(req.params.siteId || "").trim();
  const site = getSiteById(siteId);
  if (!site) return res.status(404).send("site not found");

  const restPath = String(req.params[0] || "").trim();
  const pathWithQuery = `/${restPath}${req.url.includes("?") ? `?${req.url.split("?")[1]}` : ""}`;
  const upstreamUrl = safeAbsoluteUrl(site.preview_base_url, pathWithQuery === "/" ? "/" : pathWithQuery);
  const previewPath = (() => {
    try {
      const parsed = new URL(upstreamUrl);
      return `${parsed.pathname}${parsed.search}` || "/";
    } catch {
      return "/";
    }
  })();

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        "user-agent": req.get("user-agent") || "ux-sdk-preview-proxy",
        accept: req.get("accept") || "*/*",
      },
    });

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    res.status(upstream.status);
    res.setHeader("content-type", contentType);

    if (/text\/html|javascript|ecmascript|css/i.test(contentType)) {
      const text = await upstream.text();
      return res.send(rewritePreviewText(site, text, contentType, previewPath));
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.send(buffer);
  } catch (error) {
    return res.status(502).send(`preview proxy failed: ${String(error)}`);
  }
}

app.get("/preview/:siteId", requireAuth, requireSiteAccess, proxyPreviewRequest);
app.get("/preview/:siteId/*", requireAuth, requireSiteAccess, proxyPreviewRequest);

async function proxyPreviewApiRequest(req, res) {
  const siteId = String(req.params.siteId || "").trim();
  const site = getSiteById(siteId);
  if (!site) return res.status(404).json({ ok: false, reason: "site not found" });

  const restPath = String(req.params[0] || "").trim();
  const search = req.url.includes("?") ? `?${req.url.split("?")[1]}` : "";
  const upstreamUrl = safeAbsoluteUrl(site.api_base_url, `/${restPath}${search}`);

  try {
    const headers = {
      accept: req.get("accept") || "*/*",
      "content-type": req.get("content-type") || "application/json",
      "user-agent": req.get("user-agent") || "ux-sdk-preview-proxy",
    };
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method.toUpperCase()) ? undefined : JSON.stringify(req.body || {}),
    });

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    res.status(upstream.status);
    res.setHeader("content-type", contentType);
    return res.send(await upstream.text());
  } catch (error) {
    return res.status(502).json({ ok: false, reason: `preview api proxy failed: ${String(error)}` });
  }
}

app.all("/preview-api/:siteId/*", requireAuth, requireSiteAccess, proxyPreviewApiRequest);

// ---------- Experiment API (MVP) ----------
// experiment = { id, site_id, key, status:"draft"|"running"|"paused", url_prefix, traffic, variants, goals, updated_at, published_at, version }

function snapshotExperiment(experiment) {
  if (!experiment || typeof experiment !== "object") return null;
  const copy = JSON.parse(JSON.stringify(experiment));
  delete copy.history;
  return copy;
}

app.post("/api/experiments/real-apply", requireAuth, requireSiteAccess, (req, res) => {
  const {
    site_id = "ab-sample",
    key,
    url_prefix,
    traffic = { A: 50, B: 50 },
    goals = ["checkout_complete"],
    variants
  } = req.body || {};

  if (!key || !url_prefix || !variants || !variants.A || !variants.B) {
    return res.status(400).json({ ok: false, reason: "missing key/url_prefix/variants" });
  }

  const existing = experimentStore.getByKey(site_id, key);

  const base = {
    id: existing?.id || rid(),
    site_id,
    key,
    url_prefix,
    traffic,
    goals,
    variants,
    status: "running",
    updated_at: now(),
    published_at: now(),
    archived_at: null,
    version: existing ? (existing.version || 0) + 1 : 1
  };

  const updated = experimentStore.upsert(base, (item) => item.site_id === site_id && item.key === key);
  return res.json({ ok: true, experiment: updated });
});

app.post("/api/experiments/:id/rollback", requireAuth, requireSiteAccess, (req, res) => {
  const { id } = req.params;
  const site_id = String(req.body?.site_id || req.query.site_id || "").trim();
  const targetVersion = Number(req.body?.version ?? req.body?.target_version ?? req.query.version);

  if (!site_id) {
    return res.status(400).json({ ok: false, reason: "missing site_id" });
  }
  if (!Number.isFinite(targetVersion)) {
    return res.status(400).json({ ok: false, reason: "missing version" });
  }

  const current = experimentStore.getById(site_id, id);
  if (!current) return res.status(404).json({ ok: false, reason: "not found" });

  const history = Array.isArray(current.history) ? current.history : [];
  const target = history.find((item) => item && Number(item.version) === targetVersion) || null;
  if (!target) {
    return res.status(404).json({ ok: false, reason: "target version not found" });
  }

  const nowTs = now();
  const restored = {
    ...target,
    id: current.id,
    site_id: current.site_id,
    key: current.key,
    status: current.status,
    updated_at: nowTs,
    published_at: current.status === "running" ? nowTs : (current.published_at || null),
    archived_at: current.status === "archived" ? (current.archived_at || null) : null,
    version: (current.version || 0) + 1,
    restored_from_version: Number(target.version) || null,
    restored_at: nowTs,
    history: Array.isArray(target.history) ? target.history : [],
  };

  const updated = experimentStore.upsert(restored, (item) => item.id === current.id && item.site_id === site_id);
  return res.json({ ok: true, experiment: updated, restored_from_version: restored.restored_from_version });
});

// list
app.get("/api/experiments", requireAuth, requireSiteAccess, (req, res) => {
  const site_id = req.query.site_id || "ab-sample";
  const list = experimentStore.list(site_id);
  return res.json({ ok: true, experiments: list });
});

// update status
app.patch("/api/experiments/:id", requireAuth, requireSiteAccess, (req, res) => {
  const { id } = req.params;
  const status = normalizeExperimentStatus(req.body?.status, "");
  const site_id = String(req.body?.site_id || req.query.site_id || "").trim();
  if (!VALID_EXPERIMENT_STATUSES.includes(status)) {
    return res.status(400).json({ ok: false, reason: "invalid experiment status" });
  }
  if (!site_id) {
    return res.status(400).json({ ok: false, reason: "missing site_id" });
  }

  const current = experimentStore.getById(site_id, id);
  if (!current) return res.status(404).json({ ok: false, reason: "not found" });

  const currentStatus = normalizeExperimentStatus(current.status);
  if (!canTransitionExperimentStatus(currentStatus, status)) {
    return res.status(400).json({ ok: false, reason: `invalid transition: ${currentStatus} -> ${status}` });
  }

  const updated = experimentStore.patchById(site_id, id, (experiment) => {
    const next = {
      ...experiment,
      status,
      updated_at: now(),
    };
    if (status === "running" && !next.published_at) next.published_at = next.updated_at;
    if (status === "archived") next.archived_at = next.updated_at;
    return next;
  });

  return res.json({ ok: true, experiment: updated });
});

// delete
app.delete("/api/experiments/:id", requireAuth, requireSiteAccess, (req, res) => {
  const { id } = req.params;
  const site_id = String(req.body?.site_id || req.query.site_id || "").trim();
  if (!site_id) {
    return res.status(400).json({ ok: false, reason: "missing site_id" });
  }
  const deleted = experimentStore.deleteById(site_id, id);
  if (!deleted) return res.status(404).json({ ok: false, reason: "not found" });
  return res.json({ ok: true });
});

// SDK config: running only + URL prefix match
app.get("/api/config", (req, res) => {
  const site_id = req.query.site_id || "ab-sample";
  const url = String(req.query.url || "");
  const pathname = (() => {
    try { return new URL(url).pathname; } catch { return url || "/"; }
  })();

  const running = experimentStore.list(site_id)
    .filter((x) => x.site_id === site_id && x.status === "running")
    .filter((x) => pathname.startsWith(x.url_prefix))
    .map((x) => ({
      key: x.key,
      url_prefix: x.url_prefix,
      traffic: x.traffic,
      goals: x.goals,
      variants: x.variants,
      version: x.version,
      published_at: x.published_at
    }));

  return res.json({ ok: true, site_id, pathname, experiments: running });
});

// ---------- Metrics (events.jsonl 기반) ----------
/**
 * GET /api/metrics?site_id=ab-sample&key=exp_checkout_cta_v1
 * returns A/B metrics:
 * - sessions, users, page_views, clicks, conversions(goal), cvr, bounce_rate
 * - top_clicked_elements
 *
 * MVP: events.jsonl 전체를 읽어서 집계(데이터 커지면 스트리밍/DB로 이동 권장)
 */
app.get("/api/metrics", requireAuth, requireSiteAccess, async (req, res) => {
  const site_id = req.query.site_id || "ab-sample";
  const key = String(req.query.key || "");
  const from_ts = toNum(req.query.from_ts);
  const to_ts = toNum(req.query.to_ts);
  if (!key) return res.status(400).json({ ok: false, reason: "missing key" });

  const experiment = experimentStore.getByKey(site_id, key);
  if (!experiment) {
    return res.status(404).json({ ok: false, reason: "experiment not found" });
  }

  if (redisMetricsStore && typeof from_ts !== "number" && typeof to_ts !== "number") {
    const realtime = await redisMetricsStore.getExperimentMetrics({
      siteId: site_id,
      key,
      goals: experiment.goals,
      experiment,
    });
    if (realtime?.ok) {
      return res.json(realtime);
    }
  }

  const out = metricsReadModel.getExperimentMetrics({ siteId: site_id, key, fromTs: from_ts, toTs: to_ts });
  if (!out.ok && out.reason === "experiment not found") {
    return res.status(404).json(out);
  }
  return res.json(out);
});

app.get("/api/realtime/sessions", requireAuth, requireSiteAccess, async (req, res) => {
  if (!redisSessionStore) {
    return res.json({ ok: false, reason: "redis realtime session store disabled", sessions: [] });
  }

  const site_id = String(req.query.site_id || "ab-sample");
  const limit = Math.max(1, Math.min(200, toInt(req.query.limit) ?? 50));

  try {
    const sessions = await redisSessionStore.listSessionStates({ siteId: site_id, limit });
    return res.json({ ok: true, site_id, source: "redis", sessions });
  } catch (error) {
    return res.status(500).json({ ok: false, reason: String(error) });
  }
});

// ---------- Sessions / Labels / Insights (UX-Stream v1) ----------
// NOTE: 현재는 JSONL 기반 MVP. (대용량에서는 range query/DB/streaming 권장)

app.get("/api/sessions", requireAuth, requireSiteAccess, async (req, res) => {
  const site_id = String(req.query.site_id || "ab-sample");
  const from_ts = toNum(req.query.from_ts);
  const to_ts = toNum(req.query.to_ts);
  const limit_sessions = Math.max(1, Math.min(200, toInt(req.query.limit) ?? 50));
  const limit_events = Math.max(100, Math.min(200_000, toInt(req.query.limit_events) ?? 50_000));

  try {
    const pathMappings = siteRegistryStore.getRawById(site_id)?.journey_path_mappings || null;
    const labeled = await computeLabeledSessionSummaries(EVENTS_FILE, {
      site_id,
      from_ts,
      to_ts,
      limit_events,
      session_ttl_ms: 30 * 60 * 1000,
      pathMappings,
    });

    const sessions = labeled
      .slice(0, limit_sessions)
      .map((x) => ({
        summary: x.summary,
        label: x.label
      }));

    return res.json({ ok: true, site_id, from_ts, to_ts, sessions });
  } catch (e) {
    return res.status(500).json({ ok: false, reason: String(e) });
  }
});

app.get("/api/labels/summary", requireAuth, requireSiteAccess, async (req, res) => {
  const site_id = String(req.query.site_id || "ab-sample");
  const from_ts = toNum(req.query.from_ts);
  const to_ts = toNum(req.query.to_ts);
  const limit_events = Math.max(100, Math.min(200_000, toInt(req.query.limit_events) ?? 100_000));

  try {
    const pathMappings = siteRegistryStore.getRawById(site_id)?.journey_path_mappings || null;
    const labeled = await computeLabeledSessionSummaries(EVENTS_FILE, {
      site_id,
      from_ts,
      to_ts,
      limit_events,
      session_ttl_ms: 30 * 60 * 1000,
      pathMappings,
    });

    const summary = computeLabelsSummary(labeled);
    return res.json({ ok: true, site_id, from_ts, to_ts, summary });
  } catch (e) {
    return res.status(500).json({ ok: false, reason: String(e) });
  }
});

app.get("/api/insights", requireAuth, requireSiteAccess, async (req, res) => {
  const site_id = String(req.query.site_id || "ab-sample");
  const from_ts = toNum(req.query.from_ts);
  const to_ts = toNum(req.query.to_ts);
  const limit_events = Math.max(100, Math.min(200_000, toInt(req.query.limit_events) ?? 150_000));
  const reps = Math.max(1, Math.min(5, toInt(req.query.reps) ?? 3));
  const provider = typeof req.query.provider === "string" ? req.query.provider : undefined;
  const model = typeof req.query.model === "string" ? req.query.model : undefined;
  const include_prompt = String(req.query.include_prompt || "") === "1";

  try {
    const pathMappings = siteRegistryStore.getRawById(site_id)?.journey_path_mappings || null;
    const labeled = await computeLabeledSessionSummaries(EVENTS_FILE, {
      site_id,
      from_ts,
      to_ts,
      limit_events,
      session_ttl_ms: 30 * 60 * 1000,
      pathMappings,
    });

    const input = buildInsightsInput(site_id, labeled, { perLabelRepresentatives: reps });
    const result = await generateInsights(input, { provider, model });
    return res.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      fallback_reason: result.fallbackReason || null,
      input,
      output: result.output,
      prompt: include_prompt ? result.prompt : undefined
    });
  } catch (e) {
    return res.status(500).json({ ok: false, reason: String(e) });
  }
});

app.use(
  "/api/agent",
  createAgentRoutes({
    files: {
      experimentsFile: EXP_FILE,
      eventsFile: EVENTS_FILE,
      sitesFile: SITES_FILE,
    },
    middlewares: {
      requireAuth,
      requireSiteAccess,
    },
    analytics: {
      computeLabeledSessionSummaries,
      computeLabelsSummary,
      buildInsightsInput,
      generateInsights,
    },
  })
);

app.use(
  "/api",
  createChatRoutes({
    files: {
      experimentsFile: EXP_FILE,
      eventsFile: EVENTS_FILE,
      sitesFile: SITES_FILE,
      productsFile: PRODUCTS_FILE,
      faqFile: FAQ_FILE,
      policiesFile: POLICIES_FILE,
      ordersFile: ORDERS_FILE,
      supportTicketsFile: SUPPORT_TICKETS_FILE,
      chatSessionsFile: CHAT_SESSIONS_FILE,
      chatEventsFile: CHAT_EVENTS_FILE,
      chatFeedbackFile: CHAT_FEEDBACK_FILE,
    },
    middlewares: {
      requireAuth,
      requireSiteAccess,
    },
  })
);

app.listen(PORT, () => {
  console.log(`✅ AB Sample running: http://localhost:${PORT}`);
  console.log(`📦 collecting events to: ${EVENTS_FILE}`);
  console.log(`🧪 experiments file: ${EXP_FILE}`);
  console.log(`🛰️  kafka dual write: ${infraConfig.kafka.enabled ? `enabled -> ${infraConfig.kafka.topicEvents}` : "disabled"}`);
  console.log(`🧠 redis session store: ${infraConfig.redis.enabled ? "enabled" : "disabled"}`);
  console.log(`📊 dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`🧩 sessions api: http://localhost:${PORT}/api/sessions`);
  console.log(`⚡ realtime sessions: http://localhost:${PORT}/api/realtime/sessions`);
  console.log(`🏷️  labels summary: http://localhost:${PORT}/api/labels/summary`);
  console.log(`💡 insights: http://localhost:${PORT}/api/insights`);
});

async function shutdownInfra() {
  await Promise.allSettled([
    kafkaRuntime?.disconnect?.(),
    redisRuntime?.disconnect?.(),
  ]);
}

process.on("SIGINT", async () => {
  await shutdownInfra();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdownInfra();
  process.exit(0);
});
