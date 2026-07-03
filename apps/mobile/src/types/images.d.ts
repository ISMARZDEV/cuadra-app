// ESM `import x from "./image.png"` typed as the numeric asset ID Metro's require() would give —
// `expo/types` doesn't declare this for the "@/" path-aliased form specifically.
declare module "*.png" {
  const value: number;
  export default value;
}
declare module "*.jpg" {
  const value: number;
  export default value;
}
declare module "*.jpeg" {
  const value: number;
  export default value;
}
