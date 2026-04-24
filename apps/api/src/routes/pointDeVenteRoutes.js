const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const pointDeVenteController = require("../controllers/pointDeVenteController");

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware("ADMIN"));

router.get("/", pointDeVenteController.getAllPointsDeVente);
router.get("/:id", pointDeVenteController.getPointDeVenteById);
router.post("/", pointDeVenteController.createPointDeVente);
router.put("/:id", pointDeVenteController.updatePointDeVente);
router.delete("/:id", pointDeVenteController.deletePointDeVente);

module.exports = router;
