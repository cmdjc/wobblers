import { FNV_OFFSET, fnvUpdate, stable } from "./fnv.js";

const describeArg = (arg) => (arg && typeof arg === "object" ? (arg.description ?? "[object]") : arg);

function makeGradient(kind, args, record) {
  return {
    description: `${kind}(${args.join(",")})`,
    addColorStop: (...stops) => record({ method: "addColorStop", args: stops }),
  };
}

export function makeContext(canvas) {
  canvas.__hash = FNV_OFFSET;
  canvas.__calls = 0;
  const record = (entry) => {
    canvas.__hash = fnvUpdate(canvas.__hash, `${stable(entry)};`);
    canvas.__calls += 1;
  };
  const assigned = new Map();
  const recorder = (name) => (...args) => {
    if (name === "createRadialGradient" || name === "createLinearGradient") {
      record({ method: name, args });
      return makeGradient(name, args, record);
    }
    record({ method: name, args: args.map(describeArg) });
    if (name === "measureText") return { width: String(args[0]).length * 8 };
    return undefined;
  };
  return new Proxy({}, {
    get: (_, name) => (assigned.has(name) ? assigned.get(name) : recorder(name)),
    set: (_, name, value) => {
      assigned.set(name, value);
      record({ set: name, value: describeArg(value) });
      return true;
    },
  });
}

export function installCanvasStub(window) {
  window.HTMLCanvasElement.prototype.getContext = function getContext(type) {
    if (type !== "2d") return null;
    if (!this.__context) {
      this.__context = makeContext(this);
    }
    return this.__context;
  };
}
