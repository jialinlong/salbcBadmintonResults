function createSingleFlight(onDeduplicated = () => {}) {
  let current = null
  return {
    run(task) {
      if (current) {
        onDeduplicated()
        return current
      }
      current = Promise.resolve().then(task)
      current = current.finally(() => { current = null })
      return current
    },
    isRunning() {
      return current !== null
    }
  }
}

module.exports = { createSingleFlight }
