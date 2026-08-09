const {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
} = require("discord.js");
const saveMessageAsAiMemory = require("#modules/rememberAiMemory");

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName("AI: Remember for Me")
    .setType(ApplicationCommandType.Message)
    .setDMPermission(false),

  execute(interaction) {
    return saveMessageAsAiMemory(interaction, "user");
  },
};
