const { generateGeminiResponse } = require("#modules/ai");

const MEMORY_CONTEXT_MESSAGES = 8;
const MAX_CONTEXT_MESSAGE_LENGTH = 800;
const MAX_MEMORY_CONTEXT_GAP_MS = 2 * 60 * 60 * 1_000;
const USER_MEMORY_EXTRACTION_PROMPT = [
  "Extract one concise, durable memory about the selected Discord message's author.",
  "The selected message is the primary source. Nearby messages and its reply target are context only; use them to resolve references and meaning, never to attribute another speaker's statement to the selected author.",
  "Preserve useful specifics such as names, preferences, relationships, titles, quantities, and ongoing projects. Summarize rather than quoting the conversation.",
  "Create a stable lowercase snake_case key no longer than 50 characters and a self-contained value no longer than 500 characters.",
  "Set should_save to false when the selected message contains no meaningful claim, is only a question with no answer from its author, would require guessing, or contains credentials, authentication secrets, exact private addresses, or similarly dangerous private data.",
  "A joke or shared event may be saved when the user deliberately selected it, but describe it accurately as a joke or event instead of converting it into a factual personal trait.",
].join("\n");
const SERVER_MEMORY_EXTRACTION_PROMPT = [
  "Extract one concise, durable memory about this Discord server or its community.",
  "The selected message is the primary source. Nearby messages and its reply target are context only; use them to resolve references and meaning, never to turn one member's personal preference or biography into a server-wide fact.",
  "Good server memories include local terminology, ongoing community projects, traditions, channel purposes, and established bot or server lore. Do not save temporary chatter, individual preferences, moderation secrets, or claims that require guessing.",
  "Preserve useful specifics such as names, titles, quantities, and established meanings. Summarize rather than quoting the conversation.",
  "Create a stable lowercase snake_case key no longer than 50 characters and a self-contained value no longer than 500 characters.",
  "Set should_save to false when the selected message contains no meaningful server knowledge or contains credentials, authentication secrets, exact private addresses, private moderation information, or similarly dangerous private data.",
].join("\n");

function formatMemoryContextContent(message) {
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
  return content.length <= MAX_CONTEXT_MESSAGE_LENGTH
    ? content
    : `${content.slice(0, MAX_CONTEXT_MESSAGE_LENGTH - 1)}…`;
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
    ...formatMemoryContextContent(message).split("\n").map((line) => `    ${line}`),
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
  const response = await generateGeminiResponse(
    [{ role: "user", content: context }],
    scope === "user" ? USER_MEMORY_EXTRACTION_PROMPT : SERVER_MEMORY_EXTRACTION_PROMPT,
    {
      generationConfig: {
        maxOutputTokens: 300,
        temperature: 0.1,
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            should_save: { type: "boolean" },
            key: { type: "string" },
            value: { type: "string" },
          },
          required: ["should_save", "key", "value"],
        },
      },
    },
  );

  let memory;
  try {
    memory = JSON.parse(response.content);
  } catch {
    throw new Error("Gemini returned invalid memory data.");
  }
  if (!memory.should_save) return null;
  if (typeof memory.key !== "string" || typeof memory.value !== "string") {
    throw new Error("Gemini returned incomplete memory data.");
  }

  return { key: memory.key, value: memory.value };
}

module.exports = { extractAiMemory };
