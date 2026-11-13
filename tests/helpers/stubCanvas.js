const describeArg = (arg) => (arg && typeof arg === "object" ? (arg.description ?? "[object]") : arg);

function makeGradient(kind, args, log) {
  return {
    description: `${kind}(${args.join(",")})`,
    addColorStop: (...stops) => log.push({ method: "addColorStop", args: stops }),
  };
}

export function makeContext(log) {
  const assigned = new Map();
  const recorder = (name) => (...args) => {
    if (name === "createRadialGradient" || name === "createLinearGradient") {
      log.push({ method: name, args });
      return makeGradient(name, args, log);
    }
    log.push({ method: name, args: args.map(describeArg) });
    if (name === "measureText") return { width: String(args[0]).length * 8 };
    return undefined;
  };
  return new Proxy({}, {
    get: (_, name) => (assigned.has(name) ? assigned.get(name) : recorder(name)),
    set: (_, name, value) => {
      assigned.set(name, value);
      log.push({ set: name, value: describeArg(value) });
      return true;
    },
  });
}

export function installCanvasStub(window) {
  window.HTMLCanvasElement.prototype.getContext = function getContext(type) {
    if (type !== "2d") return null;
    if (!this.__context) {
      this.__log = [];
      this.__context = makeContext(this.__log);
    }
    return this.__context;
  };
}
