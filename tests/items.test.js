process.env.NODE_ENV = 'test'
// Signed identity cookies (owner + member) need a secret before cookie-parser wires up.
process.env.COOKIE_SECRET = 'test-secret'

const { test, before, after, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const request = require('supertest')

const createApp = require('../app')
const List = require('../models/List')
const db = require('./helpers/db')

before(db.connect)
after(db.disconnect)
afterEach(db.clear)

// Create a list and join it as one member, returning a cookie-bearing agent so
// Tier 0 actions are exercised with a real device identity.
async function joinedList(app, { listName = 'Camping trip', memberName = 'Riley' } = {}) {
  const agent = request.agent(app)
  const created = await agent.post('/l').send({ name: listName })
  const path = created.headers.location
  const token = path.split('/').pop()
  await agent.post(`${path}/join`).send({ name: memberName })
  return { agent, path, token }
}

test('a joined member can add an item, rendered attributed to its author', async () => {
  const app = createApp()
  const { agent, path, token } = await joinedList(app, { memberName: 'Riley' })

  const res = await agent.post(`${path}/items`).send({ text: 'Pitch the tent' })

  assert.equal(res.status, 200)
  assert.match(res.text, /Pitch the tent/, 'fragment shows the new item')
  assert.match(res.text, /added by Riley/, 'item is attributed to its author')
  // The fragment is just the items region, not a full page.
  assert.doesNotMatch(res.text, /<html/i, 'returns a fragment, not a full page')

  const list = await List.findOne({ token })
  assert.equal(list.items.length, 1, 'item is persisted on the document')
  assert.equal(list.items[0].text, 'Pitch the tent')
  assert.ok(list.items[0].addedByMemberId, 'records who added it')
})

test('adding an item bumps lastActivityAt', async () => {
  const app = createApp()
  const { agent, path, token } = await joinedList(app)

  const before = (await List.findOne({ token })).lastActivityAt.getTime()
  // Ensure the clock can advance past the join's own bump.
  await new Promise((r) => setTimeout(r, 5))
  await agent.post(`${path}/items`).send({ text: 'Buy marshmallows' })

  const after = (await List.findOne({ token })).lastActivityAt.getTime()
  assert.ok(after > before, 'mutation advances lastActivityAt')
})

test('a member can check an item, recording who completed it', async () => {
  const app = createApp()
  const { agent, path, token } = await joinedList(app, { memberName: 'Sam' })
  await agent.post(`${path}/items`).send({ text: 'Light the fire' })
  const itemId = (await List.findOne({ token })).items[0].id

  const res = await agent.post(`${path}/items/${itemId}/check`)

  assert.equal(res.status, 200)
  assert.match(res.text, /done by Sam/, 'fragment shows who completed it')

  const item = (await List.findOne({ token })).items.id(itemId)
  assert.equal(item.done, true, 'item is marked done')
  assert.ok(item.completedByMemberId, 'records who completed it')
})

test('a member can uncheck an item, clearing the completed-by attribution', async () => {
  const app = createApp()
  const { agent, path, token } = await joinedList(app)
  await agent.post(`${path}/items`).send({ text: 'Wash dishes' })
  const itemId = (await List.findOne({ token })).items[0].id
  await agent.post(`${path}/items/${itemId}/check`)

  const res = await agent.post(`${path}/items/${itemId}/uncheck`)

  assert.equal(res.status, 200)
  assert.doesNotMatch(res.text, /done by/, 'no completed-by attribution after uncheck')

  const item = (await List.findOne({ token })).items.id(itemId)
  assert.equal(item.done, false, 'item is no longer done')
  assert.equal(item.completedByMemberId, null, 'completed-by is cleared')
})

test('completed items are rendered separately from outstanding ones', async () => {
  const app = createApp()
  const { agent, path, token } = await joinedList(app)
  await agent.post(`${path}/items`).send({ text: 'Outstanding task' })
  await agent.post(`${path}/items`).send({ text: 'Finished task' })
  const finished = (await List.findOne({ token })).items.find((i) => i.text === 'Finished task')

  const res = await agent.post(`${path}/items/${finished.id}/check`)

  assert.match(res.text, /class="outstanding"/, 'has an outstanding group')
  assert.match(res.text, /class="completed"/, 'has a completed group')
})

test('a visitor without a member cookie cannot mutate the list', async () => {
  const app = createApp()
  const { path, token } = await joinedList(app)

  const stranger = request.agent(app)
  const res = await stranger.post(`${path}/items`).send({ text: 'Sneaky item' })

  assert.equal(res.status, 403, 'non-members are forbidden from Tier 0 actions')
  const list = await List.findOne({ token })
  assert.equal(list.items.length, 0, 'no item was added')
})
