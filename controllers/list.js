const List = require('../models/List')

// Identity cookies persist on a device. They outlive a browser session but a
// list itself expires after inactivity (slice 10).
const IDENTITY_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000 // 1 year

// Shared options for the signed, device-bound identity cookies.
const IDENTITY_COOKIE_OPTS = {
  signed: true,
  httpOnly: true,
  sameSite: 'lax',
  maxAge: IDENTITY_COOKIE_MAX_AGE,
}

// Per-list cookie names so one device can hold identities for several lists.
function ownerCookieName(token) {
  return `owner_${token}`
}
function memberCookieName(token) {
  return `member_${token}`
}

// Does this request carry proof of owning the given list?
function isOwner(req, list) {
  return req.signedCookies[ownerCookieName(list.token)] === list.ownerToken
}

// The member this device is signed in as on this list, or null if it has no
// (valid) member cookie — e.g. a first-time visitor.
function currentMember(req, list) {
  const token = req.signedCookies[memberCookieName(list.token)]
  if (!token) return null
  return list.members.find((m) => m.token === token) || null
}

// Find a member by name, case-insensitively — names are how people recognize
// each other, so "Alex" and "alex" collide.
function findMemberByName(list, name) {
  const lowered = name.toLowerCase()
  return list.members.find((m) => m.name.toLowerCase() === lowered) || null
}

// Render the list page, which shows the name-gate until this device has joined.
// `collision` and `error` drive the variants of the gate.
function renderList(req, res, list, { collision = null, error = null } = {}) {
  res.render('list', {
    list,
    isOwner: isOwner(req, list),
    member: currentMember(req, list),
    collision,
    error,
  })
}

module.exports = {
  // POST /l — create a list with no account, claim ownership on this device,
  // and redirect to its secret capability URL.
  createList: async (req, res) => {
    const name = (req.body.name || '').trim()
    const list = await List.create(name ? { name } : {})

    res.cookie(ownerCookieName(list.token), list.ownerToken, IDENTITY_COOKIE_OPTS)

    res.redirect(`/l/${list.token}`)
  },

  // GET /l/:token — render the list shell for anyone with the link. An unknown
  // or malformed token is indistinguishable from a never-existed list: 404.
  getList: async (req, res) => {
    const list = await List.findOne({ token: req.params.token })
    if (!list) {
      return res.status(404).render('404')
    }

    renderList(req, res, list)
  },

  // POST /l/:token/join — the accountless name-gate. A first-time device types a
  // name to join; a returning device is already recognized by its cookie. A name
  // that collides with an existing member forces an explicit choice: continue as
  // that member, or pick an alternate name.
  joinList: async (req, res) => {
    const list = await List.findOne({ token: req.params.token })
    if (!list) {
      return res.status(404).render('404')
    }

    const name = (req.body.name || '').trim()
    if (!name) {
      return renderList(req, res, list, { error: 'Please enter a name.' })
    }

    const existing = findMemberByName(list, name)
    let member

    if (existing && req.body.choice === 'existing') {
      // Explicitly self-identifying as the existing member: adopt them here.
      member = existing
    } else if (existing) {
      // Collision without a resolved choice: ask how to proceed.
      return renderList(req, res, list, { collision: { name: existing.name } })
    } else {
      // A new name: create a member. The owner's device joins as the owner.
      const role = isOwner(req, list) ? 'owner' : 'member'
      member = list.members.create({ name, role })
      list.members.push(member)
      list.lastActivityAt = Date.now()
      await list.save()
    }

    res.cookie(memberCookieName(list.token), member.token, IDENTITY_COOKIE_OPTS)
    res.redirect(`/l/${list.token}`)
  },
}
