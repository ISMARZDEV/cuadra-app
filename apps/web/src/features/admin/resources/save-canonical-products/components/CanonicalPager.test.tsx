import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CanonicalPager } from "./CanonicalPager";

const t = (key: string) => key;

describe("CanonicalPager", () => {
  it("renders position / total", () => {
    render(<CanonicalPager position={3} total={138} hasPrev hasNext onPrev={vi.fn()} onNext={vi.fn()} t={t} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("/ 138")).toBeInTheDocument();
  });

  it("disables prev when at the first item", () => {
    render(<CanonicalPager position={1} total={10} hasPrev={false} hasNext onPrev={vi.fn()} onNext={vi.fn()} t={t} />);
    expect(screen.getByLabelText("admin.canonicalDetail.pager.prev")).toBeDisabled();
    expect(screen.getByLabelText("admin.canonicalDetail.pager.next")).not.toBeDisabled();
  });

  it("disables next when at the last item", () => {
    render(<CanonicalPager position={10} total={10} hasPrev hasNext={false} onPrev={vi.fn()} onNext={vi.fn()} t={t} />);
    expect(screen.getByLabelText("admin.canonicalDetail.pager.prev")).not.toBeDisabled();
    expect(screen.getByLabelText("admin.canonicalDetail.pager.next")).toBeDisabled();
  });

  it("shows em-dash when position is unknown", () => {
    render(<CanonicalPager position={null} total={5} hasPrev={false} hasNext={false} onPrev={vi.fn()} onNext={vi.fn()} t={t} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("/ 5")).toBeInTheDocument();
  });

  it("calls onPrev/onNext", async () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<CanonicalPager position={5} total={10} hasPrev hasNext onPrev={onPrev} onNext={onNext} t={t} />);
    screen.getByLabelText("admin.canonicalDetail.pager.prev").click();
    screen.getByLabelText("admin.canonicalDetail.pager.next").click();
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("renders an editable position input when onJumpToPosition is provided", () => {
    render(
      <CanonicalPager
        position={20}
        total={50}
        hasPrev
        hasNext
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onJumpToPosition={vi.fn()}
        t={t}
      />,
    );
    const input = screen.getByLabelText("admin.canonicalDetail.pager.position") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("20");
  });

  it("calls onJumpToPosition with the entered position on Enter", async () => {
    const onJump = vi.fn();
    render(
      <CanonicalPager
        position={20}
        total={50}
        hasPrev
        hasNext
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onJumpToPosition={onJump}
        t={t}
      />,
    );
    const input = screen.getByLabelText("admin.canonicalDetail.pager.position") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "35");
    await userEvent.keyboard("{Enter}");
    expect(onJump).toHaveBeenCalledWith(35);
  });

  it("does not call onJumpToPosition when the value is unchanged", async () => {
    const onJump = vi.fn();
    render(
      <CanonicalPager
        position={20}
        total={50}
        hasPrev
        hasNext
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onJumpToPosition={onJump}
        t={t}
      />,
    );
    const input = screen.getByLabelText("admin.canonicalDetail.pager.position") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "20");
    await userEvent.keyboard("{Enter}");
    expect(onJump).not.toHaveBeenCalled();
  });

  it("rejects invalid positions on blur and reverts to the current position", async () => {
    const onJump = vi.fn();
    render(
      <CanonicalPager
        position={20}
        total={50}
        hasPrev
        hasNext
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onJumpToPosition={onJump}
        t={t}
      />,
    );
    const input = screen.getByLabelText("admin.canonicalDetail.pager.position") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "99");
    await userEvent.tab();
    expect(onJump).not.toHaveBeenCalled();
    expect(input.value).toBe("20");
  });

  it("reverts on Escape", async () => {
    const onJump = vi.fn();
    render(
      <CanonicalPager
        position={20}
        total={50}
        hasPrev
        hasNext
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onJumpToPosition={onJump}
        t={t}
      />,
    );
    const input = screen.getByLabelText("admin.canonicalDetail.pager.position") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "12");
    await userEvent.keyboard("{Escape}");
    expect(onJump).not.toHaveBeenCalled();
    expect(input.value).toBe("20");
  });
});
