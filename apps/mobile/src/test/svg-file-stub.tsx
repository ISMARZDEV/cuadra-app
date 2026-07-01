// Stub for `.svg` file imports under vitest — react-native-svg-transformer (which turns them into
// components) doesn't run in the test env. Decorative textures, no queryable content, so null.
export default function SvgFileStub() {
  return null;
}
