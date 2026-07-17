/**
 * shared.js — constants shared by detect.js and crawl.js so staging-host
 * logic can't drift between scripts.
 */

// Hostname-level staging signals. Test against a hostname, not a full URL.
export const STAGING_HOST_RX =
  /(\.webflow\.io|\.vercel\.app|\.netlify\.app|\.pages\.dev)$|^(staging|dev|preview|test)\./i;

export const isStagingHost = (hostname) => STAGING_HOST_RX.test(hostname);

export const UA_HEADERS = {
  "user-agent": "review-site-skill/1.0 (+https://krishnesh.com)",
};
