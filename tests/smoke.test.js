process.env.NODE_ENV = 'test'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const request = require('supertest')
const mongoose = require('mongoose')

const createApp = require('../app')
const db = require('./helpers/db')

test('landing page returns 200 and offers to create a list', async () => {
  const app = createApp()
  const res = await request(app).get('/')

  assert.equal(res.status, 200)
  assert.match(res.text, /Create a list/i)
})

test('test harness connects to an in-memory MongoDB and round-trips a document', async (t) => {
  await db.connect()
  t.after(db.disconnect)

  assert.equal(mongoose.connection.readyState, 1) // 1 === connected

  const Smoke = mongoose.model('Smoke', new mongoose.Schema({ name: String }))
  const saved = await Smoke.create({ name: 'ping' })
  const found = await Smoke.findById(saved._id)

  assert.equal(found.name, 'ping')
})
