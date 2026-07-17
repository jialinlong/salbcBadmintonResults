function loadPlayersAndMatches(loadPlayers, loadMatches) {
  return Promise.all([loadPlayers(), loadMatches()])
}

module.exports = { loadPlayersAndMatches }
