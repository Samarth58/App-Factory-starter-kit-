import dns from 'node:dns';

let initialized = false;

export function initDnsFallback(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch {
    // Ignore in environments where custom DNS servers cannot be set
  }

  const origLookup = dns.lookup;
  // Fallback to resolve4 if OS getaddrinfo lookup fails (e.g. intermittent local ISP resolution)
  dns.lookup = (
    hostname: string,
    options: dns.LookupOptions | number | ((...args: unknown[]) => void),
    callback?: (...args: unknown[]) => void,
  ): void => {
    let opts: dns.LookupOptions = {};
    let cb = callback;

    if (typeof options === 'function') {
      cb = options as (...args: unknown[]) => void;
    } else if (typeof options === 'object' && options !== null) {
      opts = options;
    }

    (origLookup as (...args: unknown[]) => void)(
      hostname,
      opts,
      (err: Error | null, address: string | dns.LookupAddress[], family?: number) => {
        if (!err && address) {
          return cb?.(null, address, family);
        }

        dns.resolve4(hostname, (err2, addresses) => {
          if (!err2 && addresses && addresses.length > 0) {
            if (opts.all) {
              return cb?.(
                null,
                addresses.map((a) => ({ address: a, family: 4 })),
              );
            }
            return cb?.(null, addresses[0], 4);
          }
          return cb?.(err, address, family);
        });
      },
    );
  };
}
