import { describe, expect, it } from "vite-plus/test";

import { decodeRelewiseSettings } from "./relewiseSettings";

describe("decodeRelewiseSettings", () => {
  it("defaults to visible header controls", () => {
    expect(decodeRelewiseSettings(undefined)).toEqual({
      userEmail: "",
      showOpenInEditor: true,
      showCommitAndPush: true,
    });
  });

  it("decodes its independent settings record", () => {
    expect(
      decodeRelewiseSettings({
        userEmail: "  rwj@relewise.com  ",
        showOpenInEditor: false,
        showCommitAndPush: false,
      }),
    ).toEqual({
      userEmail: "rwj@relewise.com",
      showOpenInEditor: false,
      showCommitAndPush: false,
    });
  });
});
