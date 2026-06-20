const express = require('express')
const router = express.Router()
const listController = require('../controllers/list')

router.post('/', listController.createList)
router.get('/:token', listController.getList)
router.post('/:token/join', listController.joinList)

module.exports = router
