require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const {
  Client,
  Collection,
  GatewayIntentBits,
  SlashCommandSubcommandBuilder,
} = require("discord.js");
const { discordToken } = require("#config");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
client.commands = new Collection();
client.snipes = new Map();
const commandsPath = path.join(__dirname, "commands");
const commandFolders = fs
  .readdirSync(commandsPath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory());

for (const folder of commandFolders) {
  const folderPath = path.join(commandsPath, folder.name);
  const commandFiles = fs.readdirSync(folderPath).filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    const commandImport = `#commands/${folder.name}/${file.slice(0, -3)}`;
    const command = require(commandImport);

    if (command.data instanceof SlashCommandSubcommandBuilder) continue;
    if (!command.data || typeof command.execute !== "function") {
      console.warn(`[COMMAND] ${commandImport} must export data and execute.`);
      continue;
    }

    command.__import = commandImport;
    client.commands.set(command.data.name, command);
  }
}

const eventsPath = path.join(__dirname, "events");
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"));

for (const file of eventFiles) {
  const event = require(`#events/${file.slice(0, -3)}`);
  client[event.once ? "once" : "on"](event.name, (...args) => event.execute(...args));
}

const modulesPath = path.join(__dirname, "src/modules");
const moduleFiles = fs.readdirSync(modulesPath).filter((file) => file.endsWith(".js"));

client.modules = {};

for (const file of moduleFiles) {
  try {
    const imported = require(`#modules/${file.slice(0, -3)}`);
    const name = file.slice(0, -3);

    if (typeof imported === "function" && imported.length === 0) {
      imported(client);
      console.log(`[MODULE] Loaded boot module: ${file}`);
      continue;
    }

    client.modules[name] = imported;
    console.log(`[MODULE] Loaded utility module: ${file}`);
  } catch (error) {
    console.error(`[MODULE] Failed to load ${file}:`, error);
  }
}

async function shutdown() {
  client.destroy();
  await client.modules.db.closeDb();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

async function start() {
  const database = await client.modules.db.initDb();
  if (database) console.log(`Connected to MongoDB database "${database.databaseName}".`);
  await client.login(discordToken);
}

start().catch(async (error) => {
  console.error("Failed to start:", error);
  process.exitCode = 1;
  await shutdown();
});
