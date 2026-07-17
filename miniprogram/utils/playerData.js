function normalizePlayers(players, activeNamesSet, fallbackToPinyin) {
  return [...(players || [])]
    .sort((a, b) => Number(activeNamesSet.has(b.name)) - Number(activeNamesSet.has(a.name)))
    .map(player => {
      const fallback = player.fullPinyin && player.firstLetters
        ? null
        : fallbackToPinyin(player.name)
      return {
        ...player,
        displayName: activeNamesSet.has(player.name) ? `🔥 ${player.name}` : player.name,
        fullPinyin: player.fullPinyin || fallback.fullPinyin,
        firstLetters: player.firstLetters || fallback.firstLetters
      }
    })
}

module.exports = { normalizePlayers }
