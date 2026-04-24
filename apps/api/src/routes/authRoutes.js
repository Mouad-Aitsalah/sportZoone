const express = require("express");
const authController = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const router = express.Router();

router.post("/register", authMiddleware, roleMiddleware("ADMIN"), authController.register);
router.post("/login", authController.login);
router.get("/me", authMiddleware, authController.getMe);

module.exports = router;
