const { Prisma } = require("@prisma/client");
const {
  buildProductVariantKey,
  getVariantColor,
  getVariantLabel,
  getVariantSize,
} = require("./productVariantService");

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

const getStartOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const getEndOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const getCashSessionDayRange = (referenceDate = new Date()) => ({
  startDate: getStartOfDay(referenceDate),
  endDate: getEndOfDay(referenceDate),
});

const parseCashSessionSequence = (sessionNumber) => {
  const match = String(sessionNumber || "")
    .trim()
    .match(/^POS\/(\d+)$/i);

  return match ? Number(match[1]) : null;
};

const buildReturnedQuantitiesMap = (retours = []) => {
  const returnedQuantities = new Map();

  for (const retour of retours) {
    const key = buildProductVariantKey(retour.produitId, retour.varianteId);
    returnedQuantities.set(key, (returnedQuantities.get(key) || 0) + retour.quantite);
  }

  return returnedQuantities;
};

const getCashSessionLinePurchasePrice = (line) => {
  if (line?.variante?.prixAchat !== undefined && line?.variante?.prixAchat !== null) {
    return getDecimalValue(line.variante.prixAchat);
  }

  return getDecimalValue(line?.produit?.prixAchat);
};

const getCashSessionLineNetProfit = (line) => {
  const unitSalePrice = getDecimalValue(line?.prixUnitaire).abs();
  const purchasePrice = getCashSessionLinePurchasePrice(line);
  const quantity = getDecimalValue(line?.quantite).abs();
  const subtotal = getDecimalValue(line?.sousTotal);
  const grossMargin = unitSalePrice.minus(purchasePrice).mul(quantity);

  return subtotal.lessThan(0) ? grossMargin.mul(-1) : grossMargin;
};

const buildCashSessionProfit = (sales = []) =>
  sales.reduce(
    (sessionProfit, sale) =>
      sessionProfit.plus(
        (sale?.lignes || []).reduce(
          (saleProfit, line) => saleProfit.plus(getCashSessionLineNetProfit(line)),
          new Prisma.Decimal(0)
        )
      ),
    new Prisma.Decimal(0)
  );

const cashSessionSaleInclude = {
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
      code: true,
    },
  },
  utilisateur: {
    select: {
      id: true,
      nom: true,
      email: true,
      role: true,
    },
  },
  client: {
    include: {
      compte: true,
    },
  },
  lignes: {
    orderBy: {
      id: "asc",
    },
    include: {
      produit: {
        select: {
          id: true,
          nom: true,
          codeBarres: true,
          categorie: true,
          prixAchat: true,
        },
      },
      variante: {
        select: {
          id: true,
          taille: true,
          couleur: true,
          codeBarres: true,
          prixAchat: true,
        },
      },
    },
  },
  retours: {
    select: {
      id: true,
      produitId: true,
      varianteId: true,
      quantite: true,
      raison: true,
      createdAt: true,
    },
  },
};

const cashSessionPosSaleInclude = {
  caisse: {
    select: {
      id: true,
      nom: true,
      code: true,
    },
  },
  utilisateur: {
    select: {
      id: true,
      nom: true,
    },
  },
  lignes: {
    orderBy: {
      id: "asc",
    },
    include: {
      produit: {
        select: {
          id: true,
          nom: true,
        },
      },
      variante: {
        select: {
          id: true,
          taille: true,
          couleur: true,
          codeBarres: true,
        },
      },
    },
  },
};

const cashSessionInclude = {
  caisse: {
    select: {
      id: true,
      nom: true,
      code: true,
      estActive: true,
    },
  },
  pointDeVente: {
    select: {
      id: true,
      nom: true,
      adresse: true,
      telephone: true,
    },
  },
  utilisateur: {
    select: {
      id: true,
      nom: true,
      email: true,
      role: true,
    },
  },
  ventes: {
    orderBy: {
      dateVente: "desc",
    },
    include: cashSessionSaleInclude,
  },
};

const cashSessionPosInclude = {
  caisse: {
    select: {
      id: true,
      nom: true,
      code: true,
      estActive: true,
    },
  },
  pointDeVente: {
    select: {
      id: true,
      nom: true,
      adresse: true,
      telephone: true,
    },
  },
  utilisateur: {
    select: {
      id: true,
      nom: true,
      email: true,
      role: true,
    },
  },
  ventes: {
    orderBy: {
      dateVente: "desc",
    },
    include: cashSessionPosSaleInclude,
  },
};

const cashSessionListInclude = {
  caisse: {
    select: {
      id: true,
      nom: true,
      code: true,
      estActive: true,
    },
  },
  pointDeVente: {
    select: {
      id: true,
      nom: true,
      adresse: true,
      telephone: true,
    },
  },
  utilisateur: {
    select: {
      id: true,
      nom: true,
      email: true,
      role: true,
    },
  },
  ventes: {
    orderBy: {
      dateVente: "desc",
    },
    select: {
      id: true,
      total: true,
      lignes: {
        select: {
          quantite: true,
          prixUnitaire: true,
          sousTotal: true,
          produit: {
            select: {
              prixAchat: true,
            },
          },
          variante: {
            select: {
              prixAchat: true,
            },
          },
        },
      },
    },
  },
};

const formatCashSessionSale = (sale) => {
  const returnedQuantities = buildReturnedQuantitiesMap(sale.retours);
  const total = decimalToNumber(sale.total);

  return {
    id: sale.id,
    ticketNumber: sale.numeroTicket,
    date: sale.dateVente,
    createdAt: sale.createdAt,
    type: total < 0 ? "refund" : "sale",
    paymentMethod: sale.paymentMethod,
    paidAmount: decimalToNumber(sale.paidAmount),
    remainingAmount: decimalToNumber(sale.remainingAmount),
    paymentStatus: sale.paymentStatus,
    status: sale.status,
    total,
    storeId: sale.pointDeVenteId,
    storeName: sale.pointDeVente ? sale.pointDeVente.nom : "",
    cashRegisterId: sale.caisseId,
    cashRegisterName: sale.caisse ? sale.caisse.nom : "",
    userId: sale.utilisateurId,
    cashierName: sale.utilisateur ? sale.utilisateur.nom : "",
    customerId: sale.client?.compte?.id || sale.clientId || null,
    customerNumber: sale.client ? sale.client.numeroClient : null,
    customerName: sale.client?.compte?.nom || sale.client?.nom || "Client inconnu",
    itemsCount: sale.lignes.reduce(
      (totalItems, ligne) => totalItems + ligne.quantite,
      0
    ),
    items: sale.lignes.map((ligne) => {
      const returnedQuantity =
        returnedQuantities.get(buildProductVariantKey(ligne.produitId, ligne.varianteId)) ||
        0;

      return {
        productId: ligne.produitId,
        variantId: ligne.varianteId,
        productName: ligne.produit ? ligne.produit.nom : "",
        variantSize: ligne.variante ? getVariantSize(ligne.variante) : null,
        variantColor: ligne.variante ? getVariantColor(ligne.variante) : null,
        variantLabel: ligne.variante ? getVariantLabel(ligne.variante) : null,
        quantity: ligne.quantite,
        returnedQuantity,
        remainingReturnQuantity: Math.max(ligne.quantite - returnedQuantity, 0),
        unitPrice: decimalToNumber(ligne.prixUnitaire),
        subtotal: decimalToNumber(ligne.sousTotal),
      };
    }),
  };
};

const toApiCashSession = (session, options = {}) => {
  const { includeSales = true, includeProfitMetrics = true } = options;
  const sessionSales = session.ventes || [];
  const totalSales =
    session.totalVentes === undefined || session.totalVentes === null
      ? sessionSales.reduce((sum, sale) => {
          const saleTotal = decimalToNumber(sale.total);
          return sum + saleTotal;
        }, 0)
      : decimalToNumber(session.totalVentes);
  const totalRefunds = includeProfitMetrics
    ? sessionSales.reduce((sum, sale) => {
        const saleTotal = decimalToNumber(sale.total);
        return saleTotal < 0 ? sum + Math.abs(saleTotal) : sum;
      }, 0)
    : 0;
  const totalNet = includeProfitMetrics
    ? decimalToNumber(buildCashSessionProfit(sessionSales))
    : 0;
  const ticketsCount = session.nombreTickets ?? sessionSales.length;

  return {
    id: session.id,
    sessionNumber: session.numeroSession,
    organisationId: session.organisationId,
    cashRegisterId: session.caisseId,
    cashRegisterName: session.caisse ? session.caisse.nom : "",
    cashRegisterCode: session.caisse ? session.caisse.code : "",
    storeId: session.pointDeVenteId,
    storeName: session.pointDeVente ? session.pointDeVente.nom : "",
    userId: session.utilisateurId,
    cashierName: session.utilisateur ? session.utilisateur.nom : "",
    openedAt: session.dateOuverture,
    closedAt: session.dateFermeture,
    status: session.statut,
    totalSales,
    totalRefunds,
    totalNet,
    ticketsCount,
    ordersCount: ticketsCount,
    sales: includeSales ? (session.ventes || []).map(formatCashSessionSale) : undefined,
  };
};

const buildNextCashSessionNumber = async (tx, { organisationId }) => {
  const sessions = await tx.sessionCaisse.findMany({
    where: {
      organisationId,
    },
    select: {
      numeroSession: true,
    },
  });

  const highestSequence = sessions.reduce((maxSequence, session) => {
    const sequence = parseCashSessionSequence(session.numeroSession);
    return sequence && sequence > maxSequence ? sequence : maxSequence;
  }, 0);
  const nextSequence = Math.max(highestSequence, sessions.length) + 1;

  return `POS/${nextSequence}`;
};

const createCashSession = async (
  tx,
  { organisationId, caisseId, pointDeVenteId, utilisateurId, date = new Date() }
) => {
  const numeroSession = await buildNextCashSessionNumber(tx, {
    organisationId,
  });

  return tx.sessionCaisse.create({
    data: {
      organisationId,
      numeroSession,
      caisseId,
      pointDeVenteId,
      utilisateurId,
      dateOuverture: date,
      statut: "OUVERTE",
    },
  });
};

const ensureOpenCashSession = async (
  tx,
  { organisationId, caisseId, pointDeVenteId, utilisateurId, date = new Date() }
) => {
  const existingSession = await tx.sessionCaisse.findFirst({
    where: {
      organisationId,
      caisseId,
      pointDeVenteId,
      statut: "OUVERTE",
    },
    orderBy: {
      dateOuverture: "desc",
    },
  });

  if (existingSession) {
    return existingSession;
  }

  return createCashSession(tx, {
    organisationId,
    caisseId,
    pointDeVenteId,
    utilisateurId,
    date,
  });
};

const recalculateCashSessionMetrics = async (tx, { organisationId, sessionId }) => {
  const aggregatedSales = await tx.vente.aggregate({
    where: {
      organisationId,
      sessionCaisseId: sessionId,
    },
    _count: {
      id: true,
    },
    _sum: {
      total: true,
    },
  });

  return tx.sessionCaisse.update({
    where: {
      id: sessionId,
    },
    data: {
      totalVentes: aggregatedSales._sum.total || new Prisma.Decimal(0),
      nombreTickets: aggregatedSales._count.id || 0,
    },
  });
};

module.exports = {
  cashSessionInclude,
  cashSessionListInclude,
  cashSessionPosInclude,
  cashSessionSaleInclude,
  cashSessionPosSaleInclude,
  createCashSession,
  decimalToNumber,
  ensureOpenCashSession,
  formatCashSessionSale,
  getCashSessionDayRange,
  recalculateCashSessionMetrics,
  toApiCashSession,
};
