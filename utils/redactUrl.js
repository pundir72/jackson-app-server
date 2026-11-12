/**
 * Masks shared secrets carried in query strings (e.g. the Adjust callback
 * `token`) before a URL is written to logs, traces or error reports.
 * @module utils/redactUrl
 */

const SECRET_PARAM = /([?&](?:token|secret)=)[^&#]*/gi;

const redactUrl = (url) =>
  typeof url === 'string' ? url.replace(SECRET_PARAM, '$1[REDACTED]') : url;

module.exports = { redactUrl };
