const MAX_DISPLAY_REFERENCE_LENGTH = 160;

function getEntityId(value) {
  const candidate = value?._id ?? value;
  return candidate == null ? "" : candidate.toString();
}

function buildWalkathonReferenceId(walkathon, milestone, timestamp = Date.now()) {
  const walkathonId = getEntityId(walkathon);
  if (!walkathonId) {
    throw new Error("Walkathon ID is required to create a transaction reference");
  }

  return `WALKATHON-${walkathonId}-${milestone}-${timestamp}`;
}

function getAdminTransactionId(transaction) {
  const referenceId = transaction?.referenceId;
  const fallbackId = getEntityId(transaction);

  if (typeof referenceId !== "string" || referenceId.length === 0) {
    return fallbackId;
  }

  // Older Walkathon claims interpolated a populated Mongoose document into
  // referenceId. Those values contain the entire challenge and can make the
  // admin transaction table thousands of pixels wide. Preserve the record,
  // but use its Mongo ID as the safe admin-facing identifier.
  if (
    referenceId.startsWith("WALKATHON-") &&
    referenceId.length > MAX_DISPLAY_REFERENCE_LENGTH
  ) {
    return fallbackId;
  }

  return referenceId;
}

function getAdminTransactionMetadata(transaction) {
  const metadata = { ...(transaction?.metadata || {}) };

  // Legacy Walkathon transactions stored the XP only as `xpEarned` while the
  // admin client formats XP from `finalXp`. Normalize the response so existing
  // claims display their actual reward instead of "0 coins".
  if (metadata.source === "walkathon" && metadata.finalXp == null) {
    metadata.finalXp = metadata.xpEarned ?? 0;
  }

  return metadata;
}

module.exports = {
  buildWalkathonReferenceId,
  getAdminTransactionId,
  getAdminTransactionMetadata,
  getEntityId,
};
