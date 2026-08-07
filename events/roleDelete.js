const { Events } = require("discord.js");
const pickerCommand = require("#commands/color/picker");

module.exports = {
  name: Events.GuildRoleDelete,
  async execute(role) {
    const db = role.client.modules.db;
    const removedColor = await db.removeColorByRole(role.guild.id, role.id);
    const settings = await db.getSettings(role.guild.id);
    if (settings.color.anchor_role_id === role.id) {
      await db.setColorAnchor(role.guild.id, null);
    }
    if (removedColor.deletedCount && settings.color.picker_message_id) {
      await pickerCommand.updateStoredColorPicker(role.client, role.guild.id).catch((error) => {
        console.error("Failed to update the color picker after a role deletion:", error);
      });
    }
  },
};
