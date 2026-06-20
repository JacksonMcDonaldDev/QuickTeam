const path = require('path')
const express = require('express')
const cookieParser = require('cookie-parser')
const logger = require('morgan')

const mainRoutes = require('./routes/main')

// Build the Express app without connecting to a database or binding a port,
// so tests (supertest) and `server.js` can each wire up their own lifecycle.
function createApp() {
  const app = express()

  app.set('view engine', 'ejs')
  app.set('views', path.join(__dirname, 'views'))

  app.use(express.static(path.join(__dirname, 'public')))
  app.use(express.urlencoded({ extended: true }))
  app.use(express.json())

  // Signed cookies are how identity (member + owner tokens) will be carried.
  // The secret comes from configuration, never hardcoded.
  app.use(cookieParser(process.env.COOKIE_SECRET))

  if (process.env.NODE_ENV !== 'test') {
    app.use(logger('dev'))
  }

  app.use('/', mainRoutes)

  return app
}

module.exports = createApp
