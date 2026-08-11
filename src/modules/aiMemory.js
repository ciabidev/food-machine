const { generateGeminiResponse } = require("#modules/ai");

const MEMORY_CONTEXT_MESSAGES = 8;
const MAX_NEARBY_MESSAGE_LENGTH = 800;
const MAX_SELECTED_MESSAGE_LENGTH = 12_000;
const MAX_MEMORY_CONTEXT_GAP_MS = 2 * 60 * 60 * 1_000;
const MAX_EXTRACTED_MEMORIES = 20;
const COVERAGE_REVIEW_MINIMUM_LENGTH = 1_000;
const COVERAGE_REVIEW_MINIMUM_LINES = 12;
const USER_MEMORY_EXTRACTION_PROMPT = [
  `Extract every distinct, durable memory supported by the selected Discord message, up to ${MAX_EXTRACTED_MEMORIES} memories, about its author.`,
  "The selected message is the primary source. Nearby messages and its reply target are context only; use them to resolve references and meaning, never to attribute another speaker's statement to the selected author.",
  "Keep closely related details together when they fit. Split independent facts or dense structured content across multiple memories so useful supported details are not discarded merely for brevity.",
  "Preserve useful specifics such as names, preferences, relationships, titles, quantities, and ongoing projects. Summarize rather than quoting the conversation.",
  "For each memory, create a stable lowercase snake_case key no longer than 50 characters and a self-contained value no longer than 500 characters. When several memories concern one subject, repeat useful subject words in their keys so they can be retrieved together.",
  "Return an empty memories array when the selected message contains no meaningful claim, is only a question with no answer from its author, would require guessing, or contains credentials, authentication secrets, exact private addresses, or similarly dangerous private data.",
  "A joke or shared event may be saved when the user deliberately selected it, but describe it accurately as a joke or event instead of converting it into a factual personal trait.",
].join("\n");
const SERVER_MEMORY_EXTRACTION_PROMPT = [
  `Extract every distinct, durable memory supported by the selected Discord message, up to ${MAX_EXTRACTED_MEMORIES} memories, about this Discord server or its community.`,
  "The selected message is the primary source. Nearby messages and its reply target are context only; use them to resolve references and meaning, never to turn one member's personal preference or biography into a server-wide fact.",
  "Good server memories include local terminology, ongoing community projects, traditions, channel purposes, and established bot or server lore. Do not save temporary chatter, individual preferences, moderation secrets, or claims that require guessing.",
  "Keep closely related details together when they fit. Split independent facts or dense structured content across multiple memories so useful supported details are not discarded merely for brevity.",
  "Preserve useful specifics such as names, titles, quantities, and established meanings. Summarize rather than quoting the conversation.",
  "For each memory, create a stable lowercase snake_case key no longer than 50 characters and a self-contained value no longer than 500 characters. When several memories concern one subject, repeat useful subject words in their keys so they can be retrieved together.",
  "Return an empty memories array when the selected message contains no meaningful server knowledge or contains credentials, authentication secrets, exact private addresses, private moderation information, or similarly dangerous private data.",
].join("\n");
const MEMORY_COVERAGE_REVIEW_PROMPT = [
  "Audit the proposed memories against the complete selected message line by line.",
  "Return only additional memories needed to preserve durable facts, instructions, procedures, requirements, permissions, relationships, quantities, and named mappings that the proposed memories omitted or only partially preserved.",
  "Do not repeat a proposed memory when it already preserves the source detail accurately. Return an empty memories array when nothing durable is missing.",
].join("\n");
const MEMORY_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    memories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          value: { type: "string" },
        },
        required: ["key", "value"],
      },
    },
  },
  required: ["memories"],
};

function formatMemoryContextContent(message, maximumLength) {
  const messageText = message.author?.id === message.client.user.id
    ? message.content.replace(/\n-# Model ».*$/s, "")
    : message.cleanContent || message.content;
  const embedText = (message.embeds || [])
    .map((embed) => [embed.title, embed.description].filter(Boolean).join(": "))
    .filter(Boolean)
    .join(" | ");
  const collectComponentText = (components = []) => components
    .flatMap((component) => [component.content, ...collectComponentText(component.components)])
    .filter((value) => value && !String(value).trim().startsWith("-# Model »"));
  const componentText = collectComponentText(message.components).join("\n");
  const content = [messageText, embedText, componentText]
    .filter(Boolean)
    .join("\n")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!content) return "[no text]";
  return content.length <= maximumLength
    ? content
    : `${content.slice(0, maximumLength - 1)}…`;
}

function formatMemoryContextMessage(message, selectedMessageId) {
  const displayName = message.member?.displayName
    || message.author.globalName
    || message.author.username;
  return [
    "message:",
    `  selected: ${message.id === selectedMessageId}`,
    `  message_id: ${JSON.stringify(message.id)}`,
    `  author_id: ${JSON.stringify(message.author.id)}`,
    `  author_username: ${JSON.stringify(message.author.username)}`,
    `  author_display_name: ${JSON.stringify(displayName)}`,
    message.reference?.messageId
      ? `  reply_to_message_id: ${JSON.stringify(message.reference.messageId)}`
      : null,
    "  content: |-",
    ...formatMemoryContextContent(
      message,
      message.id === selectedMessageId
        ? MAX_SELECTED_MESSAGE_LENGTH
        : MAX_NEARBY_MESSAGE_LENGTH,
    ).split("\n").map((line) => `    ${line}`),
  ].filter(Boolean).join("\n");
}

async function collectMemoryContext(targetMessage) {
  const fetched = await targetMessage.channel.messages.fetch({
    limit: MEMORY_CONTEXT_MESSAGES,
    before: targetMessage.id,
  }).catch(() => null);
  const fetchedMessages = fetched
    ? [...fetched.values()].sort((left, right) => left.createdTimestamp - right.createdTimestamp)
    : [];
  let activeContextStart = 0;
  let nextMessageTimestamp = targetMessage.createdTimestamp;
  for (let index = fetchedMessages.length - 1; index >= 0; index -= 1) {
    if (nextMessageTimestamp - fetchedMessages[index].createdTimestamp > MAX_MEMORY_CONTEXT_GAP_MS) {
      activeContextStart = index + 1;
      break;
    }
    nextMessageTimestamp = fetchedMessages[index].createdTimestamp;
  }
  const nearbyMessages = fetchedMessages.slice(activeContextStart);
  const replyTarget = targetMessage.reference?.messageId
    ? await targetMessage.fetchReference().catch(() => null)
    : null;
  const messagesById = new Map(
    [...nearbyMessages, replyTarget, targetMessage]
      .filter(Boolean)
      .map((message) => [message.id, message]),
  );
  return [...messagesById.values()].sort(
    (left, right) => left.createdTimestamp - right.createdTimestamp,
  );
}

async function requestGeminiMemoryExtraction(context, systemPrompt) {
  const response = await generateGeminiResponse(
    [{ role: "user", content: context }],
    systemPrompt,
    {
      generationConfig: {
        maxOutputTokens: 4_096,
        temperature: 0.1,
        thinkingConfig: {
          thinkingLevel: "low",
        },
        responseMimeType: "application/json",
        responseSchema: MEMORY_RESPONSE_SCHEMA,
      },
    },
  );

  const responseText = response.content.trim();
  if (!responseText) {
    const finishReason = response.finishReason ? ` (finish reason: ${response.finishReason})` : "";
    throw new Error(`Gemini returned empty memory data${finishReason}.`);
  }

  let extraction;
  try {
    extraction = JSON.parse(responseText.replace(/^```(?:json)?\s*|\s*```$/gi, ""));
  } catch {
    throw new Error("Gemini returned invalid memory data.");
  }

  if (!Array.isArray(extraction?.memories)) {
    throw new Error("Gemini returned incomplete memory data.");
  }

  const memories = extraction.memories.slice(0, MAX_EXTRACTED_MEMORIES).map((memory) => ({
    key: typeof memory?.key === "string" ? memory.key.trim() : "",
    value: typeof memory?.value === "string" ? memory.value.trim() : "",
  }));
  if (memories.some((memory) => (
    !/[a-z0-9]/i.test(memory.key)
    || memory.key.length > 50
    || !memory.value
    || memory.value.length > 500
  ))) {
    throw new Error("Gemini returned invalid memory fields.");
  }

  return memories;
}

async function extractAiMemory(targetMessage, scope) {
  if (!["user", "guild"].includes(scope)) {
    throw new RangeError('Memory scope must be either "user" or "guild".');
  }
  const contextMessages = await collectMemoryContext(targetMessage);
  const subjectName = targetMessage.member?.displayName
    || targetMessage.author.globalName
    || targetMessage.author.username;
  const context = [
    `Memory scope: ${scope === "user" ? "personal user memory" : "server-wide memory"}`,
    `Selected author: ${JSON.stringify(subjectName)} [${targetMessage.author.id}]`,
    "Nearby Discord messages (oldest to newest):",
    ...contextMessages.map((message) => formatMemoryContextMessage(message, targetMessage.id)),
  ].join("\n\n");
  const extractionPrompt = scope === "user"
    ? USER_MEMORY_EXTRACTION_PROMPT
    : SERVER_MEMORY_EXTRACTION_PROMPT;
  const initialMemories = await requestGeminiMemoryExtraction(context, extractionPrompt);
  const selectedContent = formatMemoryContextContent(
    targetMessage,
    MAX_SELECTED_MESSAGE_LENGTH,
  );
  const selectedLineCount = selectedContent.split("\n").length;
  const needsCoverageReview = (
    selectedContent.length >= COVERAGE_REVIEW_MINIMUM_LENGTH
    || selectedLineCount >= COVERAGE_REVIEW_MINIMUM_LINES
  );
  if (!needsCoverageReview) return initialMemories;

  const coverageContext = [
    context,
    "# Proposed memories to audit",
    JSON.stringify({ memories: initialMemories }, null, 2),
  ].join("\n\n");
  const missingMemories = await requestGeminiMemoryExtraction(
    coverageContext,
    `${extractionPrompt}\n\n# Coverage review\n${MEMORY_COVERAGE_REVIEW_PROMPT}`,
  );
  const memoriesByKey = new Map();
  for (const memory of [...initialMemories, ...missingMemories]) {
    const normalizedKey = memory.key.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const existingMemory = memoriesByKey.get(normalizedKey);
    if (!existingMemory || memory.value.length > existingMemory.value.length) {
      memoriesByKey.set(normalizedKey, memory);
    }
  }

  return [...memoriesByKey.values()].slice(0, MAX_EXTRACTED_MEMORIES);
}

module.exports = { extractAiMemory };
