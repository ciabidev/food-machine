const { Events } = require("discord.js");
const messageDelete = require("#events/messageDelete");

module.exports = {
  name: Events.MessageBulkDelete,
  execute(messages) {
    for (const message of messages.values()) {
      messageDelete.execute(message);
    }
  },
};
