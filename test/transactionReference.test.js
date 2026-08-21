const {
  buildWalkathonReferenceId,
  getAdminTransactionId,
  getAdminTransactionMetadata,
  getEntityId,
} = require("../utils/transactionReference");

describe("transaction reference helpers", () => {
  const walkathonId = "6a83f1d314c1894d764db1af";

  test("extracts an ID from a populated document", () => {
    expect(getEntityId({ _id: walkathonId, weekKey: "2026-W34" })).toBe(
      walkathonId
    );
  });

  test("builds a compact Walkathon reference from a populated document", () => {
    expect(
      buildWalkathonReferenceId(
        { _id: walkathonId, weekKey: "2026-W34" },
        1000,
        1787300000000
      )
    ).toBe(`WALKATHON-${walkathonId}-1000-1787300000000`);
  });

  test("uses the Mongo transaction ID for a legacy expanded reference", () => {
    const transactionId = "6a86b08fa186fb1ad5be1234";
    const expandedReference = `WALKATHON-${"raw challenge data ".repeat(20)}`;

    expect(
      getAdminTransactionId({
        _id: transactionId,
        referenceId: expandedReference,
      })
    ).toBe(transactionId);
  });

  test("keeps a valid compact reference", () => {
    const referenceId = `WALKATHON-${walkathonId}-1000-1787300000000`;

    expect(
      getAdminTransactionId({ _id: "fallback", referenceId })
    ).toBe(referenceId);
  });

  test("normalizes legacy Walkathon XP for the admin transaction list", () => {
    expect(
      getAdminTransactionMetadata({
        amount: 0,
        metadata: { source: "walkathon", xpEarned: 10 },
      })
    ).toEqual({ source: "walkathon", xpEarned: 10, finalXp: 10 });
  });
});
