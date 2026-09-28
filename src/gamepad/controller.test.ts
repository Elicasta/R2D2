import { describe, expect, it } from "vitest";
import {
  DEFAULT_GAMEPAD_BINDINGS,
  actionsForButton,
  normalizeBindings
} from "./controller";

describe("Xbox controller mappings", () => {
  it("ships with the requested R2 default mapping", () => {
    expect(DEFAULT_GAMEPAD_BINDINGS).toMatchObject({
      happy: "a",
      negative: "b",
      scan: "x",
      excited: "y",
      previousSound: "lb",
      nextSound: "rb",
      tripod: "dpadUp",
      bipod: "dpadDown",
      domeLeft: "dpadLeft",
      domeRight: "dpadRight",
      resetYaw: "leftStick",
      centerDome: "rightStick",
      emergencyStop: "menu",
      toggleLights: "view"
    });
  });

  it("resolves remapped buttons to actions", () => {
    const bindings = {
      ...DEFAULT_GAMEPAD_BINDINGS,
      emergencyStop: "b" as const
    };

    expect(actionsForButton(bindings, "b")).toContain("emergencyStop");
  });

  it("ignores invalid saved mappings", () => {
    const bindings = normalizeBindings({
      happy: "not-a-button",
      scan: "a"
    });

    expect(bindings.happy).toBe(DEFAULT_GAMEPAD_BINDINGS.happy);
    expect(bindings.scan).toBe("a");
  });
});
