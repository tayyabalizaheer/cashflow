import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("app", () => {
  it("exposes a health endpoint", async () => {
    const app = createApp();
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("ok");
  });
});
