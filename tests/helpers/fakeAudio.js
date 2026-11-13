function makeParam(log, owner, name, initial = 0) {
  const param = { value: initial };
  for (const method of ["setValueAtTime", "linearRampToValueAtTime", "exponentialRampToValueAtTime", "setTargetAtTime"]) {
    param[method] = (...args) => { log.push({ node: owner, param: name, method, args }); return param; };
  }
  return param;
}

function makeNode(log, kind, params) {
  const node = { kind, connect: (target) => { log.push({ node: kind, method: "connect", to: target.kind }); return target; } };
  for (const [name, initial] of Object.entries(params)) node[name] = makeParam(log, kind, name, initial);
  return node;
}

export function createFakeAudioContext(getNow, log) {
  return class FakeAudioContext {
    constructor() {
      this.sampleRate = 8000;
      this.state = "running";
      this.destination = { kind: "destination" };
    }

    get currentTime() { return (getNow() - 1000) / 1000; }

    resume() { this.state = "running"; return Promise.resolve(); }

    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { length, sampleRate, numberOfChannels: channels, getChannelData: (i) => data[i] };
    }

    createOscillator() {
      const node = makeNode(log, "oscillator", { frequency: 440, detune: 0 });
      node.type = "sine";
      node.start = (...args) => log.push({ node: "oscillator", method: "start", args });
      node.stop = (...args) => log.push({ node: "oscillator", method: "stop", args });
      return node;
    }

    createGain() { return makeNode(log, "gain", { gain: 1 }); }

    createBiquadFilter() {
      const node = makeNode(log, "filter", { frequency: 350, Q: 1, gain: 0 });
      node.type = "lowpass";
      return node;
    }

    createBufferSource() {
      const node = makeNode(log, "bufferSource", {});
      node.buffer = null;
      node.start = (...args) => log.push({ node: "bufferSource", method: "start", args });
      node.stop = (...args) => log.push({ node: "bufferSource", method: "stop", args });
      return node;
    }
  };
}
