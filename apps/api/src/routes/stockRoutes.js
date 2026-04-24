const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const stockController = require("../controllers/stockController");

const router = express.Router();

router.use(authMiddleware);

router.get("/", roleMiddleware("ADMIN", "EMPLOYE"), stockController.getAllStocks);
router.get("/:id", roleMiddleware("ADMIN", "EMPLOYE"), stockController.getStockById);
router.post("/entry", roleMiddleware("ADMIN"), stockController.stockEntry);
router.post("/exit", roleMiddleware("ADMIN"), stockController.stockExit);
router.put("/:id", roleMiddleware("ADMIN"), stockController.updateStock);

module.exports = router;
