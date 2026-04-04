const rateBuckets = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;

function getClientKey(event) {
  const forwarded = event.headers["x-forwarded-for"] || event.headers["client-ip"] || "";
  return forwarded.split(",")[0].trim() || "unknown";
}

function isRateLimited(clientKey) {
  const now = Date.now();
  const bucket = rateBuckets.get(clientKey);
  if (!bucket || now - bucket.startedAt > WINDOW_MS) {
    rateBuckets.set(clientKey, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_REQUESTS_PER_WINDOW;
}

function isValidContent(content) {
  if (!Array.isArray(content) || !content.length) return false;
  return content.every(item => {
    if (!item || typeof item !== "object" || typeof item.type !== "string") return false;
    if (item.type === "text") return typeof item.text === "string" && item.text.length <= 8000;
    if (item.type === "image") {
      return item.source
        && item.source.type === "base64"
        && typeof item.source.media_type === "string"
        && typeof item.source.data === "string"
        && item.source.data.length <= 7_000_000;
    }
    return false;
  });
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
    const { system, content } = JSON.parse(event.body || "{}");
    const clientKey = getClientKey(event);

    if (isRateLimited(clientKey)) {
      return {
        statusCode: 429,
        body: JSON.stringify({ error: "Too many requests. Please wait a minute and try again." }),
      };
    }

    if (typeof system !== "string" || system.length > 20_000 || !isValidContent(content)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid request payload" }),
      };
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
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
    });

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
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Unexpected server error",
      }),
    };
  }
}
