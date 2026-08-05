const registerSubcommandFolder = require("#modules/subcommandFolder");
const { PermissionFlagsBits } = require("discord.js");

module.exports = registerSubcommandFolder({
  name: "bubble",
  description: "Manage temporary voice channels",
  dirname: __dirname,
//   fileFilter: (file) => file.endsWith(".js") && !file.endsWith("popbubbles.js") && !file.endsWith("main.js"),
  configure: (command) => command
    .setDMPermission(false)
});
