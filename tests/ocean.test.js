import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanSound } from '../public/js/ocean.js';

function audioContext() {
  const context = { state: 'suspended', currentTime: 0, sampleRate: 200, destination: {}, sources: [], suspendCount: 0 };
  const parameter = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; }, linearRampToValueAtTime(value) { this.value = value; } });
  const node = () => ({ connect() {}, start() {} });
  context.createGain = () => ({ ...node(), gain: parameter() });
  context.createBiquadFilter = () => ({ ...node(), frequency: parameter(), Q: parameter() });
  context.createOscillator = () => ({ ...node(), frequency: parameter() });
  context.createBuffer = (channels, length) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { getChannelData: (channel) => data[channel] };
  };
  context.createBufferSource = () => {
    const source = { ...node() };
    context.sources.push(source);
    return source;
  };
  context.resume = async () => { context.state = 'running'; };
  context.suspend = async () => { context.state = 'suspended'; context.suspendCount++; };
  return context;
}

test('ocean stays silent until requested, reuses audio and suspends when switched off', async () => {
  let created = 0;
  const context = audioContext();
  const ocean = new OceanSound(() => { created++; return context; });
  ocean.setVolume(0.6);
  assert.equal(created, 0, 'Moving volume must not start audio');
  await ocean.setPlaying(true);
  assert.equal(ocean.playing, true);
  assert.equal(context.sources.length, 1);
  assert.equal(context.sources[0].loopStart, 0.2);
  const samples = context.sources[0].buffer.getChannelData(0);
  assert.ok(samples.every(Number.isFinite));
  assert.ok(samples.some((value) => value !== 0));
  assert.ok(Math.abs(samples.at(-1) - samples[40]) < 0.15, 'Loop crossfade must join smoothly');
  ocean.setVolume(0);
  assert.equal(ocean.master.gain.value, 0, 'Zero volume must mute');
  await ocean.setPlaying(false);
  await ocean.setPlaying(true);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(context.state, 'running', 'A previous off timer must not interrupt resumed audio');
  assert.equal(created, 1, 'Toggling must not create overlapping audio contexts');
  assert.equal(context.sources.length, 1);
  await ocean.setPlaying(false);
  assert.equal(ocean.master.gain.value, 0);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(context.state, 'suspended');
});

test('failed playback leaves the ocean off and can be retried', async () => {
  const context = audioContext();
  context.resume = async () => { throw new Error('Playback denied'); };
  const ocean = new OceanSound(() => context);
  await assert.rejects(ocean.setPlaying(true));
  assert.equal(ocean.playing, false);
  assert.equal(ocean.master.gain.value, 0);
  context.resume = async () => { context.state = 'running'; };
  await ocean.setPlaying(true);
  assert.equal(ocean.playing, true);
  await ocean.setPlaying(false);
});


test('switching off during a pending audio resume cannot start playback later', async () => {
  const context = audioContext();
  let finishResume;
  context.resume = () => new Promise((resolve) => { finishResume = () => { context.state = 'running'; resolve(); }; });
  const ocean = new OceanSound(() => context);
  const starting = ocean.setPlaying(true);
  await ocean.setPlaying(false);
  finishResume();
  await starting;
  assert.equal(ocean.playing, false);
  assert.equal(ocean.master.gain.value, 0);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(context.state, 'suspended');
});
