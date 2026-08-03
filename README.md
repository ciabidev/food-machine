
<p align="center"><img src="./assets/fdmtiny.png" width=200 height=200></p>
<p align="center"><b>economy • leveling • user utility • fun</b></p>

<center>custom bot for ciabi server</center>

## Setup

requirements: [Node.js 24](https://nodejs.org/), a discord application, and a mongodb atlas deployment (first cluster free, just make a new mongo project)

1. fork or clone this repository, then run `npm ci`.
2. in the [Discord Developer Portal](https://discord.com/developers/applications), create an application and bot.
3. make sure all privileged gateway intents are enabled for stability
4. on the application's **Installation** page, enable Guild Install and add the `applications.commands` and `bot` scopes. the included commands only need View Channels and Send Messages.
5. copy `.env.example` and rename the copy as `.env`. set the variables as needed
6. run `npm ci` to install dependencies.
7. run `npm start` to start the bot. 
> if you're developing use `npm run dev` instead.

Modules in `src/modules` are loaded automatically onto `interaction.client.modules`. For example, use `interaction.client.modules.db.fetchChannel` inside a command or event to retrieve a channel from cache.
