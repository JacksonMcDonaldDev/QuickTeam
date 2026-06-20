const mongoose = require('mongoose')
const crypto = require('crypto')

// 128 bits of URL-safe entropy. A list token IS the access control (the secret
// capability URL), and the owner token IS the proof of ownership — both must be
// unguessable.
function generateToken() {
  return crypto.randomBytes(16).toString('base64url')
}

// A member is a trust-based identity (a name) tied to one device by a secret
// token. There is no cross-device unification: the same person on two devices is
// two member records that may share a name. `admin` is reserved for v2.
const MEMBER_ROLES = ['member', 'owner', 'admin']
const memberSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  // Per-member secret carried by the signed device cookie that maps this device
  // to this member. Unguessable, like the list and owner tokens.
  token: { type: String, required: true, default: generateToken },
  role: { type: String, enum: MEMBER_ROLES, default: 'member' },
})

// An item is embedded in its list. It carries attribution (who added it, who
// completed it) and `order` for explicit positioning (slice 8). `assignedTo` and
// `subtasks` are reserved for later slices but modeled now so the shape is stable.
const itemSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  done: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  addedByMemberId: { type: mongoose.Schema.Types.ObjectId, default: null },
  completedByMemberId: { type: mongoose.Schema.Types.ObjectId, default: null },
  assignedToMemberId: { type: mongoose.Schema.Types.ObjectId, default: null },
  subtasks: { type: [Object], default: [] },
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
