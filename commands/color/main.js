const registerSubcommandFolder = require("#modules/subcommandFolder");

module.exports = registerSubcommandFolder({
  name: "color",
  description: "Choose a cosmetic role color",
  dirname: __dirname,
  configure: (command) => command.setDMPermission(false),
});
