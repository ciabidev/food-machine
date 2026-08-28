module.exports = function bubbleChannelName(channelName) {
  return Array.from(channelName).slice(0, 100).join("");
};
