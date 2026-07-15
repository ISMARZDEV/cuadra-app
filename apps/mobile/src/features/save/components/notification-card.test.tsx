import type { AlertNotificationDto } from "@cuadra/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { NotificationCard } from "./notification-card";

const notif: AlertNotificationDto = {
  id: "n1",
  canonical_product_id: "c1",
  product_name: "Arroz Enriquecido La Garza",
  provider_name: "Merca",
  previous_minor: 42400,
  current_minor: 40000,
  currency: "DOP",
  drop_bps: 566,
  triggered_at: "2026-07-04T20:00:00Z",
  read: false,
};

describe("NotificationCard", () => {
  test("muestra el producto y el porcentaje de bajada", () => {
    render(<NotificationCard notification={notif} />);
    expect(screen.getByText("Arroz Enriquecido La Garza")).toBeInTheDocument();
    expect(screen.getByText(/−5\.7%/)).toBeInTheDocument(); // 566 bps → 5.7%
  });
});
