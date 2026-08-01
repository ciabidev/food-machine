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
  closeDb,
};
