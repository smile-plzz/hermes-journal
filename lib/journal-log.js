const path = require('path')
const fs = require('fs')
const os = require('os')

function log(...msgs) {
  fs.appendFileSync(LOG_PATH, msgs.join(' ') + os.EOL)
}

// Default log location: repo root / .journal.log
const LOG_PATH = path.resolve(__dirname, '..', '.journal.log')

module.exports = { log, LOG_PATH }
