module.exports = function bubbleChannelName(prefix, bubbleName) {
  const trimmedPrefix = prefix;
  const channelName = trimmedPrefix ? `${trimmedPrefix} ${bubbleName}` : bubbleName;
  return Array.from(channelName).slice(0, 100).join("");
};
