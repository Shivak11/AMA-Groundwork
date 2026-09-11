import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reducer, initialState, getStep, summary } from './model.ts';
import type { State } from './model.ts';

function choose(state: State, id?: string): State {
  return reducer(reducer(state, {type: 'select', id: id ?? getStep(state).options[0].id}), {type: 'confirm'});
}
test('cannot confirm without a recognised choice', () => {
  assert.equal(reducer(initialState, {type: 'confirm'}), initialState);
  assert.equal(reducer(initialState, {type: 'select', id: 'invalid'}), initialState);
});
test('all priority routes complete without assuming an AI pilot', () => {
  for (const priority of ['test-candidate', 'process-first', 'gather-evidence']) {
    let state = {...initialState, answers: {}};
    for (let i = 1; i <= 4; i++) state = choose(state);
    state = choose(state, priority);
    const finalOptions = getStep(state).options;
    assert.equal(finalOptions.length, 3);
    for (const option of finalOptions) {
      const complete = choose(state, option.id);
      assert.equal(complete.complete, true);
      assert.equal(Object.keys(complete.answers).length, 6);
      assert.ok(summary(6, complete.answers).detail.includes('No real CVs'));
    }
  }
});
test('editing an earlier answer invalidates every dependent chapter', () => {
  let state: State = {...initialState, answers: {}};
  for (let i = 1; i <= 6; i++) state = choose(state);
  state = reducer(state, {type: 'edit', step: 2});
  assert.equal(state.complete, false);
  assert.equal(state.step, 2);
  assert.deepEqual(Object.keys(state.answers), ['1']);
  assert.ok(state.draftId);
  state = choose(state, 'missing-details');
  state = choose(state);
  assert.equal(getStep(state).options[0].id, 'completeness');
});
test('notes remain literal text and survive confirmation and reopening', () => {
  let state = reducer(initialState, {type: 'note', value: '<script>nothing executes</script>'});
  state = choose(state);
  assert.equal(state.answers[1]?.note, '<script>nothing executes</script>');
  state = reducer(state, {type: 'edit', step: 1});
  assert.equal(state.note, '<script>nothing executes</script>');
  const restored = reducer(initialState, {type: 'restore', state});
  assert.deepEqual(restored, state);
  assert.notEqual(restored, state);
  assert.deepEqual(reducer(state, {type: 'restart'}), initialState);
});
