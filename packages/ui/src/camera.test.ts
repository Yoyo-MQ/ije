import { describe, expect, it } from 'vitest';
import { uncoveredCentreOffset } from './camera';

describe('uncoveredCentreOffset', () => {
  it('leaves the centre alone when nothing covers the map', () => {
    expect(uncoveredCentreOffset({ top: 0, right: 0, bottom: 0, left: 0 })).toEqual([0, 0]);
  });

  it('lifts the point into the strip above a bottom sheet', () => {
    // A 724 px map with a 584 px sheet and a 56 px filter row leaves 56–140 visible, centred on 98;
    // the map's own centre is 362, so the point moves up by 264.
    expect(uncoveredCentreOffset({ top: 56, right: 0, bottom: 584, left: 0 })).toEqual([0, -264]);
  });

  it('shifts the point away from a panel covering one side', () => {
    expect(uncoveredCentreOffset({ top: 0, right: 360, bottom: 0, left: 0 })).toEqual([-180, 0]);
  });
});
