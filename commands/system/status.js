const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('status')
		.setDescription('Check whether the bot and database are online.'),
	async execute(interaction) {
		await interaction.client.modules.db.pingDb();
		await interaction.reply(
			`Online — WebSocket ping: ${interaction.client.ws.ping} ms; database: connected.`,
		);
	},
};
