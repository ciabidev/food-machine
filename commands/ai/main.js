const registerSubcommandFolder = require("#modules/subcommandFolder");
const { PermissionFlagsBits } = require("discord.js");

module.exports = registerSubcommandFolder({
  name: "ai",
  description: "Configure the Food Machine AI.",
  dirname: __dirname,
  configure: (command) => command
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
});
