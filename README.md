
<p align="center"><img src="./assets/fdmtiny.png" width=200 height=200></p>
<p align="center"><b>economy • leveling • user utility • fun</b></p>

<center>custom bot for ciabi server</center>

## Setup

requirements: [Node.js 24](https://nodejs.org/), a discord application, and a mongodb atlas deployment (first cluster free, just make a new mongo project)

1. fork or clone this repository, then run `npm ci`.
2. in the [Discord Developer Portal](https://discord.com/developers/applications), create an application and bot.
3. make sure all privileged gateway intents are enabled for stability
4. on the application's **Installation** page, enable Guild Install and add the `applications.commands` and `bot` scopes. grant View Channels, Send Messages, Read Message History, and Add Reactions.
5. copy `.env.example` and rename the copy as `.env`. set the variables as needed
6. run `npm ci` to install dependencies.
7. run `npm start` to start the bot. 
> if you're developing use `npm run dev` instead.

## AI replies

The Food Machine AI is disabled by default. Set `OLLAMA_URL`, `OLLAMA_MODEL`, and optionally `AI_COOLDOWN_MS` in `.env`, pull the configured model with Ollama, and then enable it in a server with `/ai enable`. `AI_COOLDOWN_MS` controls the minimum time between replies in the same channel and defaults to `15000`.

When enabled, the bot replies only when its mention is the first part of a message. It uses the server name, channel and role metadata, custom emoji and sticker names, the configured rules channel, current channel history, and the message being replied to as temporary context. Messages from explicitly mentioned channels and recent messages from mentioned users are included only when the requesting member can read those channels. `/ai disable` turns replies off, `/ai status` shows the current configuration, `/ai systemprompt` customizes the server's prompt, and `/ai samplemessages` adds administrator-provided style examples. Leave the prompt modal blank to restore the default; sample messages are entered one per line.

Modules in `src/modules` are loaded automatically onto `interaction.client.modules`. For example, use `interaction.client.modules.db.fetchChannel` inside a command or event to retrieve a channel from cache.
