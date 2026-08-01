const { Events } = require('discord.js');

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		try {
			const commands = await client.application.commands.set(
				client.commands.map((command) => command.data.toJSON()),
			);
			console.log(`Deployed ${commands.size} global application commands.`);
		}
		catch (error) {
			console.error('Failed to deploy global application commands:', error);
		}

		console.log(`Ready! Logged in as ${client.user.tag}`);
	},
};
