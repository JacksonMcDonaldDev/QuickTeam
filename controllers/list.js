const List = require('../models/List')

// The owner cookie persists ownership on the creator's device. It outlives a
// browser session but a list itself expires after inactivity (slice 10).
const OWNER_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000 // 1 year

// Name the per-list owner cookie so one device can own several lists.
function ownerCookieName(token) {
  return `owner_${token}`
}

// Does this request carry proof of owning the given list?
function isOwner(req, list) {
  return req.signedCookies[ownerCookieName(list.token)] === list.ownerToken
}

module.exports = {
  // POST /l — create a list with no account, claim ownership on this device,
  // and redirect to its secret capability URL.
  createList: async (req, res) => {
    const name = (req.body.name || '').trim()
    const list = await List.create(name ? { name } : {})

    res.cookie(ownerCookieName(list.token), list.ownerToken, {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: OWNER_COOKIE_MAX_AGE,
    })

    res.redirect(`/l/${list.token}`)
  },

  // GET /l/:token — render the list shell for anyone with the link. An unknown
  // or malformed token is indistinguishable from a never-existed list: 404.
  getList: async (req, res) => {
    const list = await List.findOne({ token: req.params.token })
    if (!list) {
      return res.status(404).render('404')
    }

    res.render('list', { list, isOwner: isOwner(req, list) })
  },
}
