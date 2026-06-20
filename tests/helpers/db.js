// Shared test harness: an ephemeral in-memory MongoDB backing Mongoose.
// Future slices drive the real Express app over HTTP (supertest) against this.
const { MongoMemoryServer } = require('mongodb-memory-server')
const mongoose = require('mongoose')

let mongod

// Start an in-memory MongoDB and point Mongoose at it.
async function connect() {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
}

// Tear everything down so the test process can exit cleanly.
async function disconnect() {
  await mongoose.disconnect()
  if (mongod) {
    await mongod.stop()
    mongod = undefined
  }
}

// Empty every collection between tests without paying for a full restart.
async function clear() {
  const { collections } = mongoose.connection
  for (const name of Object.keys(collections)) {
    await collections[name].deleteMany({})
  }
}

module.exports = { connect, disconnect, clear }
