function createTraceId(scope, now = Date.now(), random = Math.random()) {
  const randomPart = random.toString(36).slice(2, 8)
  return `${scope}-${now}-${randomPart}`
}

function perfLog(scope, traceId, stage, fields = {}, logger = console.log) {
  const suffix = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
  const line = `[PERF][${scope}][${traceId}] ${stage}${suffix ? ` ${suffix}` : ''}`
  logger(line)
  return line
}

module.exports = { createTraceId, perfLog }
