export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Cash Flow API",
    version: "0.1.0",
    description: "Versioned REST API for the Cash Flow personal finance PWA.",
  },
  servers: [{ url: "/api/v1" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
  paths: {
    "/auth/register": { post: { summary: "Register a new account" } },
    "/auth/login": {
      post: { summary: "Sign in and issue access/refresh tokens" },
    },
    "/auth/refresh": {
      post: { summary: "Rotate refresh token and issue a new access token" },
    },
    "/profile": {
      get: { summary: "Get profile" },
      put: { summary: "Update profile" },
    },
    "/currencies": { get: { summary: "List supported currencies" } },
    "/user-currencies": {
      get: { summary: "List user currencies" },
      post: { summary: "Add a user currency" },
    },
    "/categories": {
      get: { summary: "List expense categories" },
      post: { summary: "Create expense category" },
    },
    "/expenses": {
      get: { summary: "List expenses" },
      post: { summary: "Create expense setup" },
    },
    "/expenses/{expenseId}/transactions": {
      post: { summary: "Create expense transaction" },
    },
    "/expenses/{expenseId}/transactions/{transactionId}": {
      put: { summary: "Update expense transaction" },
      delete: { summary: "Delete expense transaction" },
    },
    "/expense-purposes": {
      get: { summary: "List previous transaction purposes" },
    },
    "/loans": {
      get: { summary: "List loan people" },
      post: { summary: "Create loan person" },
    },
    "/loans/{loanId}": {
      get: { summary: "Get loan person ledger" },
      put: { summary: "Update loan person" },
    },
    "/loans/share/{shareId}": {
      get: { summary: "Get loan by short share id" },
    },
    "/public/loans/{shareId}": {
      get: { summary: "Get public shared loan ledger", security: [] },
    },
    "/loan-purposes": {
      get: { summary: "List previous loan transaction purposes" },
    },
    "/loans/{loanId}/transactions": {
      post: { summary: "Create loan credit or debit transaction" },
    },
    "/loans/{loanId}/transactions/{transactionId}": {
      put: { summary: "Update loan transaction" },
    },
    "/loans/{loanId}/repayments": {
      post: { summary: "Record loan repayment" },
    },
    "/investments": {
      get: { summary: "List investments" },
      post: { summary: "Create investment" },
    },
    "/stocks": { get: { summary: "List scraped stock prices" } },
    "/stocks/favorites": { put: { summary: "Set stock favorite state" } },
    "/stocks/options": { get: { summary: "List stock filter options" } },
    "/stocks/{id}": { get: { summary: "Get scraped stock price details" } },
    "/assets": {
      get: { summary: "List assets" },
      post: { summary: "Create asset" },
    },
    "/accounts": {
      get: { summary: "List bank accounts" },
      post: { summary: "Create bank account" },
    },
    "/accounts/{accountId}": {
      put: { summary: "Update bank account" },
      delete: { summary: "Archive bank account" },
    },
    "/cards": {
      get: { summary: "List cards" },
      post: { summary: "Create card" },
    },
    "/cards/{cardId}": {
      put: { summary: "Update card" },
      delete: { summary: "Archive card" },
    },
    "/cards/{cardId}/reveal": {
      post: {
        summary: "Reveal protected card details after password verification",
      },
    },
    "/exchange-rates": {
      get: { summary: "List exchange rates" },
      post: { summary: "Create exchange rate" },
    },
    "/dashboard": { get: { summary: "Get owner-scoped dashboard summary" } },
    "/sync/bootstrap": {
      get: {
        summary: "Fetch all owner-scoped data for local SQLite bootstrap",
      },
    },
    "/sync/summary": {
      get: { summary: "Count online records before local restore" },
    },
    "/sync/status": { get: { summary: "Get sync queue status" } },
    "/sync/push": {
      post: { summary: "Queue client operations for server sync" },
    },
    "/trash": { get: { summary: "List archived records" } },
    "/trash/{type}/{id}/restore": {
      post: { summary: "Restore an archived record" },
    },
    "/trash/{type}/{id}": {
      delete: { summary: "Permanently delete an archived record" },
    },
    "/zakat/calculations": {
      get: { summary: "List Zakat calculations" },
      post: { summary: "Create Zakat calculation" },
    },
    "/exports/{module}.csv": {
      get: { summary: "Export owner-scoped module data as CSV" },
    },
  },
};
