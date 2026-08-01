const { MongoClient, ServerApiVersion } = require("mongodb");
const { environment, mongoUri } = require("#config");

const dbName = environment;

let client;
let db;
let initPromise;
const settingsCache = new Map();

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

      const stickyMessages = db.collection("sticky_messages");

      await Promise.all([
        stickyMessages.createIndex({ guild_id: 1, id: 1 }, { unique: true }),
        stickyMessages.createIndex({ guild_id: 1, channel_id: 1, order: 1 }),
        stickyMessages.createIndex({ guild_id: 1, sync_source_id: 1 }),
      ]);

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

async function getGuildSettings(guildId) {
  const key = String(guildId);
  if (settingsCache.has(key)) return settingsCache.get(key);

  const guildSettings = db.collection("guild_settings");
  const settings = (await guildSettings.findOne({ _id: key })) || { _id: key };
  settingsCache.set(key, settings);
  return settings;
}

async function setGuildJoinRole(guildId, roleId) {
  const key = String(guildId);
  const guildSettings = db.collection("guild_settings");
  const update = roleId
    ? { $set: { join_role_id: String(roleId) } }
    : { $unset: { join_role_id: "" } };

  const settings = await guildSettings.findOneAndUpdate(
    { _id: key },
    update,
    { upsert: true, returnDocument: "after" }
  );
  settingsCache.set(key, settings);
  return settings;
}

async function pingDb() {
  await db.command({ ping: 1 });
}

async function getNextStickyId(counters, stickyMessages, guildId) {
  const counterId = `sticky_messages:${guildId}`;
  const latestSticky = await stickyMessages.findOne(
    { guild_id: guildId },
    { sort: { id: -1 }, projection: { id: 1 } }
  );
  await counters.updateOne(
    { _id: counterId },
    { $max: { value: latestSticky?.id || 0 } },
    { upsert: true }
  );
  const counter = await counters.findOneAndUpdate(
    { _id: counterId },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return counter.value;
}

async function createStickyMessage(entry) {
  const counters = db.collection("counters");
  const stickyMessages = db.collection("sticky_messages");
  const guildId = String(entry.guild_id);
  const channelId = String(entry.channel_id);
  const id = await getNextStickyId(counters, stickyMessages, guildId);
  const lastSticky = await stickyMessages.findOne(
    { guild_id: guildId, channel_id: channelId },
    { sort: { order: -1 }, projection: { order: 1 } }
  );
  const sticky = {
    ...entry,
    id,
    type: "sticky",
    guild_id: guildId,
    channel_id: channelId,
    order: (lastSticky?.order || 0) + 1,
    message_id: entry.message_id ? String(entry.message_id) : null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  await stickyMessages.insertOne(sticky);
  return sticky;
}

async function createStickyTemplate(entry) {
  const counters = db.collection("counters");
  const stickyMessages = db.collection("sticky_messages");
  const guildId = String(entry.guild_id);
  const id = await getNextStickyId(counters, stickyMessages, guildId);
  const template = {
    ...entry,
    id,
    type: "template",
    guild_id: guildId,
    created_at: new Date(),
    updated_at: new Date(),
  };

  await stickyMessages.insertOne(template);
  return template;
}

async function getStickyMessage(guildId, id) {
  const stickyMessages = db.collection("sticky_messages");
  return stickyMessages.findOne(
    { guild_id: String(guildId), id: Number(id) },
    { projection: { _id: 0 } }
  );
}

async function getStickyMessages(guildId, channelId = null) {
  const stickyMessages = db.collection("sticky_messages");
  const query = { guild_id: String(guildId), type: { $ne: "template" } };
  if (channelId) query.channel_id = String(channelId);
  return stickyMessages.find(query, { projection: { _id: 0 } })
    .sort({ channel_id: 1, order: 1, id: 1 })
    .toArray();
}

async function getStickyTemplates(guildId) {
  const stickyMessages = db.collection("sticky_messages");
  return stickyMessages.find(
    { guild_id: String(guildId), type: "template" },
    { projection: { _id: 0 } }
  ).sort({ id: 1 }).toArray();
}

async function updateStickyMessage(guildId, id, update) {
  const stickyMessages = db.collection("sticky_messages");
  const allowed = [
    "channel_id",
    "conversation_delay_ms",
    "cloned_from_id",
    "interval_ms",
    "message_id",
    "order",
    "payload",
    "sync_source_id",
    "sync_with_source",
    "template_id",
  ];
  const fields = Object.fromEntries(
    Object.entries(update).filter(([key]) => allowed.includes(key))
  );
  fields.updated_at = new Date();
  return stickyMessages.findOneAndUpdate(
    { guild_id: String(guildId), id: Number(id) },
    { $set: fields },
    { returnDocument: "after", projection: { _id: 0 } }
  );
}

async function syncStickyClones(guildId, sourceId, payload) {
  const stickyMessages = db.collection("sticky_messages");
  const query = {
    guild_id: String(guildId),
    sync_source_id: Number(sourceId),
    sync_with_source: true,
    type: { $ne: "template" },
  };
  await stickyMessages.updateMany(
    query,
    { $set: { payload, updated_at: new Date() } }
  );
  return stickyMessages.find(query, { projection: { _id: 0 } }).toArray();
}

async function stopStickySync(guildId, id) {
  const stickyMessages = db.collection("sticky_messages");
  return stickyMessages.findOneAndUpdate(
    { guild_id: String(guildId), id: Number(id) },
    {
      $set: { sync_with_source: false, updated_at: new Date() },
      $unset: { sync_source_id: "" },
    },
    { returnDocument: "after", projection: { _id: 0 } }
  );
}

async function setStickyDiscordMessage(guildId, id, channelId, messageId) {
  const stickyMessages = db.collection("sticky_messages");
  return stickyMessages.findOneAndUpdate(
    {
      guild_id: String(guildId),
      id: Number(id),
      channel_id: String(channelId),
    },
    { $set: { message_id: String(messageId), updated_at: new Date() } },
    { returnDocument: "after", projection: { _id: 0 } }
  );
}

async function deleteStickyMessage(guildId, id) {
  const stickyMessages = db.collection("sticky_messages");
  const deleted = await stickyMessages.findOneAndDelete(
    { guild_id: String(guildId), id: Number(id) },
    { projection: { _id: 0 } }
  );
  if (deleted) {
    await stickyMessages.updateMany(
      { guild_id: String(guildId), sync_source_id: Number(id) },
      {
        $set: { sync_with_source: false, updated_at: new Date() },
        $unset: { sync_source_id: "" },
      }
    );
  }
  return deleted;
}

async function reorderStickyMessages(guildId, channelId, orderedIds) {
  const stickyMessages = db.collection("sticky_messages");
  if (orderedIds.length === 0) return;
  await stickyMessages.bulkWrite(orderedIds.map((id, index) => ({
    updateOne: {
      filter: {
        guild_id: String(guildId),
        channel_id: String(channelId),
        id: Number(id),
      },
      update: { $set: { order: index + 1, updated_at: new Date() } },
    },
  })));
}

async function closeDb() {
  if (initPromise) {
    await client.close();
    client = undefined;
    db = undefined;
    initPromise = undefined;
    settingsCache.clear();
  }
}

module.exports = {
  initDb,
  getCollection,
  getGuildSettings,
  setGuildJoinRole,
  pingDb,
  createStickyMessage,
  createStickyTemplate,
  getStickyMessage,
  getStickyMessages,
  getStickyTemplates,
  updateStickyMessage,
  syncStickyClones,
  stopStickySync,
  setStickyDiscordMessage,
  deleteStickyMessage,
  reorderStickyMessages,
  closeDb,
};
