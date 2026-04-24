require("dotenv").config();

const express = require("express");
const cors = require("cors");
const authRoutes = require("./src/routes/authRoutes");
const supplierRoutes = require("./src/routes/supplierRoutes");
const pointDeVenteRoutes = require("./src/routes/pointDeVenteRoutes");
const userRoutes = require("./src/routes/userRoutes");
const stockRoutes = require("./src/routes/stockRoutes");
const saleRoutes = require("./src/routes/saleRoutes");
const reportRoutes = require("./src/routes/reportRoutes");
const productRoutes = require("./src/routes/productRoutes");
const apiRoutes = require("./src/routes/apiRoutes");
const requestLoggerMiddleware = require("./src/middlewares/requestLoggerMiddleware");
const notFoundMiddleware = require("./src/middlewares/notFoundMiddleware");
const errorHandlerMiddleware = require("./src/middlewares/errorHandlerMiddleware");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(requestLoggerMiddleware);

app.use("/auth", authRoutes);
app.use("/api", apiRoutes);
app.use("/products", productRoutes);
app.use("/suppliers", supplierRoutes);
app.use("/points-de-vente", pointDeVenteRoutes);
app.use("/users", userRoutes);
app.use("/stocks", stockRoutes);
app.use("/sales", saleRoutes);
app.use("/reports", reportRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Backend API is running" });
});

app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
