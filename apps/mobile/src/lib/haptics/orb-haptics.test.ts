import * as Haptics from "expo-haptics";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { orbListenStart } from "./orb-haptics";

vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(async () => {}),
  performAndroidHapticsAsync: vi.fn(async () => {}),
  selectionAsync: vi.fn(async () => {}),
  notificationAsync: vi.fn(async () => {}),
  ImpactFeedbackStyle: { Light: "light", Rigid: "rigid", Soft: "soft" },
  AndroidHaptics: { Virtual_Key: "virtual-key" },
  NotificationFeedbackType: { Success: "success" },
}));

describe("orbListenStart", () => {
  beforeEach(() => vi.clearAllMocks());

  test("en iOS produce un único contacto rígido", () => {
    orbListenStart("ios");

    expect(Haptics.impactAsync).toHaveBeenCalledOnce();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Rigid);
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });

  test("en Android usa el patrón nativo de una tecla virtual", () => {
    orbListenStart("android");

    expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledOnce();
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith(
      Haptics.AndroidHaptics.Virtual_Key,
    );
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });
});
