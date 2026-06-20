const express = require('express')
const router = express.Router()
const listController = require('../controllers/list')

router.post('/', listController.createList)
router.get('/:token', listController.getList)
router.post('/:token/join', listController.joinList)
router.post('/:token/items', listController.addItem)
router.post('/:token/items/:itemId/check', listController.checkItem)
router.post('/:token/items/:itemId/uncheck', listController.uncheckItem)

module.exports = router
