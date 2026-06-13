const ExcelJS = require("exceljs");
const bwipjs = require("bwip-js");
const PDFDocument = require("pdfkit");
const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const { isValidEAN13 } = require("../utils/barcode");
const { createHttpError } = require("../utils/httpError");
const { getOrganisationIdFromUser } = require("../utils/organisationScope");
const { getVariantLabel } = require("../services/productVariantService");

const isBlankString = (value) => typeof value === "string" && value.trim() === "";

const normalizeRequiredString = (value) => String(value || "").trim();

const parseIntegerWithMin = (value, min) => {
  if (value === undefined || value === null || isBlankString(value)) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue >= min ? parsedValue : NaN;
};

const parseOptionalPositiveInteger = (value) => parseIntegerWithMin(value, 1);

const decimalToNumber = (value) => {
  if (value instanceof Prisma.Decimal) {
    return Number(value.toString());
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return Number(value || 0);
};

const getDecimalValue = (value) => {
  if (value instanceof Prisma.Decimal) {
    return value;
  }

  if (value === undefined || value === null || value === "") {
    return new Prisma.Decimal(0);
  }

  return new Prisma.Decimal(value);
};

const getLineNetProfit = (line) => {
  const unitSalePrice = getDecimalValue(line.prixUnitaire);
  const purchasePrice = getDecimalValue(line.produit?.prixAchat);
  const quantity = new Prisma.Decimal(line.quantite || 0);

  return unitSalePrice.minus(purchasePrice).times(quantity);
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(decimalToNumber(value));

const formatDateTime = (value) => {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
};

const getStartOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const getEndOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const getStartOfWeek = (date) => {
  const start = getStartOfDay(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  start.setDate(start.getDate() + diff);
  return start;
};

const getEndOfWeek = (date) => {
  const end = getStartOfWeek(date);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

const getStartOfMonth = (date) =>
  new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);

const getEndOfMonth = (date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

const getDateRange = (period) => {
  const now = new Date();

  if (period === "day") {
    return {
      startDate: getStartOfDay(now),
      endDate: getEndOfDay(now),
    };
  }

  if (period === "week") {
    return {
      startDate: getStartOfWeek(now),
      endDate: getEndOfWeek(now),
    };
  }

  if (period === "month") {
    return {
      startDate: getStartOfMonth(now),
      endDate: getEndOfMonth(now),
    };
  }

  return null;
};

const parseDateFilter = (value, label, endOfDay = false) => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    throw createHttpError(400, `${label} must be a valid date in YYYY-MM-DD format.`);
  }

  return endOfDay ? getEndOfDay(parsedDate) : getStartOfDay(parsedDate);
};

const getEmployeeStoreId = (user) => {
  if (user.role !== "EMPLOYE") {
    return null;
  }

  return user.pointDeVenteId || null;
};

const getVariantBarcodeLabel = (variant) => getVariantLabel(variant);

const getBarcodeImageBuffer = async (barcode) =>
  bwipjs.toBuffer({
    bcid: isValidEAN13(barcode) ? "ean13" : "code128",
    text: barcode,
    scale: 2,
    height: 12,
    includetext: false,
    backgroundcolor: "FFFFFF",
  });

const buildSalesWhereClause = (query, user) => {
  const organisationId = getOrganisationIdFromUser(user);
  const startDate = parseDateFilter(query.startDate, "startDate");
  const endDate = parseDateFilter(query.endDate, "endDate", true);
  const requestedStoreId = parseOptionalPositiveInteger(query.storeId);
  const requestedCashRegisterId = parseOptionalPositiveInteger(query.cashRegisterId);
  const search = normalizeRequiredString(query.search || "").toLowerCase();
  const employeeStoreId = getEmployeeStoreId(user);

  if (Number.isNaN(requestedStoreId)) {
    throw createHttpError(400, "storeId must be a valid positive integer.");
  }

  if (Number.isNaN(requestedCashRegisterId)) {
    throw createHttpError(400, "cashRegisterId must be a valid positive integer.");
  }

  const where = {
    organisationId,
  };

  if (startDate || endDate) {
    where.dateVente = {};

    if (startDate) {
      where.dateVente.gte = startDate;
    }

    if (endDate) {
      where.dateVente.lte = endDate;
    }
  }

  if (user.role === "EMPLOYE") {
    where.utilisateurId = user.id;

    if (employeeStoreId) {
      where.pointDeVenteId = employeeStoreId;
    }
  } else if (requestedStoreId) {
    where.pointDeVenteId = requestedStoreId;
  }

  if (requestedCashRegisterId) {
    where.caisseId = requestedCashRegisterId;
  }

  if (search) {
    where.OR = [
      {
        numeroTicket: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        utilisateur: {
          is: {
            nom: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
      },
      {
        pointDeVente: {
          is: {
            nom: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
      },
      {
        caisse: {
          is: {
            nom: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
      },
    ];
  }

  return {
    where: {
      ...where,
      NOT: {
        numeroTicket: {
          startsWith: "LOCAL-",
        },
      },
    },
    filters: {
      startDate: query.startDate || null,
      endDate: query.endDate || null,
      storeId: user.role === "EMPLOYE" ? employeeStoreId : requestedStoreId,
      cashRegisterId: requestedCashRegisterId,
      search: query.search || "",
    },
  };
};

const fetchSalesExportData = async (query, user) => {
  const { where, filters } = buildSalesWhereClause(query, user);

  const sales = await prisma.vente.findMany({
    where,
    include: {
      pointDeVente: {
        select: {
          id: true,
          nom: true,
        },
      },
      caisse: {
        select: {
          id: true,
          nom: true,
        },
      },
      utilisateur: {
        select: {
          id: true,
          nom: true,
        },
      },
      lignes: {
        select: {
          quantite: true,
        },
      },
    },
    orderBy: {
      dateVente: "desc",
    },
  });

  const rows = sales.map((sale) => ({
    ticketNumber: sale.numeroTicket,
    date: sale.dateVente,
    store: sale.pointDeVente ? sale.pointDeVente.nom : "",
    cashRegister: sale.caisse ? sale.caisse.nom : "",
    cashier: sale.utilisateur ? sale.utilisateur.nom : "",
    productsCount: sale.lignes.reduce((total, ligne) => total + ligne.quantite, 0),
    total: decimalToNumber(sale.total),
    status: sale.status,
  }));

  return {
    filters,
    rows,
    totalRevenue: rows.reduce((sum, row) => sum + row.total, 0),
  };
};

const fetchReportExportData = async (period, user) => {
  const organisationId = getOrganisationIdFromUser(user);
  const normalizedPeriod = normalizeRequiredString(period).toLowerCase();
  const range = getDateRange(normalizedPeriod);

  if (!range) {
    throw createHttpError(400, "period must be one of: day, week, month.");
  }

  const sales = await prisma.vente.findMany({
    where: {
      organisationId,
      dateVente: {
        gte: range.startDate,
        lte: range.endDate,
      },
    },
    include: {
      pointDeVente: {
        select: {
          id: true,
          nom: true,
        },
      },
      lignes: {
        include: {
          produit: {
            select: {
              id: true,
              nom: true,
              prixAchat: true,
            },
          },
        },
      },
    },
    orderBy: {
      dateVente: "desc",
    },
  });

  let revenue = new Prisma.Decimal(0);
  let netProfit = new Prisma.Decimal(0);
  const salesByStoreMap = new Map();
  const topProductsMap = new Map();

  for (const sale of sales) {
    revenue = revenue.plus(sale.total);

    const storeKey = sale.pointDeVente ? sale.pointDeVente.id : 0;
    const existingStore = salesByStoreMap.get(storeKey) || {
      storeName: sale.pointDeVente ? sale.pointDeVente.nom : "",
      revenue: new Prisma.Decimal(0),
      netProfit: new Prisma.Decimal(0),
      salesCount: 0,
    };

    existingStore.revenue = existingStore.revenue.plus(sale.total);
    existingStore.salesCount += 1;
    salesByStoreMap.set(storeKey, existingStore);

    for (const ligne of sale.lignes) {
      const productKey = ligne.produit ? ligne.produit.id : ligne.produitId;
      const existingProduct = topProductsMap.get(productKey) || {
        productName: ligne.produit ? ligne.produit.nom : "",
        quantitySold: 0,
        revenue: new Prisma.Decimal(0),
        netProfit: new Prisma.Decimal(0),
      };
      const lineNetProfit = getLineNetProfit(ligne);

      existingProduct.quantitySold += ligne.quantite;
      existingProduct.revenue = existingProduct.revenue.plus(ligne.sousTotal);
      existingProduct.netProfit = existingProduct.netProfit.plus(lineNetProfit);
      existingStore.netProfit = existingStore.netProfit.plus(lineNetProfit);
      netProfit = netProfit.plus(lineNetProfit);
      topProductsMap.set(productKey, existingProduct);
    }
  }

  const salesByStore = Array.from(salesByStoreMap.values())
    .map((store) => ({
      storeName: store.storeName,
      revenue: decimalToNumber(store.revenue),
      netProfit: decimalToNumber(store.netProfit),
      salesCount: store.salesCount,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const topProducts = Array.from(topProductsMap.values())
    .map((product) => ({
      productName: product.productName,
      quantitySold: product.quantitySold,
      revenue: decimalToNumber(product.revenue),
      netProfit: decimalToNumber(product.netProfit),
    }))
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, 10);

  return {
    period: normalizedPeriod,
    startDate: range.startDate,
    endDate: range.endDate,
    revenue: decimalToNumber(revenue),
    netProfit: decimalToNumber(netProfit),
    salesCount: sales.length,
    averageBasket: sales.length > 0 ? decimalToNumber(revenue.div(sales.length)) : 0,
    bestStore: salesByStore.length > 0 ? salesByStore[0].storeName : "",
    salesByStore,
    topProducts,
  };
};

const fetchStoreReportExportData = async ({ storeId, period, user }) => {
  const organisationId = getOrganisationIdFromUser(user);
  const parsedStoreId = parseOptionalPositiveInteger(storeId);
  const normalizedPeriod = normalizeRequiredString(period || "day").toLowerCase();
  const employeeStoreId = getEmployeeStoreId(user);
  const range = getDateRange(normalizedPeriod);

  if (Number.isNaN(parsedStoreId) || !parsedStoreId) {
    throw createHttpError(400, "storeId must be a valid positive integer.");
  }

  if (!range) {
    throw createHttpError(400, "period must be one of: day, week, month.");
  }

  if (user.role === "EMPLOYE" && !employeeStoreId) {
    throw createHttpError(403, "Employee is not assigned to a store.");
  }

  if (user.role === "EMPLOYE" && employeeStoreId !== parsedStoreId) {
    throw createHttpError(403, "Employees can only export their assigned store.");
  }

  const store = await prisma.pointDeVente.findUnique({
    where: {
      id: parsedStoreId,
    },
    include: {
      _count: {
        select: {
          utilisateurs: true,
          caisses: true,
        },
      },
    },
  });

  if (!store || store.organisationId !== organisationId) {
    throw createHttpError(404, "Store not found.");
  }

  const sales = await prisma.vente.findMany({
    where: {
      organisationId,
      pointDeVenteId: parsedStoreId,
      dateVente: {
        gte: range.startDate,
        lte: range.endDate,
      },
    },
    include: {
      caisse: {
        select: {
          id: true,
          nom: true,
        },
      },
      utilisateur: {
        select: {
          id: true,
          nom: true,
        },
      },
      lignes: {
        include: {
          produit: {
            select: {
              id: true,
              nom: true,
              prixAchat: true,
            },
          },
        },
      },
    },
    orderBy: {
      dateVente: "desc",
    },
  });

  let revenue = new Prisma.Decimal(0);
  let netProfit = new Prisma.Decimal(0);
  const topProductsMap = new Map();

  for (const sale of sales) {
    revenue = revenue.plus(sale.total);

    for (const ligne of sale.lignes) {
      const productKey = ligne.produit ? ligne.produit.id : ligne.produitId;
      const existingProduct = topProductsMap.get(productKey) || {
        productName: ligne.produit ? ligne.produit.nom : "",
        quantitySold: 0,
        revenue: new Prisma.Decimal(0),
        netProfit: new Prisma.Decimal(0),
      };
      const lineNetProfit = getLineNetProfit(ligne);

      existingProduct.quantitySold += ligne.quantite;
      existingProduct.revenue = existingProduct.revenue.plus(ligne.sousTotal);
      existingProduct.netProfit = existingProduct.netProfit.plus(lineNetProfit);
      netProfit = netProfit.plus(lineNetProfit);
      topProductsMap.set(productKey, existingProduct);
    }
  }

  const salesRows = sales.map((sale) => ({
    ticketNumber: sale.numeroTicket,
    date: sale.dateVente,
    cashRegister: sale.caisse ? sale.caisse.nom : "",
    cashier: sale.utilisateur ? sale.utilisateur.nom : "",
    itemsCount: sale.lignes.reduce((total, ligne) => total + ligne.quantite, 0),
    total: decimalToNumber(sale.total),
    status: sale.status,
  }));

  const topProducts = Array.from(topProductsMap.values())
    .map((product) => ({
      productName: product.productName,
      quantitySold: product.quantitySold,
      revenue: decimalToNumber(product.revenue),
      netProfit: decimalToNumber(product.netProfit),
    }))
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, 10);

  return {
    store: {
      id: store.id,
      name: store.nom,
      address: store.adresse || "",
      usersCount: store._count.utilisateurs,
      cashRegistersCount: store._count.caisses,
    },
    period: normalizedPeriod,
    startDate: range.startDate,
    endDate: range.endDate,
    revenue: decimalToNumber(revenue),
    netProfit: decimalToNumber(netProfit),
    salesCount: sales.length,
    averageBasket: sales.length > 0 ? decimalToNumber(revenue.div(sales.length)) : 0,
    topProducts,
    salesRows,
  };
};

const applyWorksheetHeaderStyle = (row) => {
  row.font = {
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1659B5" },
  };
  row.alignment = {
    vertical: "middle",
    horizontal: "center",
  };
};

const autoFitWorksheetColumns = (worksheet) => {
  worksheet.columns.forEach((column) => {
    let maxLength = 12;

    column.eachCell({ includeEmpty: true }, (cell) => {
      const cellValue = cell.value === null || cell.value === undefined ? "" : String(cell.value);
      maxLength = Math.max(maxLength, cellValue.length + 2);
    });

    column.width = Math.min(maxLength, 28);
  });
};

const sendWorkbook = async (res, workbook, filename) => {
  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(Buffer.from(buffer));
};

const sendPdfDocument = (res, doc, filename) =>
  new Promise((resolve, reject) => {
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.status(200).send(Buffer.concat(chunks));
      resolve();
    });
    doc.on("error", reject);
    doc.end();
  });

const addPdfTableHeader = (doc, columns) => {
  doc.font("Helvetica-Bold").fontSize(10);
  columns.forEach((column) => {
    doc.text(column.label, column.x, doc.y, {
      width: column.width,
      continued: false,
    });
  });
  doc.moveDown(0.5);
  doc.font("Helvetica");
};

const ensurePdfPageSpace = (doc, additionalHeight = 40) => {
  if (doc.y + additionalHeight > doc.page.height - 60) {
    doc.addPage();
  }
};

const formatPeriodLabel = (period) => {
  if (period === "week") {
    return "Semaine";
  }

  if (period === "month") {
    return "Mois";
  }

  return "Jour";
};

const getPdfFooterY = (doc) => doc.page.height - 36;

const drawPdfFooter = (doc, pageNumber) => {
  const footerY = getPdfFooterY(doc);

  doc.save();
  doc.font("Helvetica").fontSize(8).fillColor("#6B7280");
  doc.text("Genere automatiquement par Multi-POS Manager", doc.page.margins.left, footerY, {
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 70,
    align: "left",
  });
  doc.text(`Page ${pageNumber}`, doc.page.margins.left, footerY, {
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    align: "right",
  });
  doc.restore();
};

const resetPdfCursor = (doc) => {
  doc.x = doc.page.margins.left;
  doc.y = doc.page.margins.top;
};

const initializePdfFooter = (doc) => {
  let pageNumber = 1;

  drawPdfFooter(doc, pageNumber);
  resetPdfCursor(doc);
  doc.on("pageAdded", () => {
    pageNumber += 1;
    drawPdfFooter(doc, pageNumber);
    resetPdfCursor(doc);
  });
};

const drawSectionTitle = (doc, title) => {
  ensurePdfPageSpace(doc, 52);

  const lineY = doc.y + 10;
  const titleWidth = 180;

  doc.save();
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#111827");
  doc.text(title.toUpperCase(), doc.page.margins.left, doc.y, {
    width: titleWidth,
  });
  doc.strokeColor("#D1D5DB").lineWidth(1);
  doc.moveTo(doc.page.margins.left + titleWidth + 12, lineY);
  doc.lineTo(doc.page.width - doc.page.margins.right, lineY);
  doc.stroke();
  doc.restore();
  doc.moveDown(1.1);
};

const drawSummaryBlock = (doc, { x, y, width, height = 64, label, value, tone = "#F9FAFB" }) => {
  doc.save();
  doc.roundedRect(x, y, width, height, 10).fillAndStroke(tone, "#D1D5DB");
  doc.fillColor("#6B7280").font("Helvetica").fontSize(9).text(label, x + 12, y + 10, {
    width: width - 24,
  });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(15).text(String(value), x + 12, y + 28, {
    width: width - 24,
  });
  doc.restore();
};

const drawTable = (doc, { columns, rows, minRowHeight = 26, headerHeight = 24 }) => {
  const tableX = doc.page.margins.left;
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const pageBottomLimit = getPdfFooterY(doc) - 14;
  const cellPaddingX = 6;
  const cellPaddingY = 7;

  const drawHeader = () => {
    ensurePdfPageSpace(doc, headerHeight + 18);

    let currentX = tableX;
    const currentY = doc.y;

    columns.forEach((column) => {
      doc.save();
      doc.rect(currentX, currentY, column.width, headerHeight).fillAndStroke("#E5E7EB", "#CBD5E1");
      doc.fillColor("#111827").font("Helvetica-Bold").fontSize(9).text(column.label, currentX + cellPaddingX, currentY + 7, {
        width: column.width - cellPaddingX * 2,
        align: column.align || "left",
      });
      doc.restore();
      currentX += column.width;
    });

    doc.y = currentY + headerHeight;
  };

  drawHeader();

  if (!rows.length) {
    ensurePdfPageSpace(doc, minRowHeight + 4);
    doc.save();
    doc.rect(tableX, doc.y, tableWidth, minRowHeight).stroke("#E5E7EB");
    doc.font("Helvetica-Oblique").fontSize(9).fillColor("#6B7280").text(
      "Aucune donnee disponible.",
      tableX + cellPaddingX,
      doc.y + 8,
      {
        width: tableWidth - cellPaddingX * 2,
        align: "center",
      }
    );
    doc.restore();
    doc.y += minRowHeight + 6;
    return;
  }

  rows.forEach((row, rowIndex) => {
    const values = columns.map((column) => {
      const rawValue =
        typeof column.value === "function" ? column.value(row) : row[column.key];
      return rawValue === null || rawValue === undefined || rawValue === "" ? "-" : String(rawValue);
    });

    const computedHeight = values.reduce((maxHeight, value, columnIndex) => {
      const textHeight = doc.heightOfString(value, {
        width: columns[columnIndex].width - cellPaddingX * 2,
        align: columns[columnIndex].align || "left",
      });
      return Math.max(maxHeight, textHeight + cellPaddingY * 2);
    }, minRowHeight);

    if (doc.y + computedHeight > pageBottomLimit) {
      doc.addPage();
      drawHeader();
    }

    let currentX = tableX;
    const currentY = doc.y;
    const rowFill = rowIndex % 2 === 0 ? "#FFFFFF" : "#FAFAFA";

    columns.forEach((column, columnIndex) => {
      doc.save();
      doc.rect(currentX, currentY, column.width, computedHeight).fillAndStroke(rowFill, "#E5E7EB");
      doc.fillColor("#111827").font("Helvetica").fontSize(9).text(values[columnIndex], currentX + cellPaddingX, currentY + cellPaddingY, {
        width: column.width - cellPaddingX * 2,
        align: column.align || "left",
      });
      doc.restore();
      currentX += column.width;
    });

    doc.y = currentY + computedHeight;
  });

  doc.moveDown(0.7);
};

const exportSalesExcel = async (req, res) => {
  const { rows, totalRevenue } = await fetchSalesExportData(req.query, req.user);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Ventes");

  worksheet.columns = [
    { header: "Ticket", key: "ticketNumber" },
    { header: "Date", key: "date" },
    { header: "Magasin", key: "store" },
    { header: "Caisse", key: "cashRegister" },
    { header: "Caissier", key: "cashier" },
    { header: "Nb produits", key: "productsCount" },
    { header: "Total", key: "total" },
    { header: "Statut", key: "status" },
  ];

  applyWorksheetHeaderStyle(worksheet.getRow(1));

  rows.forEach((row) => {
    worksheet.addRow({
      ...row,
      date: formatDateTime(row.date),
      total: row.total,
    });
  });

  worksheet.getColumn("total").numFmt = "#,##0.00";
  const totalRow = worksheet.addRow({
    ticketNumber: "Total",
    total: totalRevenue,
  });
  totalRow.font = { bold: true };
  worksheet.getColumn("total").alignment = { horizontal: "right" };
  autoFitWorksheetColumns(worksheet);

  return sendWorkbook(res, workbook, "sales-export.xlsx");
};

const exportSalesPdf = async (req, res) => {
  const { rows, totalRevenue, filters } = await fetchSalesExportData(req.query, req.user);
  const doc = new PDFDocument({
    margin: 40,
    size: "A4",
    layout: "portrait",
  });
  doc.x = 40;
  doc.y = 40;

  doc.fontSize(18).font("Helvetica-Bold").text("Export des ventes");
  doc.moveDown(0.5);
  doc.fontSize(10).font("Helvetica");
  doc.text(`Date export: ${formatDateTime(new Date())}`);
  doc.text(
    `Filtres: debut ${filters.startDate || "-"} | fin ${filters.endDate || "-"} | magasin ${
      filters.storeId || "-"
    } | caisse ${filters.cashRegisterId || "-"}`
  );

  doc.moveDown();

  const columns = [
    { label: "Ticket", x: 40, width: 55 },
    { label: "Date", x: 95, width: 62 },
    { label: "Magasin", x: 157, width: 72 },
    { label: "Caisse", x: 229, width: 52 },
    { label: "Caissier", x: 281, width: 72 },
    { label: "Nb", x: 353, width: 22 },
    { label: "Total", x: 375, width: 45 },
    { label: "Statut", x: 420, width: 90 },
  ];

  addPdfTableHeader(doc, columns);

  rows.forEach((row) => {
    ensurePdfPageSpace(doc, 32);
    const top = doc.y;

    doc.fontSize(9);
    doc.text(row.ticketNumber, columns[0].x, top, { width: columns[0].width });
    doc.text(formatDateTime(row.date), columns[1].x, top, { width: columns[1].width });
    doc.text(row.store, columns[2].x, top, { width: columns[2].width });
    doc.text(row.cashRegister, columns[3].x, top, { width: columns[3].width });
    doc.text(row.cashier, columns[4].x, top, { width: columns[4].width });
    doc.text(String(row.productsCount), columns[5].x, top, { width: columns[5].width });
    doc.text(formatCurrency(row.total), columns[6].x, top, { width: columns[6].width });
    doc.text(row.status, columns[7].x, top, { width: columns[7].width });
    doc.moveDown(0.9);
  });

  doc.moveDown();
  doc.font("Helvetica-Bold").text(`Total general: ${formatCurrency(totalRevenue)}`);

  return sendPdfDocument(res, doc, "sales-export.pdf");
};

const exportReportExcel = async (req, res) => {
  const report = await fetchReportExportData(req.query.period, req.user);
  const workbook = new ExcelJS.Workbook();

  const summarySheet = workbook.addWorksheet("Synthese");
  summarySheet.columns = [
    { header: "Indicateur", key: "metric" },
    { header: "Valeur", key: "value" },
  ];
  applyWorksheetHeaderStyle(summarySheet.getRow(1));
  summarySheet.addRows([
    { metric: "Periode", value: report.period },
    { metric: "Revenu", value: report.revenue },
    { metric: "Benefice net", value: report.netProfit },
    { metric: "Nombre de ventes", value: report.salesCount },
    { metric: "Panier moyen", value: report.averageBasket },
    { metric: "Meilleur magasin", value: report.bestStore || "-" },
    { metric: "Debut", value: formatDateTime(report.startDate) },
    { metric: "Fin", value: formatDateTime(report.endDate) },
  ]);
  summarySheet.getColumn("value").numFmt = "#,##0.00";
  autoFitWorksheetColumns(summarySheet);

  const storesSheet = workbook.addWorksheet("Ventes par magasin");
  storesSheet.columns = [
    { header: "Magasin", key: "storeName" },
    { header: "Nb ventes", key: "salesCount" },
    { header: "Revenu", key: "revenue" },
    { header: "Benefice net", key: "netProfit" },
  ];
  applyWorksheetHeaderStyle(storesSheet.getRow(1));
  storesSheet.addRows(report.salesByStore);
  storesSheet.getColumn("revenue").numFmt = "#,##0.00";
  storesSheet.getColumn("netProfit").numFmt = "#,##0.00";
  autoFitWorksheetColumns(storesSheet);

  const productsSheet = workbook.addWorksheet("Top produits");
  productsSheet.columns = [
    { header: "Produit", key: "productName" },
    { header: "Quantite vendue", key: "quantitySold" },
    { header: "Revenu", key: "revenue" },
    { header: "Benefice net", key: "netProfit" },
  ];
  applyWorksheetHeaderStyle(productsSheet.getRow(1));
  productsSheet.addRows(report.topProducts);
  productsSheet.getColumn("revenue").numFmt = "#,##0.00";
  productsSheet.getColumn("netProfit").numFmt = "#,##0.00";
  autoFitWorksheetColumns(productsSheet);

  return sendWorkbook(res, workbook, `report-${report.period}.xlsx`);
};

const exportReportPdf = async (req, res) => {
  const report = await fetchReportExportData(req.query.period, req.user);
  const doc = new PDFDocument({
    margin: 40,
    size: "A4",
    layout: "portrait",
  });
  doc.x = 40;
  doc.y = 40;

  doc.font("Helvetica-Bold").fontSize(18).text(`Rapport ${report.period}`);
  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(10);
  doc.text(`Date export: ${formatDateTime(new Date())}`);
  doc.text(`Periode couverte: ${formatDateTime(report.startDate)} - ${formatDateTime(report.endDate)}`);
  doc.moveDown();

  doc.font("Helvetica-Bold").text("Synthese");
  doc.font("Helvetica");
  doc.text(`Revenu: ${formatCurrency(report.revenue)}`);
  doc.text(`Benefice net: ${formatCurrency(report.netProfit)}`);
  doc.text(`Nombre de ventes: ${report.salesCount}`);
  doc.text(`Panier moyen: ${formatCurrency(report.averageBasket)}`);
  doc.text(`Meilleur magasin: ${report.bestStore || "-"}`);

  doc.moveDown();
  doc.font("Helvetica-Bold").text("Ventes par magasin");
  doc.font("Helvetica");
  report.salesByStore.forEach((store) => {
    ensurePdfPageSpace(doc, 24);
    doc.text(
      `${store.storeName || "-"} | ${store.salesCount} ventes | ${formatCurrency(store.revenue)} | Benefice: ${formatCurrency(store.netProfit)}`
    );
  });

  doc.moveDown();
  doc.font("Helvetica-Bold").text("Top produits");
  doc.font("Helvetica");
  report.topProducts.forEach((product) => {
    ensurePdfPageSpace(doc, 24);
    doc.text(
      `${product.productName || "-"} | ${product.quantitySold} unites | ${formatCurrency(product.revenue)} | Benefice: ${formatCurrency(product.netProfit)}`
    );
  });

  return sendPdfDocument(res, doc, `report-${report.period}.pdf`);
};

const exportStoreExcel = async (req, res) => {
  const report = await fetchStoreReportExportData({
    storeId: req.params.storeId,
    period: req.query.period || "day",
    user: req.user,
  });
  const workbook = new ExcelJS.Workbook();

  const summarySheet = workbook.addWorksheet("Synthese magasin");
  summarySheet.columns = [
    { header: "Indicateur", key: "metric" },
    { header: "Valeur", key: "value" },
  ];
  applyWorksheetHeaderStyle(summarySheet.getRow(1));
  summarySheet.addRows([
    { metric: "Magasin", value: report.store.name },
    { metric: "Adresse", value: report.store.address || "-" },
    { metric: "Periode", value: report.period },
    { metric: "Utilisateurs", value: report.store.usersCount },
    { metric: "Caisses", value: report.store.cashRegistersCount },
    { metric: "Revenu", value: report.revenue },
    { metric: "Benefice net", value: report.netProfit },
    { metric: "Nombre de ventes", value: report.salesCount },
    { metric: "Panier moyen", value: report.averageBasket },
    { metric: "Debut", value: formatDateTime(report.startDate) },
    { metric: "Fin", value: formatDateTime(report.endDate) },
  ]);
  summarySheet.getColumn("value").numFmt = "#,##0.00";
  autoFitWorksheetColumns(summarySheet);

  const productsSheet = workbook.addWorksheet("Top produits");
  productsSheet.columns = [
    { header: "Produit", key: "productName" },
    { header: "Quantite vendue", key: "quantitySold" },
    { header: "Revenu", key: "revenue" },
    { header: "Benefice net", key: "netProfit" },
  ];
  applyWorksheetHeaderStyle(productsSheet.getRow(1));
  productsSheet.addRows(report.topProducts);
  productsSheet.getColumn("revenue").numFmt = "#,##0.00";
  productsSheet.getColumn("netProfit").numFmt = "#,##0.00";
  autoFitWorksheetColumns(productsSheet);

  const salesSheet = workbook.addWorksheet("Ventes magasin");
  salesSheet.columns = [
    { header: "Ticket", key: "ticketNumber" },
    { header: "Date", key: "date" },
    { header: "Caisse", key: "cashRegister" },
    { header: "Caissier", key: "cashier" },
    { header: "Nb articles", key: "itemsCount" },
    { header: "Total", key: "total" },
    { header: "Statut", key: "status" },
  ];
  applyWorksheetHeaderStyle(salesSheet.getRow(1));
  report.salesRows.forEach((sale) => {
    salesSheet.addRow({
      ...sale,
      date: formatDateTime(sale.date),
    });
  });
  salesSheet.getColumn("total").numFmt = "#,##0.00";
  autoFitWorksheetColumns(salesSheet);

  return sendWorkbook(res, workbook, `store-${report.store.id}-report.xlsx`);
};

const exportStorePdf = async (req, res) => {
  const report = await fetchStoreReportExportData({
    storeId: req.params.storeId,
    period: req.query.period || "day",
    user: req.user,
  });
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    layout: "portrait",
    autoFirstPage: true,
  });

  const startX = 50;
  const startY = 50;
  const pageBottomLimit = () => doc.page.height - 50;
  const contentWidth = doc.page.width - startX * 2;
  let currentY = startY;

  const ensureSpace = (height = 40) => {
    if (currentY + height <= pageBottomLimit()) {
      return;
    }

    doc.addPage({
      size: "A4",
      margin: 50,
      layout: "portrait",
    });
    doc.x = startX;
    doc.y = startY;
    currentY = startY;
  };

  const drawSectionTitleAt = (title) => {
    ensureSpace(28);
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#111827").text(title, startX, currentY);
    currentY += 18;
    doc.strokeColor("#D1D5DB").lineWidth(1);
    doc.moveTo(startX, currentY);
    doc.lineTo(startX + contentWidth, currentY);
    doc.stroke();
    currentY += 14;
  };

  const drawInfoRow = (label, value) => {
    ensureSpace(20);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#374151").text(`${label}:`, startX, currentY, {
      width: 120,
    });
    doc.font("Helvetica").fontSize(10).fillColor("#111827").text(value || "-", startX + 122, currentY, {
      width: contentWidth - 122,
    });
    currentY += 18;
  };

  const drawSummaryCard = (x, y, width, label, value, fillColor) => {
    doc.roundedRect(x, y, width, 62, 10).fillAndStroke(fillColor, "#D1D5DB");
    doc.font("Helvetica").fontSize(9).fillColor("#6B7280").text(label, x + 10, y + 10, {
      width: width - 20,
    });
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#111827").text(String(value), x + 10, y + 28, {
      width: width - 20,
    });
  };

  const drawTable = (columns, rows, emptyMessage) => {
    const headerHeight = 24;
    const cellPadding = 6;

    const drawHeader = () => {
      ensureSpace(headerHeight + 10);
      let columnX = startX;

      columns.forEach((column) => {
        doc.rect(columnX, currentY, column.width, headerHeight).fillAndStroke("#E5E7EB", "#CBD5E1");
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827").text(column.label, columnX + cellPadding, currentY + 7, {
          width: column.width - cellPadding * 2,
          align: column.align || "left",
        });
        columnX += column.width;
      });

      currentY += headerHeight;
    };

    drawHeader();

    if (!rows.length) {
      ensureSpace(28);
      doc.rect(startX, currentY, contentWidth, 28).stroke("#E5E7EB");
      doc.font("Helvetica").fontSize(9).fillColor("#6B7280").text(emptyMessage, startX + 8, currentY + 9, {
        width: contentWidth - 16,
        align: "center",
      });
      currentY += 36;
      return;
    }

    rows.forEach((row, rowIndex) => {
      const values = columns.map((column) => {
        const rawValue =
          typeof column.value === "function" ? column.value(row) : row[column.key];
        return rawValue === null || rawValue === undefined || rawValue === "" ? "-" : String(rawValue);
      });

      const rowHeight = values.reduce((maxHeight, value, index) => {
        const textHeight = doc.heightOfString(value, {
          width: columns[index].width - cellPadding * 2,
          align: columns[index].align || "left",
        });
        return Math.max(maxHeight, Math.max(24, textHeight + 12));
      }, 24);

      if (currentY + rowHeight > pageBottomLimit()) {
        doc.addPage({
          size: "A4",
          margin: 50,
          layout: "portrait",
        });
        doc.x = startX;
        doc.y = startY;
        currentY = startY;
        drawHeader();
      }

      let columnX = startX;
      const rowFill = rowIndex % 2 === 0 ? "#FFFFFF" : "#FAFAFA";

      columns.forEach((column, index) => {
        doc.rect(columnX, currentY, column.width, rowHeight).fillAndStroke(rowFill, "#E5E7EB");
        doc.font("Helvetica").fontSize(9).fillColor("#111827").text(values[index], columnX + cellPadding, currentY + 7, {
          width: column.width - cellPadding * 2,
          align: column.align || "left",
        });
        columnX += column.width;
      });

      currentY += rowHeight;
    });

    currentY += 10;
  };

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="store-report.pdf"');

  doc.pipe(res);

  doc.x = startX;
  doc.y = startY;

  doc.font("Helvetica-Bold").fontSize(22).fillColor("#111827").text("Multi-POS Manager", startX, startY);
  doc.font("Helvetica").fontSize(14).fillColor("#374151").text("Rapport magasin", startX, 90);

  currentY = 122;
  doc.strokeColor("#D1D5DB").lineWidth(1);
  doc.moveTo(startX, currentY);
  doc.lineTo(startX + contentWidth, currentY);
  doc.stroke();
  currentY += 18;

  doc.font("Helvetica-Bold").fontSize(16).fillColor("#111827").text(report.store.name, startX, currentY);
  currentY += 22;
  doc.font("Helvetica").fontSize(9).fillColor("#6B7280").text(
    `Date generation: ${formatDateTime(new Date())}`,
    startX,
    currentY
  );
  currentY += 22;

  drawSectionTitleAt("Informations");
  drawInfoRow("Periode", formatPeriodLabel(report.period));
  drawInfoRow("Adresse magasin", report.store.address || "-");
  drawInfoRow(
    "Intervalle date",
    `${formatDateTime(report.startDate)} - ${formatDateTime(report.endDate)}`
  );

  currentY += 6;
  drawSectionTitleAt("Synthese");

  ensureSpace(150);
  const cardGap = 12;
  const cardWidth = (contentWidth - cardGap * 2) / 3;
  const cardRowOneY = currentY;
  const cardRowTwoY = currentY + 74;

  drawSummaryCard(startX, cardRowOneY, cardWidth, "Utilisateurs", report.store.usersCount, "#F9FAFB");
  drawSummaryCard(startX + cardWidth + cardGap, cardRowOneY, cardWidth, "Caisses", report.store.cashRegistersCount, "#F9FAFB");
  drawSummaryCard(
    startX + (cardWidth + cardGap) * 2,
    cardRowOneY,
    cardWidth,
    "Nombre de ventes",
    report.salesCount,
    "#F9FAFB"
  );

  drawSummaryCard(startX, cardRowTwoY, cardWidth * 1.5 + cardGap / 2, "Revenu", `${formatCurrency(report.revenue)} DH`, "#EFF6FF");
  drawSummaryCard(
    startX + cardWidth * 1.5 + cardGap * 1.5,
    cardRowTwoY,
    cardWidth * 1.5 + cardGap / 2,
    "Benefice net",
    `${formatCurrency(report.netProfit)} DH`,
    "#ECFDF5"
  );

  const cardRowThreeY = currentY + 148;
  drawSummaryCard(
    startX,
    cardRowThreeY,
    contentWidth,
    "Panier moyen",
    `${formatCurrency(report.averageBasket)} DH`,
    "#F5F3FF"
  );

  currentY += 226;

  drawSectionTitleAt("Top produits");
  drawTable(
    [
      { label: "Produit", key: "productName", width: 210 },
      { label: "Quantite", key: "quantitySold", width: 75, align: "center" },
      { label: "Revenu", width: 95, align: "right", value: (row) => `${formatCurrency(row.revenue)} DH` },
      { label: "Benefice net", width: 120, align: "right", value: (row) => `${formatCurrency(row.netProfit)} DH` },
    ],
    report.topProducts,
    "Aucun produit disponible."
  );

  drawSectionTitleAt("Ventes");
  drawTable(
    [
      { label: "Ticket", key: "ticketNumber", width: 70 },
      { label: "Date", width: 80, value: (row) => formatDateTime(row.date) },
      { label: "Caisse", key: "cashRegister", width: 70 },
      { label: "Caissier", key: "cashier", width: 90 },
      { label: "Articles", key: "itemsCount", width: 55, align: "center" },
      { label: "Total", width: 60, align: "right", value: (row) => `${formatCurrency(row.total)} DH` },
      { label: "Statut", key: "status", width: 70, align: "center" },
    ],
    report.salesRows,
    "Aucune vente disponible."
  );

  doc.end();
};

const exportProductBarcodesPdf = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const mode = normalizeRequiredString(req.body?.mode || "products_and_variants");
  const productId = parseOptionalPositiveInteger(req.body?.productId);

  if (
    ![
      "all_products",
      "selected_product",
      "variants_only",
      "products_and_variants",
    ].includes(mode)
  ) {
    throw createHttpError(400, "mode invalide pour l'export des codes-barres.");
  }

  if (Number.isNaN(productId)) {
    throw createHttpError(400, "productId doit etre un entier positif valide.");
  }

  if (mode === "selected_product" && !productId) {
    throw createHttpError(400, "Veuillez selectionner un produit a exporter.");
  }

  const products = await prisma.produit.findMany({
    where: {
      organisationId,
      ...(mode === "selected_product" && productId ? { id: productId } : {}),
    },
    include: {
      variantes: {
        where: {
          actif: true,
        },
        orderBy: [{ id: "asc" }],
      },
    },
    orderBy: [{ nom: "asc" }, { id: "asc" }],
  });

  if (!products.length) {
    throw createHttpError(404, "Aucun produit disponible pour cet export.");
  }

  const items = [];

  for (const product of products) {
    const productBarcode = normalizeRequiredString(product.codeBarres);

    if (mode === "all_products" || mode === "products_and_variants" || mode === "selected_product") {
      if (productBarcode) {
        items.push({
          key: `product-${product.id}`,
          name: product.nom,
          subtitle: "Produit principal",
          barcode: productBarcode,
          isLegacyBarcode: !isValidEAN13(productBarcode),
        });
      }
    }

    if (mode === "variants_only" || mode === "products_and_variants" || mode === "selected_product") {
      for (const variant of product.variantes || []) {
        const variantBarcode = normalizeRequiredString(variant.codeBarres);

        if (!variantBarcode) {
          continue;
        }

        items.push({
          key: `variant-${variant.id}`,
          name: product.nom,
          subtitle: getVariantBarcodeLabel(variant),
          barcode: variantBarcode,
          isLegacyBarcode: !isValidEAN13(variantBarcode),
        });
      }
    }
  }

  if (!items.length) {
    throw createHttpError(404, "Aucun code-barres disponible pour cet export.");
  }

  const doc = new PDFDocument({
    size: "A4",
    margin: 32,
  });
  const labelWidth = 168;
  const labelHeight = 118;
  const columnGap = 12;
  const rowGap = 14;
  const availableWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const availableHeight =
    doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
  const columns = Math.max(
    1,
    Math.floor((availableWidth + columnGap) / (labelWidth + columnGap))
  );
  const rowsPerPage = Math.max(
    1,
    Math.floor((availableHeight + rowGap) / (labelHeight + rowGap))
  );
  const itemsPerPage = columns * rowsPerPage;
  const startX = doc.page.margins.left;
  const startY = doc.page.margins.top;

  doc.info.Title = "Export codes-barres produits";
  doc.info.Author = "SportZone";

  for (const [index, item] of items.entries()) {
    if (index > 0 && index % itemsPerPage === 0) {
      doc.addPage();
    }

    const positionInPage = index % itemsPerPage;
    const columnIndex = positionInPage % columns;
    const rowIndex = Math.floor(positionInPage / columns);
    const x = startX + columnIndex * (labelWidth + columnGap);
    const y = startY + rowIndex * (labelHeight + rowGap);

    doc
      .roundedRect(x, y, labelWidth, labelHeight, 10)
      .lineWidth(1)
      .strokeColor("#D6E0EC")
      .stroke();

    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#102033")
      .text(item.name, x + 10, y + 10, {
        width: labelWidth - 20,
        height: 26,
        ellipsis: true,
      });

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#5F6C7B")
      .text(item.subtitle, x + 10, y + 34, {
        width: labelWidth - 20,
      });

    const barcodeBuffer = await getBarcodeImageBuffer(item.barcode);
    doc.image(barcodeBuffer, x + 14, y + 48, {
      fit: [labelWidth - 28, 34],
      align: "center",
      valign: "center",
    });

    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#102033")
      .text(item.barcode, x + 10, y + 88, {
        width: labelWidth - 20,
        align: "center",
      });

    if (item.isLegacyBarcode) {
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor("#B45309")
        .text("Code historique exporte en compatibilite.", x + 10, y + 103, {
          width: labelWidth - 20,
          align: "center",
        });
    }
  }

  const filename =
    mode === "selected_product" && products[0]
      ? `codes-barres-${String(products[0].nom || "produit")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-+|-+$/g, "") || "produit"}.pdf`
      : "codes-barres-produits.pdf";

  return sendPdfDocument(res, doc, filename);
};

module.exports = {
  exportSalesExcel,
  exportSalesPdf,
  exportProductBarcodesPdf,
  exportReportExcel,
  exportReportPdf,
  exportStoreExcel,
  exportStorePdf,
};
