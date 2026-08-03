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
    welcome_channel_id: null,
    ...document,
    leveling: {
      ...DEFAULT_LEVELING_SETTINGS,
      ...document?.leveling,
    },
  };
}

async function getLevelProfile(guildId, userId) {
  const levelProfiles = db.collection("level_profiles");
  const levelProfile = await levelProfiles.findOne({ guild_id: guildId, user_id: userId });
  return levelProfile;
}

async function getLevelRank(guildId, xp) {
  const profilesAhead = await db.collection("level_profiles").countDocuments({
    guild_id: String(guildId),
    xp: { $gt: xp },
  });

  return profilesAhead + 1;
}

async function setLevelProfile(guildId, userId, changes = {}) {
  const levelProfiles = db.collection("level_profiles");
  return levelProfiles.updateOne(
    { guild_id: guildId, user_id: userId },
    { $set: changes },
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

async function setWelcomeChannel(guildId, channelId) {
  return updateGuildSettings(guildId, {
    $set: {
      welcome_channel_id: channelId ? String(channelId) : null,
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

async function awardMessageXp(guildId, userId, xpAmount) {
  if (!Number.isFinite(xpAmount)) {
    throw new TypeError("xpAmount must be a finite number");
  }

  const now = new Date();

  return db.collection("level_profiles").findOneAndUpdate(
    { _id: `${guildId}:${userId}` },
    {
      $setOnInsert: {
        guild_id: String(guildId),
        user_id: String(userId),
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
  setWelcomeChannel,
  setLevelingEnabled,
  setLevelingXpRange,
  setLevelingCooldown,
  setLevelingChannels,
  setIgnoredLevelingRoles,
  setLevelingRewardRole,
  awardMessageXp,
  closeDb,
};
