const { EmbedBuilder, Events, MessageType } = require("discord.js");
module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    message.client.modules.leveling.handleMessage(message);
  },
};
