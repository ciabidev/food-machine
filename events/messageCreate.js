const { Events } = require("discord.js");

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    message.client.modules.leveling.handleMessage(message).catch((error) => {
      console.error("Failed to process message leveling:", error);
    });
    message.client.modules.ai.handleMessage(message).catch((error) => {
      console.error("Failed to process AI message:", error);
    });
  },
};
