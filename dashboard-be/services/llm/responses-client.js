function createOpenAIClient({ apiKey, model }) {
  function safeText(value, fallback = "") {
    if (typeof value === "string") return value;
    if (value === null || value === undefined) return fallback;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return fallback;
  }

  function safeJsonStringify(value, fallback = "{}") {
    try {
      const text = JSON.stringify(value, null, 2);
      return typeof text === "string" ? text : fallback;
    } catch {
      return fallback;
    }
  }

  function sanitizeDetail(value, maxLength = 1000) {
    const text = safeText(value, "");
    if (!text) return "";
    const withoutBearer = text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
    const withoutOpenAiKeys = withoutBearer.replace(/sk-[A-Za-z0-9_-]+/g, "sk-[redacted]");
    return withoutOpenAiKeys.slice(0, maxLength);
  }

  function extractOutputText(data) {
    return Array.isArray(data.output)
      ? data.output
          .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
          .filter((c) => c.type === "output_text")
          .map((c) => c.text)
          .join("\n")
      : "";
  }

  async function callResponses({ systemPrompt, input, fallbackAnswer }) {
    if (!apiKey) {
      return { ok: false, reason: "missing_api_key", text: fallbackAnswer };
    }

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || "gpt-4.1-mini",
          input: [
            {
              role: "system",
              content: [{ type: "text", text: safeText(systemPrompt) }],
            },
            ...input,
          ],
        }),
      });

      if (!response.ok) {
        const txt = await response.text();
        return { ok: false, reason: `http_${response.status}`, detail: sanitizeDetail(txt), text: safeText(fallbackAnswer) };
      }

      const data = await response.json();
      const text = extractOutputText(data);
      return { ok: true, text: text || safeText(fallbackAnswer), raw: data };
    } catch (error) {
      return { ok: false, reason: "network_error", detail: sanitizeDetail(String(error)), text: safeText(fallbackAnswer) };
    }
  }

  return {
    mode: "openai",
    async rewrite({ systemPrompt, userPrompt, draftAnswer }) {
      return callResponses({
        systemPrompt,
        input: [{ role: "user", content: [{ type: "text", text: safeText(userPrompt) }] }],
        fallbackAnswer: draftAnswer,
      });
    },
    async answer({ systemPrompt, messages, context, fallbackAnswer }) {
      const safeMessages = (Array.isArray(messages) ? messages : [])
        .filter((message) => ["user", "assistant"].includes(message?.role) && typeof message.content === "string")
        .slice(-10)
        .map((message) => ({
          role: message.role,
          content: message.content.slice(0, 2000),
        }));
      const safeContext = context && typeof context === "object" ? context : {};
      const userPrompt = [
        "User conversation:",
        safeJsonStringify(safeMessages, "[]"),
        "",
        "Dashboard context:",
        safeJsonStringify(safeContext, "{}"),
        "",
        "Please answer the latest user message using the dashboard context.",
      ].join("\n");

      return callResponses({
        systemPrompt,
        input: [{ role: "user", content: [{ type: "text", text: userPrompt }] }],
        fallbackAnswer,
      });
    },
  };
}

module.exports = {
  createOpenAIClient,
};
