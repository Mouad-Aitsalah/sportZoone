const express = require("express");
const apiController = require("../controllers/apiController");
const exportController = require("../controllers/exportController");
const authMiddleware = require("../middlewares/authMiddleware");
const loginRateLimitMiddleware = require("../middlewares/loginRateLimitMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

router.post(
  "/auth/login",
  loginRateLimitMiddleware,
  asyncHandler(apiController.login)
);

router.use(authMiddleware);

router.get(
  "/products/barcode/:barcode",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(apiController.getProductByBarcode)
);
router.get("/products", roleMiddleware("ADMIN", "EMPLOYE"), asyncHandler(apiController.getProducts));

router.get("/stocks", roleMiddleware("ADMIN", "EMPLOYE"), asyncHandler(apiController.getStocks));
router.get(
  "/stocks/alerts",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(apiController.getStockAlerts)
);
router.post("/stocks/in", roleMiddleware("ADMIN"), asyncHandler(apiController.stockIn));
router.post(
  "/stocks/correction",
  roleMiddleware("ADMIN"),
  asyncHandler(apiController.stockCorrection)
);

router.post("/sales", roleMiddleware("ADMIN", "EMPLOYE"), asyncHandler(apiController.createSale));
router.get("/sales", roleMiddleware("ADMIN", "EMPLOYE"), asyncHandler(apiController.getSales));
router.post(
  "/sales/:id/cancel",
  roleMiddleware("ADMIN"),
  asyncHandler(apiController.cancelSale)
);
router.post(
  "/sales/:id/return",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(apiController.returnSale)
);
router.get(
  "/exports/sales/excel",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(exportController.exportSalesExcel)
);
router.get(
  "/exports/sales/pdf",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(exportController.exportSalesPdf)
);
router.get(
  "/exports/reports/excel",
  roleMiddleware("ADMIN"),
  asyncHandler(exportController.exportReportExcel)
);
router.get(
  "/exports/reports/pdf",
  roleMiddleware("ADMIN"),
  asyncHandler(exportController.exportReportPdf)
);
router.get(
  "/exports/stores/:storeId/excel",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(exportController.exportStoreExcel)
);
router.get(
  "/exports/stores/:storeId/pdf",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(exportController.exportStorePdf)
);

router.get("/suppliers", roleMiddleware("ADMIN"), asyncHandler(apiController.getSuppliers));
router.get(
  "/customers",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(apiController.getCustomers)
);
router.get(
  "/customers/:id",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(apiController.getCustomerById)
);
router.get(
  "/customers/:id/sales",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(apiController.getCustomerSales)
);
router.post(
  "/customers/:id/pay-credit",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(apiController.payCustomerCredit)
);
router.post(
  "/customers",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(apiController.createCustomer)
);
router.delete(
  "/customers/:id",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(apiController.deleteCustomer)
);
router.get(
  "/customers/:id/credit",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(apiController.getCustomerCredit)
);
router.get("/reports", roleMiddleware("ADMIN"), asyncHandler(apiController.getReports));
router.get(
  "/analytics",
  roleMiddleware("ADMIN"),
  asyncHandler(apiController.getAnalytics)
);
router.get(
  "/reports/auto-status",
  roleMiddleware("ADMIN"),
  asyncHandler(apiController.getAutoReportStatus)
);
router.post(
  "/reports/auto-toggle",
  roleMiddleware("ADMIN"),
  asyncHandler(apiController.toggleAutoReportStatus)
);
router.get("/users", roleMiddleware("ADMIN"), asyncHandler(apiController.getUsers));
router.get("/stores", roleMiddleware("ADMIN", "EMPLOYE"), asyncHandler(apiController.getStores));
router.get(
  "/cash-registers",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(apiController.getCashRegisters)
);

module.exports = router;
