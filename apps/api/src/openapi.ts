export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Cash Flow API",
    version: "0.1.0",
    description: "Versioned REST API for the Cash Flow personal finance PWA."
  },
  servers: [{ url: "/api/v1" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    }
  },
  paths: {
    "/auth/register": { post: { summary: "Register a new account" } },
    "/auth/login": { post: { summary: "Sign in and issue access/refresh tokens" } },
    "/auth/refresh": { post: { summary: "Rotate refresh token and issue a new access token" } },
    "/profile": { get: { summary: "Get profile" }, put: { summary: "Update profile" } },
    "/categories": { get: { summary: "List expense categories" }, post: { summary: "Create expense category" } },
    "/expenses": { get: { summary: "List expenses" }, post: { summary: "Create expense" } },
    "/loans": { get: { summary: "List loans" }, post: { summary: "Create loan" } },
    "/loans/{loanId}/repayments": { post: { summary: "Record loan repayment" } },
    "/investments": { get: { summary: "List investments" }, post: { summary: "Create investment" } },
    "/assets": { get: { summary: "List assets" }, post: { summary: "Create asset" } },
    "/exchange-rates": { get: { summary: "List exchange rates" }, post: { summary: "Create exchange rate" } },
    "/dashboard": { get: { summary: "Get owner-scoped dashboard summary" } },
    "/zakat/calculations": { get: { summary: "List Zakat calculations" }, post: { summary: "Create Zakat calculation" } },
    "/exports/{module}.csv": { get: { summary: "Export owner-scoped module data as CSV" } }
  }
};
