const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
const { defaultAiSystemPrompt, environment, mongoUri } = require("#config");
const {
  AI_MEMORY_CATEGORIES,
  MAX_AI_MEMORY_CONTENT_LENGTH,
  MAX_AI_MEMORY_MUTATIONS,
  MAX_AI_MEMORY_TITLE_LENGTH,
} = require("#modules/aiMemoryConstants");

const dbName = environment;

const DEFAULT_WELCOME_MESSAGE = "welcome {user.mention} to {guild.name}!\n-# We now have {guild.count} members.";
const DEFAULT_LEAVE_MESSAGE = "### Until next time, {user.mention}!\n-# {user.name} has left the server. We now have {guild.count} members.";

const DEFAULT_LEVELING_SETTINGS = Object.freeze({
  enabled: true,
  xp_min: 5,
  xp_max: 15,
  cooldown_seconds: 60,
  announcement_channel_id: null,
  ignored_channel_ids: [],
  ignored_role_ids: [],
  reward_role_ids: {},
});

const DEFAULT_BUBBLE_SETTINGS = Object.freeze({
  hub_channel_id: null,
  inactive_category_id: null,
  inactive_channel_limit: 0,
  anchored_channel_limit: 0,
  channel_prefix: "",
});

const DEFAULT_COLOR_SETTINGS = Object.freeze({
  anchor_role_id: null,
  picker_channel_id: null,
  picker_message_id: null,
});

const DEFAULT_AI_SETTINGS = Object.freeze({
  enabled: false,
  memory_enabled: true,
  system_prompt: defaultAiSystemPrompt,
  sample_messages: [],
  rules_channel_id: null,
});

const MAX_AI_SAMPLE_MESSAGES = 20;
const MAX_AI_SAMPLE_LENGTH = 1_000;
const MAX_USER_AI_MEMORIES = 100;
const MAX_GUILD_AI_MEMORIES = 200;
const MAX_AI_MEMORY_KEY_LENGTH = 50;

let client;
let db;
let initPromise;

async function initDb() {
  if (!initPromise) {
    client = new MongoClient(mongoUri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });

    initPromise = (async () => {
      await client.connect();
      db = client.db(dbName);
      await db.collection("bubbles").updateMany(
        { user_limit: { $exists: false } },
        { $set: { user_limit: 0 } },
      );
      await db.collection("bubbles").updateMany(
        { locked: { $exists: false } },
        { $set: { locked: false } },
      );
      await db.collection("bubbles").updateMany(
        { hidden: { $exists: false } },
        { $set: { hidden: false } },
      );
      await db.collection("bubbles").updateMany(
        { inactive_warning_sent_at: { $exists: false } },
        { $set: { inactive_warning_sent_at: null } },
      );
      await db.collection("bubbles").updateMany(
        { anchored: { $exists: false } },
        { $set: { anchored: false, anchored_at: null } },
      );
      await db.collection("bubbles").updateMany(
        { trusted_user_ids: { $exists: false } },
        { $set: { trusted_user_ids: [] } },
      );
      await db.collection("bubbles").updateMany(
        { banned_user_ids: { $exists: false } },
        { $set: { banned_user_ids: [] } },
      );
      await db.collection("bubbles").createIndex(
        { guild_id: 1, host_id: 1 },
        { unique: true },
      );
      await db.collection("bubbles").createIndex(
        { guild_id: 1, inactive_since: 1 },
      );
      await db.collection("colors").createIndex(
        { guild_id: 1, role_id: 1 },
        { unique: true },
      );
      await db.collection("colors").createIndex(
        { guild_id: 1, hex: 1 },
        { unique: true },
      );
      await db.collection("guild_settings").updateMany(
        { "ai.memory_enabled": { $exists: false } },
        { $set: { "ai.memory_enabled": DEFAULT_AI_SETTINGS.memory_enabled } },
      );
      await db.collection("guild_settings").updateMany(
        { welcome_message: { $exists: false } },
        { $set: { welcome_message: DEFAULT_WELCOME_MESSAGE } },
      );
      await db.collection("guild_settings").updateMany(
        { leave_message: { $exists: false } },
        { $set: { leave_message: DEFAULT_LEAVE_MESSAGE } },
      );
      await db.collection("ai_memories").updateMany(
        {
          $or: [
            { category: { $exists: false } },
            { title: { $exists: false } },
            { title_normalized: { $exists: false } },
            { content: { $exists: false } },
          ],
        },
        [
          {
            $set: {
              category: { $ifNull: ["$category", "other"] },
              title: {
                $ifNull: [
                  "$title",
                  { $replaceAll: { input: "$key", find: "_", replacement: " " } },
                ],
              },
              content: { $ifNull: ["$content", "$value"] },
            },
          },
          {
            $set: {
              title_normalized: {
                $toLower: { $trim: { input: "$title" } },
              },
            },
          },
        ],
      );
      await db.collection("ai_memories").createIndex(
        { guild_id: 1, scope: 1, subject_id: 1, key: 1 },
        { unique: true },
      );
      await db.collection("ai_memories").createIndex(
        { guild_id: 1, scope: 1, subject_id: 1, updated_at: -1 },
      );
      await db.collection("ai_memories").createIndex(
        { guild_id: 1, scope: 1, subject_id: 1, category: 1, updated_at: -1 },
      );
      return db;
    })().catch(async (error) => {
      await client.close();
      client = undefined;
      db = undefined;
      initPromise = undefined;
      throw error;
    });
  }

  return initPromise;
}

function getCollection(collectionName) {
  if (!db) {
    throw new Error(`Db has not finished initializing before accessing ${collectionName}`);
  }
  return db.collection(collectionName);
}

async function getSettings(guildId) {
  const document = await db.collection("guild_settings").findOne(
    { _id: String(guildId) },
  );

  return {
    _id: String(guildId),
    ...document,
    welcome_channel_ids: document?.welcome_channel_ids
      ?? (document?.welcome_channel_id ? [document.welcome_channel_id] : []),
    welcome_message: document?.welcome_message || DEFAULT_WELCOME_MESSAGE,
    leave_message: document?.leave_message || DEFAULT_LEAVE_MESSAGE,
    leveling: {
      ...DEFAULT_LEVELING_SETTINGS,
      ...document?.leveling,
    },
    bubble: {
      ...DEFAULT_BUBBLE_SETTINGS,
      ...document?.bubble,
    },
    color: {
      ...DEFAULT_COLOR_SETTINGS,
      ...document?.color,
    },
    ai: {
      ...DEFAULT_AI_SETTINGS,
      ...document?.ai,
      system_prompt: document?.ai?.system_prompt || DEFAULT_AI_SETTINGS.system_prompt,
      sample_messages: Array.isArray(document?.ai?.sample_messages)
        ? document.ai.sample_messages
        : DEFAULT_AI_SETTINGS.sample_messages,
    },
  };
}

async function getLevelProfile(guildId, userId) {
  return db.collection("level_profiles").findOne({
    guild_id: String(guildId),
    user_id: String(userId),
  });
}

async function getLevelRank(guildId, xp) {
  const profilesAhead = await db.collection("level_profiles").countDocuments({
    guild_id: String(guildId),
    xp: { $gt: xp },
  });

  return profilesAhead + 1;
}

async function setLevelProfile(guildId, userId, changes = {}) {
  const normalizedGuildId = String(guildId);
  const normalizedUserId = String(userId);

  return db.collection("level_profiles").updateOne(
    {
      guild_id: normalizedGuildId,
      user_id: normalizedUserId,
    },
    {
      $set: changes,
      $setOnInsert: {
        guild_id: normalizedGuildId,
        user_id: normalizedUserId,
        created_at: new Date(),
      },
    },
    { upsert: true }
  );
}

async function updateGuildSettings(guildId, update) {
  const now = new Date();
  return db.collection("guild_settings").updateOne(
    { _id: String(guildId) },
    {
      ...update,
      $set: {
        ...update.$set,
        updated_at: now,
      },
      $setOnInsert: {
        created_at: now,
      },
    },
    { upsert: true },
  );
}

async function setLevelingEnabled(guildId, enabled) {
  if (typeof enabled !== "boolean") {
    throw new TypeError("enabled must be a boolean.");
  }

  return updateGuildSettings(guildId, {
    $set: { "leveling.enabled": enabled },
  });
}

async function setWelcomeChannels(guildId, channelIds) {
  const uniqueChannelIds = [...new Set(channelIds.map(String))];

  return updateGuildSettings(guildId, {
    $set: {
      welcome_channel_ids: uniqueChannelIds,
    },
    $unset: { welcome_channel_id: "" },
  });
}

async function setWelcomeMessages(guildId, welcomeMessage, leaveMessage) {
  for (const [name, message] of [
    ["Welcome", welcomeMessage],
    ["Leave", leaveMessage],
  ]) {
    if (
      typeof message !== "string"
      || message.length === 0
      || message.length > 4_000
    ) {
      throw new RangeError(
        `${name} message must be between 1 and 4000 characters.`,
      );
    }
  }

  return updateGuildSettings(guildId, {
    $set: {
      welcome_message: welcomeMessage,
      leave_message: leaveMessage,
    },
  });
}

async function setLevelingXpRange(guildId, minimum, maximum) {
  if (
    !Number.isInteger(minimum)
    || !Number.isInteger(maximum)
    || minimum < 1
    || maximum < minimum
    || maximum > 100
  ) {
    throw new RangeError("XP range must be between 1 and 100, with maximum at least minimum.");
  }

  return updateGuildSettings(guildId, {
    $set: {
      "leveling.xp_min": minimum,
      "leveling.xp_max": maximum,
    },
  });
}

async function setLevelingCooldown(guildId, seconds) {
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new RangeError("Cooldown must be a positive whole number.");
  }

  return updateGuildSettings(guildId, {
    $set: { "leveling.cooldown_seconds": seconds },
  });
}

async function setLevelingChannels(guildId, announcementChannelId, ignoredChannelIds) {
  const uniqueIgnoredIds = [...new Set(ignoredChannelIds.map(String))];
  return updateGuildSettings(guildId, {
    $set: {
      "leveling.announcement_channel_id": announcementChannelId
        ? String(announcementChannelId)
        : null,
      "leveling.ignored_channel_ids": uniqueIgnoredIds,
    },
  });
}

async function setIgnoredLevelingRoles(guildId, roleIds) {
  return updateGuildSettings(guildId, {
    $set: { "leveling.ignored_role_ids": [...new Set(roleIds.map(String))] },
  });
}

async function setLevelingRewardRole(guildId, level, roleId) {
  if (!Number.isInteger(level) || level < 1 || level > 1_000) {
    throw new RangeError("Reward level must be between 1 and 1000.");
  }

  const path = `leveling.reward_role_ids.${level}`;
  return updateGuildSettings(guildId, roleId
    ? { $set: { [path]: String(roleId) } }
    : { $unset: { [path]: "" } });
}

async function setBubbleHub(guildId, hubChannelId) {
  return updateGuildSettings(guildId, {
    $set: {
      "bubble.hub_channel_id": hubChannelId ?? null,
    },
  });
}


async function setBubbleInactiveCategory(guildId, inactiveCategoryId) {
  return updateGuildSettings(guildId, {
    $set: {
      "bubble.inactive_category_id": inactiveCategoryId ?? null,
    },
  });
}

async function setBubbleInactiveLimit(guildId, inactiveLimit) {
  if (!Number.isInteger(inactiveLimit) || inactiveLimit < 0 || inactiveLimit > 99) {
    throw new RangeError("Inactive channel limit must be between 0 and 99.");
  }

  return updateGuildSettings(guildId, {
    $set: {
      "bubble.inactive_channel_limit": inactiveLimit,
    },
  });
}

async function setBubbleAnchoredLimit(guildId, anchoredLimit) {
  if (!Number.isInteger(anchoredLimit) || anchoredLimit < 0 || anchoredLimit > 99) {
    throw new RangeError("Anchored channel limit must be between 0 and 99.");
  }

  return updateGuildSettings(guildId, {
    $set: { "bubble.anchored_channel_limit": anchoredLimit },
  });
}

async function setAiEnabled(guildId, enabled) {
  if (typeof enabled !== "boolean") {
    throw new TypeError("enabled must be a boolean.");
  }

  return updateGuildSettings(guildId, {
    $set: { "ai.enabled": enabled },
  });
}

async function setAiMemoryEnabled(guildId, enabled) {
  if (typeof enabled !== "boolean") {
    throw new TypeError("enabled must be a boolean.");
  }

  return updateGuildSettings(guildId, {
    $set: { "ai.memory_enabled": enabled },
  });
}

async function setAiSystemPrompt(guildId, systemPrompt) {
  if (typeof systemPrompt !== "string" || systemPrompt.length > 4_000) {
    throw new RangeError("The AI system prompt must be 4,000 characters or fewer.");
  }

  const trimmedPrompt = systemPrompt.trim();
  return updateGuildSettings(guildId, trimmedPrompt
    ? { $set: { "ai.system_prompt": trimmedPrompt } }
    : { $unset: { "ai.system_prompt": "" } });
}

async function setAiRulesChannel(guildId, channelId) {
  return updateGuildSettings(guildId, {
    $set: {
      "ai.rules_channel_id": channelId ? String(channelId) : null,
    },
  });
}

async function addAiSampleMessages(guildId, sampleMessages) {
  if (!Array.isArray(sampleMessages) || !sampleMessages.length) {
    throw new RangeError("At least one AI sample message is required.");
  }

  const cleanedSamples = sampleMessages.map((sampleMessage) => (
    typeof sampleMessage === "string" ? sampleMessage.trim() : ""
  )).filter(Boolean);

  if (!cleanedSamples.length || cleanedSamples.length > MAX_AI_SAMPLE_MESSAGES) {
    throw new RangeError(`Add between 1 and ${MAX_AI_SAMPLE_MESSAGES} AI sample messages.`);
  }

  if (cleanedSamples.some((sampleMessage) => sampleMessage.length > MAX_AI_SAMPLE_LENGTH)) {
    throw new RangeError(`Each AI sample message must be ${MAX_AI_SAMPLE_LENGTH} characters or fewer.`);
  }

  return updateGuildSettings(guildId, {
    $push: {
      "ai.sample_messages": {
        $each: cleanedSamples,
        $slice: -MAX_AI_SAMPLE_MESSAGES,
      },
    },
  });
}

async function saveAiMessageStats(messageId, guildId, channelId, stats) {
  return db.collection("ai_message_stats").updateOne(
    { _id: String(messageId) },
    {
      $set: {
        guild_id: String(guildId),
        channel_id: String(channelId),
        requester_id: String(stats.requesterId),
        model: stats.model,
        response_time_ms: stats.responseTimeMs,
        input_tokens: stats.inputTokens,
        output_tokens: stats.outputTokens,
        thinking_tokens: stats.thinkingTokens,
        total_tokens: stats.totalTokens,
        context_text: stats.contextText,
        created_at: new Date(),
      },
    },
    { upsert: true },
  );
}

async function getAiMessageStats(messageId, guildId) {
  return db.collection("ai_message_stats").findOne({
    _id: String(messageId),
    guild_id: String(guildId),
  });
}

async function clearAiSampleMessages(guildId) {
  return updateGuildSettings(guildId, {
    $set: { "ai.sample_messages": [] },
  });
}

function prepareAiMemoryCategory(category) {
  const preparedCategory = String(category ?? "other").trim().toLowerCase();
  if (!AI_MEMORY_CATEGORIES.includes(preparedCategory)) {
    throw new RangeError(`Unknown AI memory category: ${preparedCategory}`);
  }
  return preparedCategory;
}

function prepareAiMemoryTitle(title) {
  const preparedTitle = String(title ?? "").replace(/\s+/g, " ").trim();
  if (!preparedTitle || preparedTitle.length > MAX_AI_MEMORY_TITLE_LENGTH) {
    throw new RangeError(
      `Memory titles must be between 1 and ${MAX_AI_MEMORY_TITLE_LENGTH} characters.`,
    );
  }
  return preparedTitle;
}

function prepareAiMemoryContent(content) {
  const preparedContent = String(content ?? "").trim();
  if (!preparedContent || preparedContent.length > MAX_AI_MEMORY_CONTENT_LENGTH) {
    throw new RangeError(
      `Memory content must be between 1 and ${MAX_AI_MEMORY_CONTENT_LENGTH} characters.`,
    );
  }
  return preparedContent;
}

function collectAiMemoryReferences(content) {
  const references = new Map();
  for (const match of content.matchAll(/<@&(\d+)>|<#(\d+)>|<@!?(\d+)>/g)) {
    const type = match[1] ? "role" : match[2] ? "channel" : "user";
    const id = match[1] || match[2] || match[3];
    references.set(`${type}:${id}`, { type, id });
  }
  return [...references.values()];
}

function createAiMemoryKey(title, memoryId) {
  const suffix = memoryId.toHexString().slice(-6);
  const slug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_AI_MEMORY_KEY_LENGTH - suffix.length - 1)
    || "memory";
  return `${slug}_${suffix}`;
}

function prepareAiMemoryScope(scope, userId) {
  if (!["user", "guild"].includes(scope)) {
    throw new RangeError('Memory scope must be either "user" or "guild".');
  }
  if (scope === "user" && !userId) {
    throw new RangeError("User memories require a user ID.");
  }
  return scope === "user" ? String(userId) : null;
}

function getAiMemoryOwner(guildId, scope, userId) {
  return {
    guild_id: scope === "user" ? null : String(guildId),
    scope,
    subject_id: prepareAiMemoryScope(scope, userId),
  };
}

function prepareAiMemorySource(guildId, userId, source, now) {
  const actingUserId = source.createdByUserId
    ? String(source.createdByUserId)
    : userId
      ? String(userId)
      : null;
  return {
    source_guild_id: source.guildId ? String(source.guildId) : String(guildId),
    source_channel_id: source.channelId ? String(source.channelId) : null,
    source_message_id: source.messageId ? String(source.messageId) : null,
    updated_by_user_id: actingUserId,
    updated_at: now,
  };
}

async function createAiMemory(
  guildId,
  scope,
  userId,
  category,
  title,
  content,
  source = {},
) {
  const owner = getAiMemoryOwner(guildId, scope, userId);
  const preparedCategory = prepareAiMemoryCategory(category);
  const preparedTitle = prepareAiMemoryTitle(title);
  const preparedContent = prepareAiMemoryContent(content);
  const titleNormalized = preparedTitle.toLowerCase();

  const collection = db.collection("ai_memories");
  const existingMemory = await collection.findOne({ ...owner, title_normalized: titleNormalized });
  if (existingMemory) {
    const updatedMemory = await updateAiMemory(
      guildId,
      scope,
      userId,
      existingMemory._id,
      preparedCategory,
      preparedTitle,
      preparedContent,
      source,
    );
    return updatedMemory ? { ...updatedMemory, was_created: false } : null;
  }

  const memoryLimit = scope === "user" ? MAX_USER_AI_MEMORIES : MAX_GUILD_AI_MEMORIES;
  const memoryCount = await collection.countDocuments(owner);
  if (memoryCount >= memoryLimit) {
    throw new RangeError(
      `${scope === "user" ? "This user" : "This server"} already has the maximum of ${memoryLimit} AI memories.`,
    );
  }

  const now = new Date();
  const memoryId = new ObjectId();
  const document = {
    _id: memoryId,
    ...owner,
    key: createAiMemoryKey(preparedTitle, memoryId),
    category: preparedCategory,
    title: preparedTitle,
    title_normalized: titleNormalized,
    content: preparedContent,
    value: preparedContent,
    references: collectAiMemoryReferences(preparedContent),
    ...prepareAiMemorySource(guildId, userId, source, now),
    created_by_user_id: source.createdByUserId
      ? String(source.createdByUserId)
      : userId
        ? String(userId)
        : null,
    created_at: now,
  };
  await collection.insertOne(document);
  return { ...document, was_created: true };
}

async function updateAiMemory(
  guildId,
  scope,
  userId,
  memoryId,
  category,
  title,
  content,
  source = {},
) {
  const owner = getAiMemoryOwner(guildId, scope, userId);
  const preparedCategory = prepareAiMemoryCategory(category);
  const preparedTitle = prepareAiMemoryTitle(title);
  const preparedContent = prepareAiMemoryContent(content);
  const preparedMemoryId = ObjectId.isValid(String(memoryId))
    ? new ObjectId(String(memoryId))
    : null;
  if (!preparedMemoryId) throw new RangeError("Invalid AI memory ID.");

  const now = new Date();
  const result = await db.collection("ai_memories").findOneAndUpdate(
    { _id: preparedMemoryId, ...owner },
    {
      $set: {
        key: createAiMemoryKey(preparedTitle, preparedMemoryId),
        category: preparedCategory,
        title: preparedTitle,
        title_normalized: preparedTitle.toLowerCase(),
        content: preparedContent,
        value: preparedContent,
        references: collectAiMemoryReferences(preparedContent),
        ...prepareAiMemorySource(guildId, userId, source, now),
      },
    },
    { returnDocument: "after" },
  );
  return result;
}

async function applyAiMemoryMutations(guildId, scope, userId, mutations, source = {}) {
  const created = [];
  const updated = [];
  let deletedCount = 0;
  const mutationLimit = MAX_AI_MEMORY_MUTATIONS;

  for (const memory of (mutations.create || []).slice(0, mutationLimit)) {
    const savedMemory = await createAiMemory(
      guildId,
      scope,
      userId,
      memory.category,
      memory.title,
      memory.content,
      source,
    );
    if (!savedMemory) continue;
    if (savedMemory.was_created) created.push(savedMemory);
    else updated.push(savedMemory);
  }
  for (const memory of (mutations.update || []).slice(
    0,
    mutationLimit - created.length - updated.length,
  )) {
    const updatedMemory = await updateAiMemory(
      guildId,
      scope,
      userId,
      memory.memory_id,
      memory.category,
      memory.title,
      memory.content,
      source,
    );
    if (updatedMemory) updated.push(updatedMemory);
  }
  for (const memoryId of (mutations.delete || []).slice(
    0,
    Math.max(0, mutationLimit - created.length - updated.length),
  )) {
    const result = await deleteAiMemory(guildId, scope, userId, memoryId);
    deletedCount += result.deletedCount;
  }

  return { created, updated, deletedCount };
}

async function getAiMemories(guildId, scope, userId) {
  return db.collection("ai_memories")
    .find(getAiMemoryOwner(guildId, scope, userId))
    .sort({ updated_at: -1 })
    .toArray();
}

async function getAiMemoriesForContext(guildId, userId) {
  const collection = db.collection("ai_memories");
  const normalizedGuildId = String(guildId);
  const userMemoryQuery = userId
    ? collection
        .find({ guild_id: null, scope: "user", subject_id: String(userId) })
        .sort({ updated_at: -1 })
        .limit(MAX_USER_AI_MEMORIES)
        .toArray()
    : Promise.resolve([]);
  const [userMemories, guildMemories] = await Promise.all([
    userMemoryQuery,
    collection
      .find({ guild_id: normalizedGuildId, scope: "guild", subject_id: null })
      .sort({ updated_at: -1 })
      .limit(MAX_GUILD_AI_MEMORIES)
      .toArray(),
  ]);
  return { userMemories, guildMemories };
}

async function deleteAiMemory(guildId, scope, userId, memoryId) {
  const preparedMemoryId = ObjectId.isValid(String(memoryId))
    ? new ObjectId(String(memoryId))
    : null;
  if (!preparedMemoryId) return { acknowledged: true, deletedCount: 0 };
  return db.collection("ai_memories").deleteOne({
    ...getAiMemoryOwner(guildId, scope, userId),
    _id: preparedMemoryId,
  });
}

async function clearAiMemories(guildId, scope, userId) {
  return db.collection("ai_memories").deleteMany(
    getAiMemoryOwner(guildId, scope, userId),
  );
}

async function setBubbleChannelPrefix(guildId, channelPrefix) {
  if (typeof channelPrefix !== "string" || channelPrefix.length > 25) {
    throw new RangeError("Bubble channel prefix must be 25 characters or fewer.");
  }

  return updateGuildSettings(guildId, {
    $set: { "bubble.channel_prefix": channelPrefix },
  });
}

async function setColorAnchor(guildId, roleId) {
  return updateGuildSettings(guildId, {
    $set: { "color.anchor_role_id": roleId ? String(roleId) : null },
  });
}

async function setColorPickerMessage(guildId, channelId, messageId) {
  return updateGuildSettings(guildId, {
    $set: {
      "color.picker_channel_id": channelId ? String(channelId) : null,
      "color.picker_message_id": messageId ? String(messageId) : null,
    },
  });
}

async function addBubble(guildId, channelId, userId, name) {
  const now = new Date();
  return db.collection("bubbles").updateOne(
    {
      guild_id: String(guildId),
      host_id: String(userId),
    },
    {
      $set: {
        channel_id: String(channelId),
        inactive_since: null,
        updated_at: now,
      },
      $setOnInsert: {
        guild_id: String(guildId),
        host_id: String(userId),
        name,
        user_limit: 0,
        locked: false,
        hidden: false,
        anchored: false,
        anchored_at: null,
        trusted_user_ids: [],
        banned_user_ids: [],
        inactive_warning_sent_at: null,
        created_at: now,
      },
    },
    { upsert: true },
  );
}

async function setBubbleName(guildId, userId, name) {
  return db.collection("bubbles").updateOne(
    { guild_id: String(guildId), host_id: String(userId) },
    { $set: { name, updated_at: new Date() } },
  );
}
async function setBubbleGuideMessage(guildId, userId, messageId) {
  return db.collection("bubbles").updateOne(
    { guild_id: String(guildId), host_id: String(userId) },
    { $set: { guide_message_id: messageId, updated_at: new Date() } },
  );
}

async function setBubbleUserLimit(guildId, userId, userLimit) {
  if (!Number.isInteger(userLimit) || userLimit < 0 || userLimit > 99) {
    throw new RangeError("Bubble user limit must be between 0 and 99.");
  }

  return db.collection("bubbles").updateOne(
    { guild_id: String(guildId), host_id: String(userId) },
    { $set: { user_limit: userLimit, updated_at: new Date() } },
  );
}

async function setBubbleChannel(guildId, userId, channelId) {
  return db.collection("bubbles").updateOne(
    { guild_id: String(guildId), host_id: String(userId) },
    {
      $set: {
        channel_id: channelId ? String(channelId) : null,
        inactive_since: null,
        updated_at: new Date(),
      },
    },
  );
}

async function setBubbleLocked(guildId, userId, locked) {
  if (typeof locked !== "boolean") {
    throw new TypeError("locked must be a boolean.");
  }

  return db.collection("bubbles").updateOne(
    { guild_id: String(guildId), host_id: String(userId) },
    { $set: { locked, updated_at: new Date() } },
  );
}

async function setBubbleHidden(guildId, userId, hidden) {
  if (typeof hidden !== "boolean") {
    throw new TypeError("hidden must be a boolean.");
  }

  return db.collection("bubbles").updateOne(
    { guild_id: String(guildId), host_id: String(userId) },
    { $set: { hidden, updated_at: new Date() } },
  );
}

async function setBubbleAnchored(guildId, userId, anchored) {
  if (typeof anchored !== "boolean") {
    throw new TypeError("anchored must be a boolean.");
  }

  return db.collection("bubbles").updateOne(
    { guild_id: String(guildId), host_id: String(userId) },
    {
      $set: {
        anchored,
        anchored_at: anchored ? new Date() : null,
        updated_at: new Date(),
      },
    },
  );
}

async function setBubbleTrustedUsers(guildId, userId, trustedUserIds) {
  const userIds = [...new Set(trustedUserIds.map(String))].slice(0, 25);
  return db.collection("bubbles").updateOne(
    { guild_id: String(guildId), host_id: String(userId) },
    {
      $set: {
        trusted_user_ids: userIds,
        updated_at: new Date(),
      },
      $pull: { banned_user_ids: { $in: userIds } },
    },
  );
}

async function setBubbleBannedUsers(guildId, userId, bannedUserIds) {
  const userIds = [...new Set(bannedUserIds.map(String))].slice(0, 25);
  return db.collection("bubbles").updateOne(
    { guild_id: String(guildId), host_id: String(userId) },
    {
      $set: {
        banned_user_ids: userIds,
        updated_at: new Date(),
      },
      $pull: { trusted_user_ids: { $in: userIds } },
    },
  );
}

async function getAnchoredBubbles(guildId) {
  return db.collection("bubbles")
    .find({ guild_id: String(guildId), anchored: true })
    .sort({ anchored_at: 1, created_at: 1 })
    .toArray();
}

async function setBubbleInactiveSince(guildId, userId, inactiveSince) {
  const changes = {
    inactive_since: inactiveSince || null,
    updated_at: new Date(),
  };
  if (!inactiveSince) changes.inactive_warning_sent_at = null;

  return db.collection("bubbles").updateOne(
    { guild_id: String(guildId), host_id: String(userId) },
    { $set: changes },
  );
}

async function setBubbleInactiveWarning(guildId, userId, warningSentAt) {
  return db.collection("bubbles").updateOne(
    { guild_id: String(guildId), host_id: String(userId) },
    {
      $set: {
        inactive_warning_sent_at: warningSentAt || null,
        updated_at: new Date(),
      },
    },
  );
}

async function clearOtherBubbleInactiveWarnings(guildId, userId = null) {
  const query = {
    guild_id: String(guildId),
    inactive_warning_sent_at: { $type: "date" },
  };
  if (userId) query.host_id = { $ne: String(userId) };

  return db.collection("bubbles").updateMany(
    query,
    { $set: { inactive_warning_sent_at: null, updated_at: new Date() } },
  );
}

async function getInactiveBubbles(guildId) {
  return db.collection("bubbles")
    .find({
      guild_id: String(guildId),
      channel_id: { $ne: null },
      inactive_since: { $type: "date" },
    })
    .sort({ inactive_since: 1 })
    .toArray();
}

async function clearBubbleChannel(guildId, channelId) {
  return db.collection("bubbles").updateOne(
    { guild_id: String(guildId), channel_id: String(channelId) },
    {
      $set: {
        channel_id: null,
        inactive_since: null,
        inactive_warning_sent_at: null,
        updated_at: new Date(),
      },
    },
  );
}

async function removeBubble(guildId, userId) {
  return db.collection("bubbles").deleteOne({
    guild_id: String(guildId),
    host_id: String(userId),
  });
}

async function getBubble(guildId, channelId = null, userId = null) {
  if (!channelId && !userId) {
    throw new Error("Either channelId or userId must be provided.");
  }

  const bubbles = db.collection("bubbles");
  const conditions = [];

  if (channelId) conditions.push({ channel_id: String(channelId) });
  if (userId) conditions.push({ host_id: String(userId) });

  const query = {
    guild_id: String(guildId),
    $or: conditions,
  };

  return await bubbles.findOne(query);
}


async function getBubbles(guildId) {
  const bubbles = db.collection("bubbles");
  return bubbles.find({ guild_id: String(guildId) }).toArray();
}

async function getColors(guildId) {
  return db.collection("colors")
    .find({ guild_id: String(guildId) })
    .toArray();
}

async function setColor(guildId, roleId, hex, name) {
  const now = new Date();
  return db.collection("colors").updateOne(
    { guild_id: String(guildId), hex },
    {
      $set: {
        role_id: String(roleId),
        name: name || null,
        updated_at: now,
      },
      $setOnInsert: {
        guild_id: String(guildId),
        hex,
        created_at: now,
      },
    },
    { upsert: true },
  );
}

async function removeColorByRole(guildId, roleId) {
  return db.collection("colors").deleteOne({
    guild_id: String(guildId),
    role_id: String(roleId),
  });
}

async function awardMessageXp(guildId, userId, xpAmount) {
  if (!Number.isFinite(xpAmount)) {
    throw new TypeError("xpAmount must be a finite number");
  }

  const now = new Date();
  const normalizedGuildId = String(guildId);
  const normalizedUserId = String(userId);

  return db.collection("level_profiles").findOneAndUpdate(
    {
      guild_id: normalizedGuildId,
      user_id: normalizedUserId,
    },
    {
      $setOnInsert: {
        guild_id: normalizedGuildId,
        user_id: normalizedUserId,
        created_at: now,
      },
      $inc: {
        xp: xpAmount,
        message_count: 1,
      },
      $set: {
        last_xp_at: now,
        updated_at: now,
      },
    },
    {
      upsert: true,
      returnDocument: "after",
    },
  );
}

async function closeDb() {
  if (initPromise) {
    await client.close();
    client = undefined;
    db = undefined;
    initPromise = undefined;
  }
}

module.exports = {
  initDb,
  getCollection,
  getSettings,
  getLevelProfile,
  getLevelRank,
  setLevelProfile,
  setWelcomeChannels,
  setWelcomeMessages,
  setLevelingEnabled,
  setAiEnabled,
  setAiMemoryEnabled,
  setAiSystemPrompt,
  setAiRulesChannel,
  addAiSampleMessages,
  saveAiMessageStats,
  getAiMessageStats,
  clearAiSampleMessages,
  createAiMemory,
  updateAiMemory,
  applyAiMemoryMutations,
  getAiMemories,
  getAiMemoriesForContext,
  deleteAiMemory,
  clearAiMemories,
  setLevelingXpRange,
  setLevelingCooldown,
  setLevelingChannels,
  setBubbleName,
  setBubbleUserLimit,
  setBubbleChannel,
  setBubbleHidden,
  setBubbleAnchored,
  setBubbleTrustedUsers,
  setBubbleBannedUsers,
  getAnchoredBubbles,
  setBubbleInactiveSince,
  setBubbleInactiveWarning,
  clearOtherBubbleInactiveWarnings,
  getInactiveBubbles,
  clearBubbleChannel,
  setIgnoredLevelingRoles,
  setLevelingRewardRole,
  awardMessageXp,
  closeDb,
  addBubble,
  removeBubble,
  getBubble,
  getBubbles,
  getColors,
  setColor,
  removeColorByRole,
  setBubbleHub,
  setBubbleLocked,
  setBubbleInactiveCategory,
  setBubbleInactiveLimit,
  setBubbleAnchoredLimit,
  setBubbleChannelPrefix,
  setColorAnchor,
  setColorPickerMessage,
  setBubbleGuideMessage,
};
