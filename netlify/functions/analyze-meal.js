const WINDOW_MS = 60 * 1000;
const BURST_LIMIT = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_LIMIT = 100;
const ANTHROPIC_TIMEOUT_MS = 25000;
const MAX_BUCKETS = 5000;

const ipBuckets = new Map();

function getClientIp(event) {
  const header =
    event.headers?.["client-ip"] ||
    event.headers?.["Client-Ip"] ||
    event.headers?.["x-nf-client-connection-ip"] ||
    event.headers?.["X-Nf-Client-Connection-Ip"] ||
    event.headers?.["x-forwarded-for"] ||
    event.headers?.["X-Forwarded-For"];
  if (header) return String(header).split(",")[0].trim() || "unknown";
  const requestContextIp = event.requestContext?.identity?.sourceIp;
  return requestContextIp || "unknown";
}

function pruneBuckets(now) {
  if (ipBuckets.size <= MAX_BUCKETS) return;
  for (const [ip, bucket] of ipBuckets) {
    if (now - bucket.dayStart >= DAY_MS) {
      ipBuckets.delete(ip);
    }
    if (ipBuckets.size <= MAX_BUCKETS) return;
  }
}

function applyRateLimit(ip) {
  const now = Date.now();
  pruneBuckets(now);
  const current = ipBuckets.get(ip) || { minuteStart: now, minuteCount: 0, dayStart: now, dayCount: 0 };

  if (now - current.minuteStart >= WINDOW_MS) {
    current.minuteStart = now;
    current.minuteCount = 0;
  }
  if (now - current.dayStart >= DAY_MS) {
    current.dayStart = now;
    current.dayCount = 0;
  }

  current.minuteCount += 1;
  current.dayCount += 1;
  ipBuckets.set(ip, current);

  if (current.minuteCount > BURST_LIMIT) {
    return { limited: true, statusCode: 429, message: "Too many requests. Please wait about 20 seconds and retry." };
  }
  if (current.dayCount > DAILY_LIMIT) {
    return { limited: true, statusCode: 429, message: "Daily analysis limit reached. Please try again tomorrow." };
  }

  return { limited: false };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") return "Invalid JSON body.";
  const { system, content } = payload;
  if (typeof system !== "string" || !system.trim()) return "Missing required field: system.";
  if (system.length > 12000) return "System prompt is too long.";

  if (typeof content === "string") {
    if (!content.trim()) return "Missing required field: content.";
    if (content.length > 32000) return "Content payload is too long.";
    return null;
  }

  if (Array.isArray(content)) {
    if (content.length === 0) return "Missing required field: content.";
    if (content.length > 16) return "Content payload has too many parts.";
    return null;
  }

  return "Missing required field: content.";
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is missing ANTHROPIC_API_KEY" }),
    };
  }

  try {
    const parsed = JSON.parse(event.body || "{}");
    const validationError = validatePayload(parsed);
    if (validationError) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: validationError }),
      };
    }

    const { system, content } = parsed;
    const ip = getClientIp(event);
    const limitState = applyRateLimit(ip);
    if (limitState.limited) {
      return {
        statusCode: limitState.statusCode,
        body: JSON.stringify({ error: limitState.message }),
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);

    let response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1200,
          system,
          messages: [{ role: "user", content }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json();
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: data?.error?.message || "Anthropic request failed",
        }),
      };
    }

    const text = (data.content || []).map(block => block.text || "").join("");

    return {
      statusCode: 200,
      body: JSON.stringify({ text }),
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      statusCode: isAbort ? 504 : 500,
      body: JSON.stringify({
        error: isAbort ? "Analysis timed out. Please retry." : (error instanceof Error ? error.message : "Unexpected server error"),
      }),
    };
  }
}