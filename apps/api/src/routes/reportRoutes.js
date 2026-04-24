const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const reportController = require("../controllers/reportController");

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware("ADMIN"));

router.get("/day", reportController.getDayReport);
router.get("/week", reportController.getWeekReport);
router.get("/month", reportController.getMonthReport);

module.exports = router;
