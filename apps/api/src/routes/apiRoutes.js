const express = require("express");
const apiController = require("../controllers/apiController");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

router.post("/auth/login", asyncHandler(apiController.login));

router.use(authMiddleware);

router.get(
  "/products/barcode/:barcode",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(apiController.getProductByBarcode)
);
router.get("/products", roleMiddleware("ADMIN"), asyncHandler(apiController.getProducts));

router.get("/stocks", roleMiddleware("ADMIN", "EMPLOYE"), asyncHandler(apiController.getStocks));
router.post("/stocks/in", roleMiddleware("ADMIN"), asyncHandler(apiController.stockIn));
router.post(
  "/stocks/correction",
  roleMiddleware("ADMIN"),
  asyncHandler(apiController.stockCorrection)
);

router.post("/sales", roleMiddleware("ADMIN", "EMPLOYE"), asyncHandler(apiController.createSale));
router.get("/sales", roleMiddleware("ADMIN"), asyncHandler(apiController.getSales));

router.get("/suppliers", roleMiddleware("ADMIN"), asyncHandler(apiController.getSuppliers));
router.get("/reports", roleMiddleware("ADMIN"), asyncHandler(apiController.getReports));
router.get("/users", roleMiddleware("ADMIN"), asyncHandler(apiController.getUsers));
router.get("/stores", roleMiddleware("ADMIN"), asyncHandler(apiController.getStores));

module.exports = router;
