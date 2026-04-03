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
