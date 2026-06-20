const express = require('express')
const router = express.Router()
const listController = require('../controllers/list')

router.post('/', listController.createList)
router.get('/:token', listController.getList)

module.exports = router
