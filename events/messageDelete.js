const { Events } = require("discord.js");

module.exports = {
  name: Events.MessageDelete,
  execute(message) {
    if (!message.inGuild() || message.author?.bot || !message.author) return;

    const channelSnipes = message.client.snipes.get(message.channelId) ?? [];
    channelSnipes.push({
      author: message.author,
      content: message.content,
      attachments: message.attachments.map((attachment) => ({
        name: attachment.name,
        url: attachment.url,
      })),
      deletedAt: Date.now(),
    });

    message.client.snipes.set(message.channelId, channelSnipes);
  },
};
