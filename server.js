require('dotenv').config({ path: './config/.env' })

const connectDB = require('./config/database')
const createApp = require('./app')

connectDB()

const app = createApp()

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}, you better catch it!`)
})
