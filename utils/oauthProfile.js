function cleanNamePart(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * OAuth providers may omit familyName for mononymous accounts or accounts that
 * keep their surname private. User.lastName is required by the existing schema,
 * so derive a stable non-empty value without rejecting a valid provider login.
 */
function getOAuthNames(profile = {}) {
  const displayName = cleanNamePart(profile.displayName);
  const displayParts = displayName.split(/\s+/).filter(Boolean);
  const providedFirstName = cleanNamePart(profile.name?.givenName);
  const providedLastName = cleanNamePart(profile.name?.familyName);

  const firstName = providedFirstName || displayParts[0] || 'User';

  let inferredLastName = '';
  if (displayName && providedFirstName && displayName.startsWith(`${providedFirstName} `)) {
    inferredLastName = displayName.slice(providedFirstName.length).trim();
  } else if (displayParts.length > 1) {
    inferredLastName = displayParts.slice(1).join(' ');
  }

  return {
    firstName,
    lastName: providedLastName || inferredLastName || 'User'
  };
}

module.exports = { getOAuthNames };
