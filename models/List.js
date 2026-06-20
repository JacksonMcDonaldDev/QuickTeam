const mongoose = require('mongoose')
const crypto = require('crypto')

// 128 bits of URL-safe entropy. A list token IS the access control (the secret
// capability URL), and the owner token IS the proof of ownership — both must be
// unguessable.
function generateToken() {
  return crypto.randomBytes(16).toString('base64url')
}

// Embedded sub-documents are intentionally minimal at this slice; later slices
// (member identity, items, subtasks, assignment) flesh them out.
const memberSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
})

const itemSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  done: { type: Boolean, default: false },
})

// One Mongo document per list, holding everything about it.
const listSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, default: generateToken },
  ownerToken: { type: String, required: true, default: generateToken },
  name: { type: String, required: true, trim: true, default: 'Untitled list' },
  members: { type: [memberSchema], default: [] },
  items: { type: [itemSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  // Bumped on every mutation; used later by inactivity expiry.
  lastActivityAt: { type: Date, default: Date.now },
})

module.exports = mongoose.model('List', listSchema)
