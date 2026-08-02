const registerSubcommandFolder = require("#modules/subcommandFolder");

module.exports = registerSubcommandFolder({
  name: "levels",
  description: "View and configure the server leveling system.",
  dirname: __dirname,
  configure: (command) => command.setDMPermission(false),
});
