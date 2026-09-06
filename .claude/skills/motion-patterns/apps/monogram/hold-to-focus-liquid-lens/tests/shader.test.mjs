import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIQUID_LENS_SKSL } from '../src/motion/liquid-lens-shader.ts';
import { lensUniforms } from '../src/motion/model.ts';

const require = createRequire(import.meta.url);
const init = require('canvaskit-wasm');
const kit = await init({ locateFile: () => require.resolve('canvaskit-wasm/bin/canvaskit.wasm') });

test('actual SkSL compiles; invalid shader canary fails', () => {
  const effect = kit.RuntimeEffect.Make(LIQUID_LENS_SKSL);
  assert.ok(effect);
  effect.delete();
  assert.equal(kit.RuntimeEffect.Make('half4 main(float2 xy) { return missing; }', () => {}), null);
});

test('render real shader: rest/reduced identity, lower-region distortion, light/dark', () => {
  for (const dark of [false, true]) {
    const width = 390;
    const height = 844;
    const background = kit.MakeSurface(width, height);
    assert.ok(background);
    const canvas = background.getCanvas();
    canvas.clear(dark ? kit.Color(24, 27, 30) : kit.Color(244, 244, 239));
    const paint = new kit.Paint();
    for (let row = 0; row < 8; row++) {
      const y = 90 + row * 78;
      paint.setColor(dark ? kit.Color(56, 59, 64) : kit.Color(255, 255, 255));
      canvas.drawRRect(kit.RRectXY(kit.XYWHRect(24, y, 342, 66), 10, 10), paint);
      paint.setColor(dark ? kit.Color(205, 210, 215) : kit.Color(62, 64, 67));
      canvas.drawRect(kit.XYWHRect(38, y + 18, 238, 3), paint);
      canvas.drawRect(kit.XYWHRect(38, y + 29, 198, 3), paint);
      canvas.drawRect(kit.XYWHRect(38, y + 40, 260, 3), paint);
    }
    const image = background.makeImageSnapshot();
    const imageShader = image.makeShaderOptions(kit.TileMode.Clamp, kit.TileMode.Clamp, kit.FilterMode.Linear, kit.MipmapMode.None);
    const effect = kit.RuntimeEffect.Make(LIQUID_LENS_SKSL);
    const states = [
      ['rest', 0, 0, false], ['entering', 0.55, 0, false], ['listening', 1, 0, false],
      ['modulated', 1, 1, false], ['withdrawing', 0.35, 0, false], ['reduced', 1, 1, true],
    ];
    let rest;
    for (const [name, progress, pulse, reduced] of states) {
      const u = lensUniforms(width, height, progress, pulse, reduced);
      const veilColor = dark ? [0.12, 0.13, 0.15] : [0.96, 0.96, 0.94];
      const shader = effect.makeShaderWithChildren([
        ...u.size, u.strength, u.boundary, u.bow, u.feather, u.displacement, u.blurRadius, u.veil, ...veilColor,
      ], [imageShader]);
      const surface = kit.MakeSurface(width, height);
      assert.ok(surface);
      paint.setShader(shader);
      surface.getCanvas().drawPaint(paint);
      const snapshot = surface.makeImageSnapshot();
      const pixels = snapshot.readPixels(0, 0, { width, height, colorType: kit.ColorType.RGBA_8888, alphaType: kit.AlphaType.Unpremul, colorSpace: kit.ColorSpace.SRGB });
      assert.ok(pixels);
      if (name === 'rest') rest = pixels;
      if (name === 'reduced') assert.deepEqual(pixels, rest);
      if (name === 'listening') {
        assert.deepEqual(pixels.slice(0, width * 200 * 4), rest.slice(0, width * 200 * 4));
        assert.notDeepEqual(pixels.slice(width * 500 * 4), rest.slice(width * 500 * 4));
      }
      // Optional offscreen snapshots of the shipped shader, not a native RN render.
      if (process.env.LENS_RENDER_DIR) {
        writeFileSync(join(process.env.LENS_RENDER_DIR, `${dark ? 'dark' : 'light'}-${name}.png`), snapshot.encodeToBytes());
      }
      snapshot.delete();
      surface.delete();
      shader.delete();
    }
    paint.delete();
    effect.delete();
    imageShader.delete();
    image.delete();
    background.delete();
  }
});
