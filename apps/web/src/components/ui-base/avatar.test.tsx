import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui-base/avatar";

describe("Avatar (ui-base)", () => {
  it("renders the fallback initials when there is no image", () => {
    render(
      <Avatar>
        <AvatarFallback>IM</AvatarFallback>
      </Avatar>,
    );

    expect(screen.getByText("IM")).toBeInTheDocument();
  });

  it("renders the fallback initials alongside a broken image (jsdom never loads it)", () => {
    render(
      <Avatar>
        <AvatarImage src="https://example.test/avatar.png" alt="Ismael Martínez" />
        <AvatarFallback>IM</AvatarFallback>
      </Avatar>,
    );

    // jsdom no dispara `onload` para <img>, así que Base UI Avatar nunca resuelve la imagen
    // como cargada — el fallback de iniciales queda montado y visible, que es justamente el
    // comportamiento que necesitamos para el user chip del top bar (Batch 4).
    expect(screen.getByText("IM")).toBeInTheDocument();
  });
});
