const { MongoClient, ServerApiVersion } = require("mongodb");
const { environment, mongoUri } = require("#config");

const dbName = environment;

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
  setLevelingEnabled,
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
