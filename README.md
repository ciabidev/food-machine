
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

The Food Machine AI is disabled by default. Set `GEMINI_API_KEY`, optionally set `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `AI_COOLDOWN_MS`, and `AI_ALLOWED_GUILD_IDS` in `.env`, and then enable it in a server with `/ai enable`. The primary model defaults to `gemini-3.6-flash`; an HTTP 429 or 503 automatically falls back to `gemini-3.5-flash-lite`. `AI_COOLDOWN_MS` defaults to `15000`. `AI_ALLOWED_GUILD_IDS` accepts comma-separated server IDs; leaving it blank allows AI replies in every server. AI requests send the gathered Discord context to the Google Gemini API.

When enabled, the bot replies when its mention is the first part of a message or when someone directly replies to one of its messages. Replies that clearly discuss the AI in third person are ignored. It uses the server name, channel and role metadata, custom emoji and sticker names, the configured rules channel, recent current-channel history, and the message being replied to as temporary context. It can inspect image attachments on the current and replied-to messages; GIFs are sampled into optimized frames. Messages from explicitly mentioned channels and recent messages from mentioned users are included only when the requesting member can read those channels. `/ai disable` turns replies off, `/ai status` shows the current configuration, `/ai systemprompt` customizes the server's prompt, `/ai ruleschannel` selects the channel whose topic, pins, and recent messages contain server rules, and `/ai samplemessages` adds administrator-provided style examples. Leave the system-prompt modal blank to restore the default; omit the rules-channel option to restore Discord's configured server rules channel; separate multiple sample messages with a blank line so multi-line examples stay together.

Modules in `src/modules` are loaded automatically onto `interaction.client.modules`. For example, use `interaction.client.modules.db.fetchChannel` inside a command or event to retrieve a channel from cache.
