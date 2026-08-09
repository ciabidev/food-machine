const registerSubcommandFolder = require("#modules/subcommandFolder");

module.exports = registerSubcommandFolder({
  name: "ai",
  description: "Configure the Food Machine AI.",
  dirname: __dirname,
  configure: (command) => command
    .setDMPermission(false),
});
