process.env.NODE_ENV = 'test'
// Signed owner cookies need a secret; set it before the app wires up cookie-parser.
process.env.COOKIE_SECRET = 'test-secret'

const { test, before, after, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const request = require('supertest')

const createApp = require('../app')
const db = require('./helpers/db')

before(db.connect)
after(db.disconnect)
afterEach(db.clear)

test('creating a list redirects to its capability URL and sets a signed owner cookie', async () => {
  const app = createApp()
  const res = await request(app).post('/l').send({ name: 'Camping trip' })

  assert.equal(res.status, 302)
  const location = res.headers.location
  assert.match(location, /^\/l\/[A-Za-z0-9_-]+$/, 'redirects to /l/<token>')

  const token = location.split('/').pop()
  const setCookie = res.headers['set-cookie'].join('\n')
  assert.match(setCookie, new RegExp(`owner_${token}=`), 'sets a per-list owner cookie')
  assert.match(setCookie, /owner_[^=]+=s%3A/, 'owner cookie is signed')
  assert.match(setCookie, /HttpOnly/i, 'owner cookie is HttpOnly')
})

test('visiting an existing capability URL renders the list shell', async () => {
  const app = createApp()
  const createRes = await request(app).post('/l').send({ name: 'Camping trip' })
  const location = createRes.headers.location

  const viewRes = await request(app).get(location)
  assert.equal(viewRes.status, 200)
  assert.match(viewRes.text, /Camping trip/, 'shows the list name')
})

test('the creator is recognized as owner on their device', async () => {
  const app = createApp()
  const agent = request.agent(app)

  const createRes = await agent.post('/l').send({ name: 'Camping trip' })
  const location = createRes.headers.location

  const viewRes = await agent.get(location)
  assert.equal(viewRes.status, 200)
  assert.match(viewRes.text, /data-owner="true"/, 'owner device is flagged in the rendered shell')
})

test('a visitor without the owner cookie can still view but is not owner', async () => {
  const app = createApp()
  const createRes = await request(app).post('/l').send({ name: 'Camping trip' })
  const location = createRes.headers.location

  // Fresh request carries no cookies — anyone with the link can view.
  const viewRes = await request(app).get(location)
  assert.equal(viewRes.status, 200)
  assert.match(viewRes.text, /data-owner="false"/, 'non-owner is not flagged as owner')
})

test('an unknown token returns 404', async () => {
  const app = createApp()
  const res = await request(app).get('/l/this-token-does-not-exist')
  assert.equal(res.status, 404)
})
