# Discord.js bot template

A small Discord.js starter with MongoDB support, automatic command, event, and module loading, global slash-command deployment, and centralized error handling.
## Setup

Requirements: [Node.js 24](https://nodejs.org/), a Discord application, and a MongoDB deployment.

1. Use this repository as a template or clone it, then run `npm ci`.
2. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application and bot.
3. Make sure all privileged gateway intents are enabled for stability
4. On the application's **Installation** page, enable Guild Install and add the `applications.commands` and `bot` scopes. The included commands only need View Channels and Send Messages.
5. Copy `.env.example` to `.env`, set `ENVIRONMENT`, add the bot token, and optionally add your Discord user ID to `DEV_IDS`.
6. Install the application in a test server and run `npm start`.

## Project structure

```text
commands/
  system/
    reload.js
    status.js
events/
  interactionCreate.js
  ready.js
src/
  config.js
  modules/
    db.js
index.js
```

Command files export a slash-command builder and an execute function:

```js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('hello')
		.setDescription('Say hello.'),
	async execute(interaction) {
		await interaction.reply('Hello!');
	},
};
```

Place commands in any direct subfolder of `commands`. They are loaded at startup and deployed globally when the client becomes ready. Event files in `events` export `name`, optional `once`, and `execute`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ENVIRONMENT` | Yes | `development` or `production`; also used as the MongoDB database name. |
| `DISCORD_TOKEN` | Yes | Bot token from the Developer Portal. Never commit it. |
| `DEV_IDS` | No | Comma-separated user IDs allowed to use `/reload`. |
| `ISSUES` | No | Issue tracker URL included in generic command errors. |
| `MONGO_URI` | Yes | MongoDB connection string. |

Modules in `src/modules` are loaded automatically onto `interaction.client.modules`. For example, use `interaction.client.modules.db.fetchChannel` inside a command or event to retrieve a channel from cache. Use `npm run dev` to restart automatically while developing.
