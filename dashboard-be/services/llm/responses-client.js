function createOpenAIClient({ apiKey, model }) {
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
              content: [{ type: "text", text: systemPrompt }],
            },
            ...input,
          ],
        }),
      });

      if (!response.ok) {
        const txt = await response.text();
        return { ok: false, reason: `http_${response.status}`, detail: txt, text: fallbackAnswer };
      }

      const data = await response.json();
      const text = extractOutputText(data);
      return { ok: true, text: text || fallbackAnswer, raw: data };
    } catch (error) {
      return { ok: false, reason: "network_error", detail: String(error), text: fallbackAnswer };
    }
  }

  return {
    mode: "openai",
    async rewrite({ systemPrompt, userPrompt, draftAnswer }) {
      return callResponses({
        systemPrompt,
        input: [{ role: "user", content: [{ type: "text", text: userPrompt }] }],
        fallbackAnswer: draftAnswer,
      });
    },
    async answer({ systemPrompt, messages, context, fallbackAnswer }) {
      const history = (Array.isArray(messages) ? messages : [])
        .filter((message) => ["user", "assistant"].includes(message?.role) && typeof message.content === "string")
        .slice(-10)
        .map((message) => ({
          role: message.role,
          content: [{ type: "text", text: message.content.slice(0, 2000) }],
        }));

      return callResponses({
        systemPrompt,
        input: [
          ...history,
          {
            role: "user",
            content: [{
              type: "text",
              text: `아래 structured analytics context만 근거로 최종 답변을 작성하세요.\n${JSON.stringify(context || {}, null, 2)}`,
            }],
          },
        ],
        fallbackAnswer,
      });
    },
  };
}

module.exports = {
  createOpenAIClient,
};
