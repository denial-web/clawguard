import { createMockPlan, parseAgentPlanJson } from "./planner.js";

export async function createPlanWithProvider(task, context) {
  const provider = String(context.agent.provider ?? "mock").toLowerCase();

  if (provider === "mock") {
    return createMockPlan(task);
  }

  const prompt = buildPlannerPrompt(task, context);
  const text = await callProvider(provider, prompt, context.agent);
  return parseAgentPlanJson(text, context.tools);
}

function buildPlannerPrompt(task, context) {
  return [
    "You are ClawGuard Agent's planner.",
    "Return one JSON object only with this shape:",
    '{"task":"...","steps":[{"id":"short-id","tool":"tool.name","args":{},"reason":"...","risk":"low|medium|high|critical"}]}',
    "Use only the available tool names. Prefer read-only inspection first. Risky file, shell, memory, or trust actions must use approval-gated tools.",
    context.route?.directive ? `\nRuntime route:\n${context.route.directive}` : "",
    "",
    "Available tools:",
    JSON.stringify(context.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      risk: tool.risk,
      approvalRequired: tool.approvalRequired,
      schema: tool.schema
    })), null, 2),
    "",
    context.memory?.length ? `Memory:\n${context.memory.map((item) => `- ${item.type}: ${item.content}`).join("\n")}` : "",
    context.skills?.length ? `Trusted skills:\n${context.skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n")}` : "",
    "",
    `Task: ${task}`
  ].filter(Boolean).join("\n");
}

async function callProvider(provider, prompt, agentConfig) {
  if (provider === "openai" || provider === "openrouter" || provider === "ollama") {
    return callOpenAiCompatible(provider, prompt, agentConfig);
  }

  if (provider === "anthropic") {
    return callAnthropic(prompt, agentConfig);
  }

  if (provider === "gemini" || provider === "google") {
    return callGemini(prompt, agentConfig);
  }

  throw new Error(`Unsupported agent provider: ${provider}`);
}

async function callOpenAiCompatible(provider, prompt, agentConfig) {
  const model = requireModel(agentConfig, provider);
  const baseUrl = agentConfig.baseUrl ?? defaultBaseUrl(provider);
  const apiKey = apiKeyFor(provider, agentConfig);
  const headers = {
    "content-type": "application/json"
  };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "Return valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0
    })
  });
  const data = await readProviderJson(response);
  return data.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(prompt, agentConfig) {
  const model = requireModel(agentConfig, "anthropic");
  const apiKey = apiKeyFor("anthropic", agentConfig);
  if (!apiKey) {
    throw new Error("Anthropic provider requires ANTHROPIC_API_KEY or agent.apiKey.");
  }

  const response = await fetch(`${(agentConfig.baseUrl ?? "https://api.anthropic.com/v1").replace(/\/$/, "")}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });
  const data = await readProviderJson(response);
  return data.content?.map((part) => part.text ?? "").join("") ?? "";
}

async function callGemini(prompt, agentConfig) {
  const model = requireModel(agentConfig, "gemini");
  const apiKey = apiKeyFor("gemini", agentConfig);
  if (!apiKey) {
    throw new Error("Gemini provider requires GEMINI_API_KEY or agent.apiKey.");
  }

  const baseUrl = (agentConfig.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0
      }
    })
  });
  const data = await readProviderJson(response);
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
}

function requireModel(agentConfig, provider) {
  const model = String(agentConfig.model ?? "").trim();
  if (!model) {
    throw new Error(`${provider} provider requires agent.model.`);
  }
  return model;
}

function apiKeyFor(provider, agentConfig) {
  if (agentConfig.apiKey) {
    return agentConfig.apiKey;
  }

  const envName = agentConfig.apiKeyEnv ?? ({
    openai: "OPENAI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    gemini: "GEMINI_API_KEY",
    google: "GEMINI_API_KEY",
    ollama: "OLLAMA_API_KEY"
  }[provider]);
  return envName ? process.env[envName] : undefined;
}

function defaultBaseUrl(provider) {
  if (provider === "openrouter") return "https://openrouter.ai/api/v1";
  if (provider === "ollama") return "http://127.0.0.1:11434/v1";
  return "https://api.openai.com/v1";
}

async function readProviderJson(response) {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`Provider request failed (${response.status}): ${data.error?.message ?? text}`);
  }

  return data;
}
