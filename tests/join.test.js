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

// Create a list as a fresh (owner) device and return its capability path + agent.
async function makeList(app, name = 'Camping trip') {
  const agent = request.agent(app)
  const res = await agent.post('/l').send({ name })
  return { agent, path: res.headers.location, token: res.headers.location.split('/').pop() }
}

test('opening a list with no member cookie presents a name-gate', async () => {
  const app = createApp()
  const { path } = await makeList(app)

  // A fresh visitor (no member cookie) is asked to join.
  const res = await request(app).get(path)
  assert.equal(res.status, 200)
  assert.match(res.text, /Join this list/, 'shows the name-gate heading')
  assert.match(res.text, /name="name"/, 'has a name input')
  assert.match(res.text, new RegExp(`action="${path}/join"`), 'posts to the join endpoint')
})

test('submitting a name creates a member and sets a signed per-list device cookie', async () => {
  const app = createApp()
  const { path, token } = await makeList(app)

  const visitor = request.agent(app)
  const res = await visitor.post(`${path}/join`).send({ name: 'Riley' })

  assert.equal(res.status, 302)
  assert.equal(res.headers.location, path, 'redirects back to the list')

  const setCookie = res.headers['set-cookie'].join('\n')
  assert.match(setCookie, new RegExp(`member_${token}=`), 'sets a per-list member cookie')
  assert.match(setCookie, /member_[^=]+=s%3A/, 'member cookie is signed')
  assert.match(setCookie, /HttpOnly/i, 'member cookie is HttpOnly')

  const list = await List.findOne({ token })
  const member = list.members.find((m) => m.name === 'Riley')
  assert.ok(member, 'member is persisted on the list document')
  assert.equal(member.role, 'member', 'role defaults to member')
})

test('a returning visitor with a valid device cookie is recognized without re-prompting', async () => {
  const app = createApp()
  const { path } = await makeList(app)

  const visitor = request.agent(app)
  await visitor.post(`${path}/join`).send({ name: 'Riley' })

  const res = await visitor.get(path)
  assert.equal(res.status, 200)
  assert.doesNotMatch(res.text, /Join this list/, 'returning member skips the name-gate')
})

test('typing a name that already exists offers a choice instead of joining', async () => {
  const app = createApp()
  const { path } = await makeList(app)

  const alex = request.agent(app)
  await alex.post(`${path}/join`).send({ name: 'Alex' })

  // A different device claims the same name.
  const other = request.agent(app)
  const res = await other.post(`${path}/join`).send({ name: 'Alex' })

  assert.equal(res.status, 200, 'does not silently join on a collision')
  assert.match(res.text, /continue as Alex/i, 'offers to continue as the existing member')
  assert.match(res.text, /different name/i, 'offers to pick an alternate name')
  // No second member was created yet.
  const list = await List.findOne({ token: path.split('/').pop() })
  assert.equal(list.members.filter((m) => m.name === 'Alex').length, 1)
})

test('continuing as the existing member adopts them without creating a duplicate', async () => {
  const app = createApp()
  const { path, token } = await makeList(app)

  const alex = request.agent(app)
  const joinRes = await alex.post(`${path}/join`).send({ name: 'Alex' })
  const originalToken = (await List.findOne({ token })).members[0].token

  const other = request.agent(app)
  const res = await other.post(`${path}/join`).send({ name: 'Alex', choice: 'existing' })

  assert.equal(res.status, 302)
  const setCookie = res.headers['set-cookie'].join('\n')
  assert.match(setCookie, new RegExp(`member_${token}=`), 'adopts the existing member on this device')

  const list = await List.findOne({ token })
  assert.equal(list.members.length, 1, 'no duplicate member is created')
  assert.equal(list.members[0].token, originalToken, 'still the same member')
})

test('picking an alternate name creates a distinct member', async () => {
  const app = createApp()
  const { path, token } = await makeList(app)

  const alex = request.agent(app)
  await alex.post(`${path}/join`).send({ name: 'Alex' })

  const other = request.agent(app)
  const res = await other.post(`${path}/join`).send({ name: 'Alex (2)' })

  assert.equal(res.status, 302)
  const list = await List.findOne({ token })
  assert.equal(list.members.length, 2, 'a new, distinct member is created')
})

test('the list owner who joins becomes a member with the owner role', async () => {
  const app = createApp()
  const { agent, path, token } = await makeList(app)

  await agent.post(`${path}/join`).send({ name: 'Captain' })

  const list = await List.findOne({ token })
  const owner = list.members.find((m) => m.name === 'Captain')
  assert.equal(owner.role, 'owner', 'the owner device joins with the owner role')
})
