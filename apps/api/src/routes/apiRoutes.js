const express = require("express");
const multer = require("multer");
const apiController = require("../controllers/apiController");
const compteController = require("../controllers/compteController");
const productController = require("../controllers/productController");
const productCategoryController = require("../controllers/productCategoryController");
const exportController = require("../controllers/exportController");
const purchaseController = require("../controllers/purchaseController");
const avoirController = require("../controllers/avoirController");
const cashSessionController = require("../controllers/cashSessionController");
const organisationController = require("../controllers/organisationController");
const expenseController = require("../controllers/expenseController");
const authMiddleware = require("../middlewares/authMiddleware");
const loginRateLimitMiddleware = require("../middlewares/loginRateLimitMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

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
router.get(
  "/products/:id/sales",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(apiController.getProductSales)
);
router.post(
  "/products/import",
  roleMiddleware("ADMIN"),
  upload.single("file"),
  asyncHandler(productController.importProducts)
);
router.get("/products", roleMiddleware("ADMIN", "EMPLOYE"), asyncHandler(apiController.getProducts));
router.get(
  "/organisations",
  roleMiddleware("SUPER_ADMIN", "ADMIN_GLOBAL"),
  asyncHandler(organisationController.getOrganisations)
);
router.post(
  "/organisations",
  roleMiddleware("SUPER_ADMIN", "ADMIN_GLOBAL"),
  asyncHandler(organisationController.createOrganisation)
);
router.put(
  "/organisations/:id",
  roleMiddleware("SUPER_ADMIN", "ADMIN_GLOBAL"),
  asyncHandler(organisationController.updateOrganisation)
);
router.delete(
  "/organisations/:id",
  roleMiddleware("SUPER_ADMIN", "ADMIN_GLOBAL"),
  asyncHandler(organisationController.deleteOrganisation)
);

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
router.patch(
  "/sales/:id/payment",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(apiController.addSalePayment)
);
router.post(
  "/refunds",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(apiController.createRefund)
);
router.post(
  "/sales/refund-free",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(apiController.createRefund)
);
router.get(
  "/cash-sessions/current",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(cashSessionController.getCurrentCashSession)
);
router.patch(
  "/cash-sessions/current/close",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(cashSessionController.closeCurrentCashSession)
);
router.get(
  "/cash-sessions",
  roleMiddleware("ADMIN"),
  asyncHandler(cashSessionController.getCashSessions)
);
router.get(
  "/cash-sessions/:id",
  roleMiddleware("ADMIN"),
  asyncHandler(cashSessionController.getCashSessionById)
);
router.post(
  "/cash-sessions/:id/close",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(cashSessionController.closeCashSession)
);
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
router.post(
  "/sales/:id/refund",
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
router.post(
  "/exports/products/barcodes/pdf",
  roleMiddleware("ADMIN"),
  asyncHandler(exportController.exportProductBarcodesPdf)
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
  "/product-categories",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(productCategoryController.getProductCategories)
);
router.post(
  "/product-categories",
  roleMiddleware("ADMIN"),
  asyncHandler(productCategoryController.createProductCategory)
);
router.put(
  "/product-categories/:id",
  roleMiddleware("ADMIN"),
  asyncHandler(productCategoryController.updateProductCategory)
);
router.delete(
  "/product-categories/:id",
  roleMiddleware("ADMIN"),
  asyncHandler(productCategoryController.deleteProductCategory)
);
router.get(
  "/comptes",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(compteController.getComptes)
);
router.get(
  "/comptes/:id/open-invoices",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(compteController.getCustomerOpenInvoices)
);
router.get(
  "/comptes/:id",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(compteController.getCompteById)
);
router.post("/comptes", roleMiddleware("ADMIN"), asyncHandler(compteController.createCompte));
router.put(
  "/comptes/:id",
  roleMiddleware("ADMIN"),
  asyncHandler(compteController.updateCompte)
);
router.delete(
  "/comptes/:id",
  roleMiddleware("ADMIN"),
  asyncHandler(compteController.deleteCompte)
);
router.post(
  "/purchases",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(purchaseController.createPurchase)
);
router.get(
  "/purchases",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(purchaseController.getPurchases)
);
router.get(
  "/purchases/:id",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(purchaseController.getPurchaseById)
);
router.put(
  "/purchases/:id",
  roleMiddleware("ADMIN"),
  asyncHandler(purchaseController.updatePurchase)
);
router.delete(
  "/purchases/:id",
  roleMiddleware("ADMIN"),
  asyncHandler(purchaseController.deletePurchase)
);
router.get(
  "/expenses",
  roleMiddleware("ADMIN", "SUPER_ADMIN", "ADMIN_GLOBAL"),
  asyncHandler(expenseController.getExpenses)
);
router.post(
  "/expenses",
  roleMiddleware("ADMIN", "SUPER_ADMIN", "ADMIN_GLOBAL"),
  asyncHandler(expenseController.createExpense)
);
router.put(
  "/expenses/:id",
  roleMiddleware("ADMIN", "SUPER_ADMIN", "ADMIN_GLOBAL"),
  asyncHandler(expenseController.updateExpense)
);
router.delete(
  "/expenses/:id",
  roleMiddleware("ADMIN", "SUPER_ADMIN", "ADMIN_GLOBAL"),
  asyncHandler(expenseController.deleteExpense)
);
router.post(
  "/avoirs",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(avoirController.createAvoir)
);
router.get(
  "/avoirs",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(avoirController.getAvoirs)
);
router.get(
  "/avoirs/fournisseurs",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(avoirController.getSupplierAvoirs)
);
router.post(
  "/avoirs/fournisseurs",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(avoirController.createSupplierAvoir)
);
router.get(
  "/avoirs/fournisseurs/:id",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(avoirController.getSupplierAvoirById)
);
router.patch(
  "/avoirs/fournisseurs/:id/valider",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(avoirController.validateSupplierAvoir)
);
router.patch(
  "/avoirs/fournisseurs/:id/annuler",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(avoirController.cancelSupplierAvoir)
);
router.get(
  "/avoirs/:id",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(avoirController.getAvoirById)
);
router.put(
  "/avoirs/:id",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(avoirController.updateAvoir)
);
router.delete(
  "/avoirs/:id",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(avoirController.deleteAvoir)
);
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
router.get(
  "/stores",
  roleMiddleware("ADMIN", "EMPLOYE", "SUPER_ADMIN", "ADMIN_GLOBAL"),
  asyncHandler(apiController.getStores)
);
router.get(
  "/cash-registers",
  roleMiddleware("ADMIN", "EMPLOYE"),
  asyncHandler(apiController.getCashRegisters)
);

module.exports = router;
