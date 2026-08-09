const {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const saveMessageAsAiMemory = require("#modules/rememberAiMemory");

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName("AI: Remember for Server")
    .setType(ApplicationCommandType.Message)
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  execute(interaction) {
    return saveMessageAsAiMemory(interaction, "guild");
  },
};
