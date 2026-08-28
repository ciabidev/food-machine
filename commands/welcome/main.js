const { PermissionFlagsBits } = require("discord.js");
const registerSubcommandFolder = require("#modules/subcommandFolder");

module.exports = registerSubcommandFolder({
  name: "welcome",
  description: "Configure welcome and leave messages.",
  dirname: __dirname,
  configure: (command) => command
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
});
