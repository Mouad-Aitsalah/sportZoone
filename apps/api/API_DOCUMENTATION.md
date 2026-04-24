# API Documentation

Simple API documentation for the POS backend.

## Base URL

```txt
http://localhost:5000
```

## Authentication

Protected routes require a Bearer token:

```txt
Authorization: Bearer YOUR_JWT_TOKEN
```

## Root

### `GET /`

- Method: `GET`
- Purpose: Check that the backend is running
- Authentication: `No`
- Request body: `None`

Example response:

```json
{
  "message": "Backend API is running"
}
```

## Auth

### `POST /auth/register`

- Method: `POST`
- Purpose: Create a new user account
- Authentication: `No`

Expected request body:

```json
{
  "nom": "Ali Test",
  "email": "ali@test.com",
  "motDePasse": "123456",
  "role": "EMPLOYE",
  "pointDeVenteId": 1
}
```

Notes:
- `role` can be `ADMIN` or `EMPLOYE`
- `pointDeVenteId` is required for `EMPLOYE`

### `POST /auth/login`

- Method: `POST`
- Purpose: Log in and receive a JWT token
- Authentication: `No`

Expected request body:

```json
{
  "email": "ali@test.com",
  "motDePasse": "123456"
}
```

Example response:

```json
{
  "message": "Connexion reussie.",
  "token": "YOUR_JWT_TOKEN",
  "user": {
    "id": 1,
    "nom": "Ali Test",
    "email": "ali@test.com",
    "role": "EMPLOYE",
    "estActif": true,
    "pointDeVenteId": 1,
    "createdAt": "2026-04-24T00:00:00.000Z",
    "updatedAt": "2026-04-24T00:00:00.000Z"
  }
}
```

### `GET /auth/me`

- Method: `GET`
- Purpose: Get the currently authenticated user
- Authentication: `Yes`
- Request body: `None`

## Products

### `GET /products`

- Method: `GET`
- Purpose: List all products
- Authentication: `Yes`
- Request body: `None`

### `GET /products/:id`

- Method: `GET`
- Purpose: Get one product by ID
- Authentication: `Yes`
- Request body: `None`

### `POST /products`

- Method: `POST`
- Purpose: Create a product
- Authentication: `Yes`

Expected request body:

```json
{
  "codeBarres": "6111000000100",
  "nom": "Jus Orange",
  "categorie": "Boissons",
  "prixAchat": 5,
  "prixVente": 8,
  "seuilMinimum": 10,
  "estActif": true,
  "fournisseurId": 1
}
```

### `PUT /products/:id`

- Method: `PUT`
- Purpose: Update a product
- Authentication: `Yes`

Expected request body:

```json
{
  "nom": "Jus Orange 1L",
  "prixVente": 9,
  "estActif": true
}
```

### `DELETE /products/:id`

- Method: `DELETE`
- Purpose: Delete a product
- Authentication: `Yes`
- Request body: `None`

Example response:

```json
{
  "message": "Produit cree avec succes.",
  "product": {
    "id": 1,
    "codeBarres": "6111000000100",
    "nom": "Jus Orange",
    "categorie": "Boissons",
    "prixAchat": "5",
    "prixVente": "8",
    "seuilMinimum": 10,
    "estActif": true,
    "fournisseurId": 1
  }
}
```

## Suppliers

### `GET /suppliers`

- Method: `GET`
- Purpose: List all suppliers
- Authentication: `Yes`
- Request body: `None`

### `GET /suppliers/:id`

- Method: `GET`
- Purpose: Get one supplier by ID
- Authentication: `Yes`
- Request body: `None`

### `POST /suppliers`

- Method: `POST`
- Purpose: Create a supplier
- Authentication: `Yes`

Expected request body:

```json
{
  "nom": "Atlas Boissons",
  "email": "contact@atlas-boissons.ma",
  "telephone": "0611111111",
  "adresse": "Casablanca"
}
```

### `PUT /suppliers/:id`

- Method: `PUT`
- Purpose: Update a supplier
- Authentication: `Yes`

Expected request body:

```json
{
  "nom": "Atlas Boissons SARL",
  "telephone": "0611111119"
}
```

### `DELETE /suppliers/:id`

- Method: `DELETE`
- Purpose: Delete a supplier
- Authentication: `Yes`
- Request body: `None`

## Points De Vente

### `GET /points-de-vente`

- Method: `GET`
- Purpose: List all points of sale
- Authentication: `Yes`
- Request body: `None`

### `GET /points-de-vente/:id`

- Method: `GET`
- Purpose: Get one point of sale by ID
- Authentication: `Yes`
- Request body: `None`

### `POST /points-de-vente`

- Method: `POST`
- Purpose: Create a point of sale
- Authentication: `Yes`

Expected request body:

```json
{
  "nom": "Point de Vente Centre",
  "adresse": "12 Avenue Hassan II",
  "telephone": "0600000001"
}
```

### `PUT /points-de-vente/:id`

- Method: `PUT`
- Purpose: Update a point of sale
- Authentication: `Yes`

Expected request body:

```json
{
  "nom": "Point de Vente Centre Ville",
  "telephone": "0600000099"
}
```

### `DELETE /points-de-vente/:id`

- Method: `DELETE`
- Purpose: Delete a point of sale
- Authentication: `Yes`
- Request body: `None`

## Users

### `GET /users`

- Method: `GET`
- Purpose: List all users
- Authentication: `Yes`
- Request body: `None`

### `GET /users/:id`

- Method: `GET`
- Purpose: Get one user by ID
- Authentication: `Yes`
- Request body: `None`

### `POST /users`

- Method: `POST`
- Purpose: Create a user
- Authentication: `Yes`

Expected request body:

```json
{
  "nom": "Sara Employee",
  "email": "sara@shop.local",
  "motDePasse": "123456",
  "role": "EMPLOYE",
  "estActif": true,
  "pointDeVenteId": 1
}
```

### `PUT /users/:id`

- Method: `PUT`
- Purpose: Update a user
- Authentication: `Yes`

Expected request body:

```json
{
  "nom": "Sara Updated",
  "role": "EMPLOYE",
  "estActif": true,
  "pointDeVenteId": 2
}
```

Notes:
- `motDePasse` can be included if you want to change the password
- password hashes are never returned in responses

### `DELETE /users/:id`

- Method: `DELETE`
- Purpose: Delete a user
- Authentication: `Yes`
- Request body: `None`

## Stocks

### `GET /stocks`

- Method: `GET`
- Purpose: List stock entries with product and point of sale relations
- Authentication: `Yes`
- Request body: `None`

### `GET /stocks/:id`

- Method: `GET`
- Purpose: Get one stock entry by ID
- Authentication: `Yes`
- Request body: `None`

### `POST /stocks/entry`

- Method: `POST`
- Purpose: Add stock for a product in a point of sale
- Authentication: `Yes`

Expected request body:

```json
{
  "produitId": 1,
  "pointDeVenteId": 1,
  "quantite": 20
}
```

Notes:
- if stock already exists for that product and point of sale, quantity is increased
- if not, a new stock row is created

### `POST /stocks/exit`

- Method: `POST`
- Purpose: Remove stock for a product in a point of sale
- Authentication: `Yes`

Expected request body:

```json
{
  "produitId": 1,
  "pointDeVenteId": 1,
  "quantite": 5
}
```

Notes:
- stock cannot become negative

### `PUT /stocks/:id`

- Method: `PUT`
- Purpose: Manually set the quantity of an existing stock row
- Authentication: `Yes`

Expected request body:

```json
{
  "quantite": 35
}
```

Example response:

```json
{
  "message": "Entree de stock enregistree avec succes.",
  "stock": {
    "id": 1,
    "produitId": 1,
    "pointDeVenteId": 1,
    "quantite": 50,
    "produit": {
      "id": 1,
      "nom": "Coca Cola 33cl"
    },
    "pointDeVente": {
      "id": 1,
      "nom": "Point de Vente Centre"
    }
  }
}
```

## Sales

### `GET /sales`

- Method: `GET`
- Purpose: List all sales
- Authentication: `Yes`
- Request body: `None`

### `GET /sales/:id`

- Method: `GET`
- Purpose: Get one sale by ID
- Authentication: `Yes`
- Request body: `None`

### `POST /sales`

- Method: `POST`
- Purpose: Create a sale, create sale lines, and decrease stock automatically
- Authentication: `Yes`

Expected request body:

```json
{
  "pointDeVenteId": 1,
  "utilisateurId": 1,
  "items": [
    {
      "produitId": 1,
      "quantite": 2
    },
    {
      "produitId": 2,
      "quantite": 1
    }
  ]
}
```

What happens on this route:

- verify point of sale exists
- verify user exists and is active
- verify each product exists and is active
- verify stock is sufficient for each item
- calculate line subtotals and total
- generate a ticket number
- create the sale
- create the sale lines
- decrease stock in the same transaction

Example response:

```json
{
  "message": "Vente creee avec succes.",
  "sale": {
    "id": 1,
    "numeroTicket": "TCK-1-20260424093015-AB12",
    "total": "17",
    "pointDeVenteId": 1,
    "utilisateurId": 1,
    "lignes": [
      {
        "id": 1,
        "produitId": 1,
        "quantite": 2,
        "prixUnitaire": "6.5",
        "sousTotal": "13"
      },
      {
        "id": 2,
        "produitId": 2,
        "quantite": 1,
        "prixUnitaire": "4",
        "sousTotal": "4"
      }
    ]
  }
}
```

## Reports

### `GET /reports/day`

- Method: `GET`
- Purpose: Get the current day report
- Authentication: `Yes`
- Request body: `None`

### `GET /reports/week`

- Method: `GET`
- Purpose: Get the current week report
- Authentication: `Yes`
- Request body: `None`

### `GET /reports/month`

- Method: `GET`
- Purpose: Get the current month report
- Authentication: `Yes`
- Request body: `None`

Each report returns:

- `numberOfSales`
- `totalRevenue`
- `sales`

Example response:

```json
{
  "period": "day",
  "startDate": "2026-04-24T00:00:00.000Z",
  "endDate": "2026-04-24T23:59:59.999Z",
  "numberOfSales": 3,
  "totalRevenue": 245.5,
  "sales": [
    {
      "id": 1,
      "numeroTicket": "TCK-1-20260424093015-AB12",
      "total": "17"
    }
  ]
}
```

## Common Notes

- Most `GET` routes do not need a request body
- `DELETE` routes do not need a request body
- IDs in route params should be positive integers
- Protected routes require a valid JWT token
- If a route returns `401`, the token is missing, invalid, or expired
- If a route returns `404`, the requested resource was not found
- If a route returns `409`, there is usually a duplicate or linked-data conflict
