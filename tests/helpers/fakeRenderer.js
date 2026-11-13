const ALIASED_POINT_SIZE_RANGE = 0x846d;

export function createFakeRenderer(domElement = null) {
  const calls = [];
  let pixelRatio = 1;
  let target = null;
  const gl = {
    ALIASED_POINT_SIZE_RANGE,
    getParameter: (name) => (name === ALIASED_POINT_SIZE_RANGE ? [1, 1024] : null),
    getExtension: () => null,
  };
  return {
    domElement,
    calls,
    setPixelRatio: (value) => { pixelRatio = value; calls.push({ name: "setPixelRatio", args: [value] }); },
    getPixelRatio: () => pixelRatio,
    setSize: (...args) => calls.push({ name: "setSize", args }),
    setClearColor: (...args) => calls.push({ name: "setClearColor", args: args.map((a) => (typeof a === "number" ? a : String(a))) }),
    setRenderTarget: (next) => { target = next; calls.push({ name: "setRenderTarget", args: [next ? "target" : null] }); },
    getRenderTarget: () => target,
    render: () => calls.push({ name: "render", args: [] }),
    clear: () => calls.push({ name: "clear", args: [] }),
    getContext: () => gl,
  };
}
