import { describe, expect, it } from "vitest";
import { createRecoveryVerifier, verifyRecoveryMnemonic } from "../src/auth/recovery";

describe("BIP39 recovery", () => {
  it("generates a 12-word English mnemonic and verifies the hash", async () => {
    const { mnemonic, hash, salt } = await createRecoveryVerifier();
    expect(mnemonic.split(/\s+/)).toHaveLength(12);
    expect(await verifyRecoveryMnemonic(mnemonic, hash, salt)).toBe(true);
    expect(await verifyRecoveryMnemonic("not a real phrase here at all xx yy zz", hash, salt)).toBe(
      false,
    );
  });

  it("accepts normalized whitespace/case", async () => {
    const { mnemonic, hash, salt } = await createRecoveryVerifier();
    const noisy = `  ${mnemonic.toUpperCase().split(" ").join("   ")}  `;
    expect(await verifyRecoveryMnemonic(noisy, hash, salt)).toBe(true);
  });
});
