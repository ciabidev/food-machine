const { MessageFlags } = require("discord.js");

module.exports = async function setColorRole(interaction, roleId) {
  const colors = await interaction.client.modules.db.getColors(interaction.guildId);
  const colorRoleIds = new Set(colors.map((color) => color.role_id));
  const selectedColor = roleId
    ? colors.find((color) =>
        color.role_id === roleId ||
        color.hex.toLowerCase() === roleId.replace(/^#/, "").toLowerCase() ||
        color.name?.toLowerCase() === roleId.toLowerCase())
    : null;

  if (roleId && !selectedColor) {
    await interaction.reply({
      content: "That color is not in this server's palette.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (selectedColor) {
    const role = interaction.guild.roles.cache.get(selectedColor.role_id) ||
      await interaction.guild.roles.fetch(selectedColor.role_id).catch(() => null);
    if (!role) {
      await interaction.client.modules.db.removeColorByRole(
        interaction.guildId,
        selectedColor.role_id,
      );
      await interaction.reply({
        content: "That color role no longer exists.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  const currentColorRoles = interaction.member.roles.cache
    .filter((role) => colorRoleIds.has(role.id));
  const rolesToRemove = currentColorRoles.filter((role) =>
    role.id !== selectedColor?.role_id);
  if (rolesToRemove.size) {
    await interaction.member.roles.remove(rolesToRemove, "Cosmetic color changed");
  }
  if (selectedColor && !interaction.member.roles.cache.has(selectedColor.role_id)) {
    await interaction.member.roles.add(selectedColor.role_id, "Cosmetic color changed");
  }

  await interaction.reply({
    content: selectedColor
      ? `Your color is now **${selectedColor.name || `#${selectedColor.hex}`}**.`
      : "Your color role was removed.",
    flags: MessageFlags.Ephemeral,
  });
};
