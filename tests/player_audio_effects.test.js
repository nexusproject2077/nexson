const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Node {
  constructor() { this.connections = []; this.gain = { value: 0 }; }
  connect(node) { this.connections.push(node); return node; }
}

class MockAudioContext {
  constructor() { this.destination = new Node(); this.state = 'running'; }
  createMediaElementSource() { return new Node(); }
  createBiquadFilter() { const node = new Node(); node.frequency = { value: 0 }; node.Q = { value: 0 }; return node; }
  createStereoPanner() { const node = new Node(); node.pan = { value: 0 }; return node; }
  createGain() { return new Node(); }
  createPanner() {
    const node = new Node();
    node.positionX = { value: 0 }; node.positionY = { value: 0 }; node.positionZ = { value: 0 };
    return node;
  }
}

let tick;
const sandbox = {
  console, Map, Set, Math, Date, JSON, Promise,
  window: { AudioContext: MockAudioContext, matchMedia: () => ({ matches: false }) },
  document: { querySelectorAll: () => [], getElementById: () => null, body: { classList: { toggle() {} } } },
  navigator: { userAgent: '' },
  Store: { setEqualizer() {} },
  performance: { now: () => 1000 },
  setInterval: callback => { tick = callback; return 1; },
  clearInterval() {},
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('assets/js/player.js', 'utf8') + '\nthis.__player = Player;', sandbox);

const player = sandbox.__player;
player._audioContext = new MockAudioContext();
player._audioNodes = new Map();
player._eqState = { enabled: true, preset: 'flat', bands: [0, 0, 0, 0, 0, 0], spatial: 'off' };
player._connectMediaEffects({});

const nodes = [...player._audioNodes.values()][0];
assert.equal(nodes.filters.length, 6);
assert.equal(nodes.spatialPanner.panningModel, 'HRTF');

player.setEqualizerPreset('bass');
assert.deepEqual(Array.from(nodes.filters, filter => filter.gain.value), [7, 5, 2, 0, -1, -2]);

player.setSpatialMode('3d');
assert.equal(nodes.stereoGain.gain.value, 0);
assert.equal(nodes.spatialGain.gain.value, 1);
tick();
assert.notEqual(nodes.spatialPanner.positionZ.value, 0);

player.setSpatialMode('8d');
assert.equal(nodes.stereoGain.gain.value, 1);
assert.equal(nodes.spatialGain.gain.value, 0);

player.setSpatialMode('off');
assert.equal(nodes.panner.pan.value, 0);

console.log('player audio effects tests passed');
