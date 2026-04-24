import { formatCurrencyDh } from "../utils/formatters";

function TopSellingList({ products }) {
  return (
    <div className="ranked-list">
      {products.map((product, index) => (
        <div className="ranked-list-item" key={product.name}>
          <div className="ranked-list-index">{String(index + 1).padStart(2, "0")}</div>
          <div className="ranked-list-content">
            <strong>{product.name}</strong>
            <span>
              {product.unitsSold} unites vendues a {product.store}
            </span>
          </div>
          <div className="ranked-list-value">
            {formatCurrencyDh(product.revenue)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default TopSellingList;
