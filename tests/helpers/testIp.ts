let ipCounter = 1;

/**
 * Generates a unique, valid IPv4 address in the private 10.x.x.x range for integration tests.
 * This simulates distinct clients to prevent cross-test rate limit collisions while preserving
 * realistic IP-based rate limiting behavior.
 */
export function uniqueTestIp(): string {
  const c = ipCounter++;
  const octet2 = (Math.floor(c / 65025) % 250) + 1;
  const octet3 = (Math.floor(c / 255) % 250) + 1;
  const octet4 = (c % 250) + 1;
  return `10.${octet2}.${octet3}.${octet4}`;
}
