// Loaded before every unit test (npm test, --import): a test that reaches
// the network fails, so CI never calls IMGW or any other host. Loopback
// stays open (the local Postgres).
import net from "node:net";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const refused = (host) => new Error(`Network is off in unit tests: ${host}`);

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const { hostname } = new URL(input instanceof Request ? input.url : input);
  return LOOPBACK.has(hostname)
    ? realFetch(input, init)
    : Promise.reject(refused(hostname));
};

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const [first, second] = args;
  const { host = "localhost", path } =
    typeof first === "object" && first !== null
      ? first
      : { host: typeof second === "string" ? second : undefined };
  if (!path && !LOOPBACK.has(host)) throw refused(host);
  return connect.apply(this, args);
};
