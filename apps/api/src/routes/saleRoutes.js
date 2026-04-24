const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const saleController = require("../controllers/saleController");

const router = express.Router();

router.use(authMiddleware);

router.get("/", roleMiddleware("ADMIN"), saleController.getAllSales);
router.get("/:id", roleMiddleware("ADMIN"), saleController.getSaleById);
router.post("/", roleMiddleware("ADMIN", "EMPLOYE"), saleController.createSale);

module.exports = router;
